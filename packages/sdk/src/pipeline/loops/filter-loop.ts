import type { PublicClient } from 'viem';
import type {
  PipelineConfig,
  PipelineStep,
  PipelineCursor,
  LoopErrorEntry,
} from '../../types.js';
import type { EventBus } from './event-bus.js';
import type { ControlSignal } from './control-signal.js';
import type { LoopHandle, LoopStatus } from './types.js';
import { createFilter } from '../filters.js';

type Row = { address: string; amount: string | null };

export type ApplyFilterChainFn = (
  row: Row,
  steps: readonly PipelineStep[],
  client: PublicClient,
) => Promise<boolean>;

export type FilterLoopDeps = {
  readonly publicClient: PublicClient;
  readonly storage: {
    readonly addresses: { readFrom(offset: number): AsyncIterable<Row> };
    readonly filtered: { append(rows: readonly Row[]): Promise<void> };
    readonly cursor: {
      read(): Promise<PipelineCursor>;
      update(patch: Partial<PipelineCursor>): Promise<void>;
    };
    readonly errors: { append(entry: LoopErrorEntry): Promise<void> };
  };
  readonly pipeline: PipelineConfig;
  readonly bus: EventBus;
  readonly control: ControlSignal;
  readonly scannerCompleted: () => boolean;
  readonly applyFilterChain?: ApplyFilterChainFn;
};

const defaultApplyFilterChain: ApplyFilterChainFn = async (row, steps, client) => {
  for (const step of steps) {
    if (step.type !== 'filter') continue;
    const executor = createFilter(step.filterType, step.params);
    const result = await executor(new Set([row.address as `0x${string}`]), client);
    if (result.size === 0) return false;
  }
  return true;
};

export function createFilterLoop(deps: FilterLoopDeps): LoopHandle {
  const {
    publicClient, storage, pipeline, bus, control,
    scannerCompleted,
    applyFilterChain = defaultApplyFilterChain,
  } = deps;

  const filterSteps = pipeline.steps.slice(1);
  let status: LoopStatus = 'idle';
  let stopping = false;
  let driverPromise: Promise<void> | null = null;

  async function driver(): Promise<void> {
    while (!stopping) {
      // pause check
      if (control.get().filter === 'paused') {
        status = 'paused';
        await control.waitForResume('filter');
        if (stopping) break;
        status = 'running';
        continue;
      }

      // drain stream starting at current watermark
      const startCursor = await storage.cursor.read();
      let watermark = startCursor.filter.watermark;
      let qualified = startCursor.filter.qualifiedCount;

      for await (const row of storage.addresses.readFrom(watermark)) {
        if (stopping) break;
        if (control.get().filter === 'paused') break;

        let passed = false;
        try {
          passed = await applyFilterChain(row, filterSteps, publicClient);
        } catch (err) {
          const e = err as Error;
          await storage.errors.append({
            timestamp: Date.now(),
            loop: 'filter',
            phase: 'apply-filter',
            message: e.message ?? String(err),
            stack: e.stack,
            context: { address: row.address },
          });
          // treat as failed — don't promote to filtered
          passed = false;
        }

        if (passed) {
          await storage.filtered.append([row]);
          qualified += 1;
        }

        watermark += 1;
        await storage.cursor.update({
          filter: { watermark, qualifiedCount: qualified },
        });
      }

      if (stopping) break;
      bus.emit('filter-progressed');

      // Check completion: scanner done and watermark caught up to addressCount
      if (control.get().filter !== 'paused' && scannerCompleted()) {
        const afterCursor = await storage.cursor.read();
        if (afterCursor.filter.watermark >= afterCursor.scan.addressCount) {
          // Emit a final filter-progressed to wake the distributor before
          // transitioning to 'completed', so the distributor's once() resolves.
          bus.emit('filter-progressed');
          status = 'completed';
          bus.emit('completed');
          return;
        }
      }

      // Wait for more data or pipeline change
      await bus.once('scan-progressed', 'pipeline-changed');
    }
  }

  return {
    async start() {
      if (driverPromise) return;
      stopping = false;
      status = 'running';
      driverPromise = driver()
        .catch((err) => {
          console.error('[filter-loop] driver threw:', err);
        })
        .finally(() => {
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
      if (status !== 'completed' && status !== 'errored') {
        status = 'idle';
      }
    },

    status: () => status,

    on: (event, handler) => bus.on(event, handler),
  };
}
