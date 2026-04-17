import type { Address, PublicClient } from 'viem';
import type {
  CampaignManifest,
  PipelineConfig,
  PipelineStep,
  PipelineCursor,
  LoopErrorEntry,
} from '../../types.js';
import type { EventBus } from './event-bus.js';
import type { ControlSignal } from './control-signal.js';
import type { LoopHandle, LoopStatus } from './types.js';

export type RunSourceFn = (
  step: PipelineStep,
  block: bigint,
  client: PublicClient,
) => Promise<readonly Address[]>;

export type ScannerLoopDeps = {
  readonly publicClient: PublicClient;
  readonly storage: {
    readonly addresses: {
      append(rows: readonly { address: string; amount: string | null }[]): Promise<void>;
    };
    readonly cursor: {
      read(): Promise<PipelineCursor>;
      update(patch: Partial<PipelineCursor>): Promise<void>;
    };
    readonly errors: {
      append(entry: LoopErrorEntry): Promise<void>;
    };
  };
  readonly manifest: CampaignManifest;
  readonly pipeline: PipelineConfig;
  readonly bus: EventBus;
  readonly control: ControlSignal;
  readonly chainBlockTimeMs?: number;
  readonly runSource?: RunSourceFn;
  readonly sleep?: (ms: number) => Promise<void>;
};

const DEFAULT_CHAIN_BLOCK_TIME_MS = 12_000;
const BACKOFF_MS = [100, 400, 1600, 6400, 25_600];

const defaultRunSource: RunSourceFn = async (_step, _block, _client) => {
  // Default: empty. Tests override with a stub; production path uses scanner/blocks.ts.
  return [];
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createScannerLoop(deps: ScannerLoopDeps): LoopHandle {
  const {
    publicClient, storage, manifest, pipeline, bus, control,
    chainBlockTimeMs = DEFAULT_CHAIN_BLOCK_TIME_MS,
    runSource = defaultRunSource,
    sleep = defaultSleep,
  } = deps;

  let status: LoopStatus = 'idle';
  let stopping = false;
  let driverPromise: Promise<void> | null = null;

  async function withBackoff<T>(
    fn: () => Promise<T>,
    phase: string,
    context?: Record<string, unknown>,
  ): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < BACKOFF_MS.length; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const e = err as Error;
        await storage.errors.append({
          timestamp: Date.now(),
          loop: 'scanner',
          phase,
          message: e.message ?? String(err),
          stack: e.stack,
          ...(context !== undefined ? { context } : {}),
        });
        if (attempt < BACKOFF_MS.length - 1) {
          await sleep(BACKOFF_MS[attempt]);
        }
      }
    }
    status = 'errored';
    bus.emit('errored');
    throw lastErr;
  }

  async function driver(): Promise<void> {
    const firstStep = pipeline.steps[0];
    if (!firstStep || firstStep.type !== 'source' || firstStep.sourceType !== 'block-scan') {
      status = 'completed';
      bus.emit('completed');
      return;
    }

    while (!stopping) {
      // Pause check
      if (control.get().scan === 'paused') {
        status = 'paused';
        await control.waitForResume('scan');
        if (stopping) break;
        status = 'running';
        continue;
      }

      // Fetch chain head with retry/backoff
      let latest: bigint;
      try {
        latest = await withBackoff(() => publicClient.getBlockNumber(), 'getBlockNumber');
      } catch {
        return; // error already logged + 'errored' emitted
      }

      const endBlock = manifest.endBlock;
      const target = endBlock === null ? latest : (endBlock < latest ? endBlock : latest);

      const cursor = await storage.cursor.read();

      // Respect manifest.startBlock: if cursor hasn't reached startBlock yet,
      // fast-forward to it. This handles the fresh-cursor (lastBlock: 0n) case.
      const startBlock = manifest.startBlock;
      const effectiveLastBlock =
        startBlock !== null && cursor.scan.lastBlock < startBlock - 1n
          ? startBlock - 1n
          : cursor.scan.lastBlock;

      if (effectiveLastBlock >= target) {
        if (endBlock !== null) {
          // Set status before emitting so downstream 'completed' handlers see
          // the final status immediately. Then emit pipeline-changed to wake
          // any filter/distributor loops waiting on bus.once(), followed by
          // 'completed' to signal the scan stage is done.
          status = 'completed';
          bus.emit('pipeline-changed');
          bus.emit('completed');
          return;
        }
        await sleep(chainBlockTimeMs);
        continue;
      }

      // Scan each block in the range
      let block = effectiveLastBlock + 1n;
      while (block <= target && !stopping) {
        if (control.get().scan === 'paused') break;

        let rows: readonly Address[];
        try {
          rows = await withBackoff(
            () => runSource(firstStep, block, publicClient),
            'scan-block',
            { block: block.toString() },
          );
        } catch {
          return;
        }

        if (rows.length > 0) {
          await storage.addresses.append(
            rows.map((address) => ({ address, amount: null })),
          );
        }

        const prev = await storage.cursor.read();
        await storage.cursor.update({
          scan: {
            lastBlock: block,
            addressCount: prev.scan.addressCount + rows.length,
          },
        });
        // Ordering rule: write to disk FIRST, then emit
        bus.emit('scan-progressed');
        block += 1n;
      }
    }
  }

  return {
    async start() {
      if (driverPromise) return;
      stopping = false;
      status = 'running';
      driverPromise = driver()
        .catch((err) => {
          // driver should have already set status to 'errored' and emitted.
          console.error('[scanner-loop] driver threw:', err);
        })
        .finally(() => {
          // If we exited without being stopped or erroring or completing, return to idle.
          if (status === 'running' || status === 'paused') {
            status = 'idle';
          }
        });
    },

    async stop() {
      stopping = true;
      if (driverPromise) {
        await driverPromise;
        driverPromise = null;
      }
      status = 'idle';
    },

    status: () => status,

    on: (event, handler) => bus.on(event, handler),
  };
}
