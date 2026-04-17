import type { Address, PublicClient } from 'viem';
import type {
  CampaignManifest, BatchAttempt, BatchAttemptRecord, LoopErrorEntry, PipelineCursor,
} from '../../types.js';
import type { BatchRecord } from '../../storage/index.js';
import type { EventBus } from './event-bus.js';
import type { ControlSignal } from './control-signal.js';
import type { LoopHandle, LoopStatus } from './types.js';
import type { InterventionAction, InterventionContext } from '../../intervention/types.js';
import { reconcileBatches } from './reconcile.js';
import { computeDrainStatus } from './drain.js';
import { selectWallet } from './wallet-select.js';
import { batchAttemptToRecord } from '../../utils/batch-attempt.js';

export type DisperseFn = (args: {
  readonly recipients: readonly Address[];
  readonly amounts: readonly bigint[];
  readonly wallet: Address;
  readonly publicClient: PublicClient;
}) => Promise<BatchAttempt>;

export type DistributorLoopDeps = {
  readonly publicClient: PublicClient;
  readonly storage: {
    readonly filtered: {
      readFrom(offset: number): AsyncIterable<{ address: string; amount: string | null }>;
      count?(): Promise<number>;
    };
    readonly batches: {
      readAll(): Promise<readonly BatchRecord[]>;
      append(records: readonly BatchRecord[]): Promise<void>;
    };
    readonly cursor: {
      read(): Promise<PipelineCursor>;
      update(patch: Partial<PipelineCursor>): Promise<void>;
    };
    readonly errors: { append(entry: LoopErrorEntry): Promise<void> };
  };
  readonly walletPool: readonly Address[];
  readonly manifest: CampaignManifest;
  readonly bus: EventBus;
  readonly control: ControlSignal;
  readonly scannerCompleted: () => boolean;
  readonly filterCompleted: () => boolean;
  readonly disperse: DisperseFn;
  readonly interventionHook: (ctx: InterventionContext) => Promise<InterventionAction>;
  readonly getBalances: (addresses: readonly Address[]) => Promise<ReadonlyMap<Address, bigint>>;
  readonly minWalletBalance?: bigint;
};

const DEFAULT_MIN_WALLET_BALANCE = 10n ** 15n;

export function createDistributorLoop(deps: DistributorLoopDeps): LoopHandle {
  const {
    publicClient, storage, walletPool, manifest, bus, control,
    scannerCompleted, filterCompleted, disperse, interventionHook, getBalances,
    minWalletBalance = DEFAULT_MIN_WALLET_BALANCE,
  } = deps;

  let status: LoopStatus = 'idle';
  let stopping = false;
  let driverPromise: Promise<void> | null = null;
  let lastWalletIndex = -1;

  async function runReconciliation(): Promise<void> {
    const allBatchesRaw = await storage.batches.readAll();
    // JSONL is append-only; deduplicate keeping the latest record per batchIndex.
    const latestByIndex = new Map<number, BatchRecord>();
    for (const b of allBatchesRaw) latestByIndex.set(b.batchIndex, b);
    const allBatches = [...latestByIndex.values()];
    const walletAddress = walletPool[0];
    const decisions = await reconcileBatches({
      client: publicClient,
      batches: allBatches,
      walletAddress,
    });

    for (const decision of decisions) {
      if (decision.kind === 'confirmed') {
        const original = allBatches.find((b) => b.batchIndex === decision.batchIndex);
        if (!original) continue;
        await storage.batches.append([{
          ...original,
          status: 'confirmed',
          confirmedTxHash: decision.txHash,
          confirmedBlock: decision.blockNumber.toString(),
        }]);
      } else if (decision.kind === 'intervention') {
        await interventionHook({
          point: decision.point as unknown as InterventionContext['point'],
          campaignId: manifest.id ?? '',
          batchIndex: decision.batchIndex,
          txHash: decision.txHash,
        });
      }
      // 'pending' → background monitor: no-op in 2b
    }

    bus.emit('reconciliation-complete');
  }

  async function pickWallet(): Promise<Address | null> {
    const balances = await getBalances(walletPool);
    const result = selectWallet({
      wallets: walletPool,
      lastIndex: lastWalletIndex,
      balances,
      minBalance: minWalletBalance,
    });
    if (!result) return null;
    lastWalletIndex = result.index;
    return result.address;
  }

  async function buildBatch(watermark: number, size: number): Promise<{
    recipients: Address[];
    amounts: bigint[];
    count: number;
  }> {
    const recipients: Address[] = [];
    const amounts: bigint[] = [];
    for await (const row of storage.filtered.readFrom(watermark)) {
      recipients.push(row.address as Address);
      amounts.push(row.amount === null ? 0n : BigInt(row.amount));
      if (recipients.length >= size) break;
    }
    return { recipients, amounts, count: recipients.length };
  }

  async function driver(): Promise<void> {
    await runReconciliation();

    while (!stopping) {
      if (control.get().distribute === 'paused') {
        status = 'paused';
        await control.waitForResume('distribute');
        if (stopping) break;
        status = 'running';
        continue;
      }

      const cursor = await storage.cursor.read();
      const available = cursor.filter.qualifiedCount - cursor.distribute.watermark;
      const allBatchesRaw = await storage.batches.readAll();
      // JSONL is append-only; keep the latest record per batchIndex.
      const latestByIndex = new Map<number, BatchRecord>();
      for (const b of allBatchesRaw) latestByIndex.set(b.batchIndex, b);
      const allBatches = [...latestByIndex.values()];
      const batchesAllConfirmed = allBatches.every((b) => b.status === 'confirmed');

      const drain = computeDrainStatus({
        scannerCompleted: scannerCompleted(),
        filterCompleted: filterCompleted(),
        qualifiedCount: cursor.filter.qualifiedCount,
        distributeWatermark: cursor.distribute.watermark,
        batchesAllConfirmed,
      });

      if (drain === 'drained') {
        status = 'completed';
        bus.emit('completed');
        return;
      }

      if (available <= 0) {
        await bus.once('filter-progressed', 'pipeline-changed');
        continue;
      }

      // Drain-tail: if scanner+filter both done AND 0 < available < batchSize,
      // flush the partial batch rather than waiting indefinitely.
      const drainTail = scannerCompleted() && filterCompleted() && available < manifest.batchSize;
      if (!drainTail && available < manifest.batchSize) {
        await bus.once('filter-progressed', 'pipeline-changed');
        continue;
      }

      const batchSize = Math.min(available, manifest.batchSize);
      const { recipients, amounts, count } = await buildBatch(cursor.distribute.watermark, batchSize);

      if (count === 0) {
        await bus.once('filter-progressed', 'pipeline-changed');
        continue;
      }

      const wallet = await pickWallet();
      if (wallet === null) {
        await storage.errors.append({
          timestamp: Date.now(),
          loop: 'distributor',
          phase: 'select-wallet',
          message: 'no wallet has sufficient balance',
        });
        status = 'errored';
        bus.emit('errored');
        return;
      }

      let attempt: BatchAttempt;
      try {
        attempt = await disperse({ recipients, amounts, wallet, publicClient });
      } catch (err) {
        const e = err as Error;
        await storage.errors.append({
          timestamp: Date.now(),
          loop: 'distributor',
          phase: 'disperse',
          message: e.message ?? String(err),
          stack: e.stack,
        });
        status = 'errored';
        bus.emit('errored');
        return;
      }

      if (attempt.outcome === 'dropped') {
        await storage.errors.append({
          timestamp: Date.now(),
          loop: 'distributor',
          phase: 'disperse',
          message: 'attempt returned outcome=dropped',
        });
        status = 'errored';
        bus.emit('errored');
        return;
      }

      const attemptRecord: BatchAttemptRecord = batchAttemptToRecord(attempt, { confirmedBlock: null });
      const batchIndex = Math.floor(cursor.distribute.watermark / manifest.batchSize);
      const record: BatchRecord = {
        batchIndex,
        recipients,
        amounts: amounts.map((a) => a.toString()),
        status: attempt.outcome === 'confirmed' ? 'confirmed' : 'broadcast',
        attempts: [attemptRecord],
        confirmedTxHash: attempt.outcome === 'confirmed' ? attempt.txHash : null,
        confirmedBlock: null,
        createdAt: Date.now(),
      };
      await storage.batches.append([record]);

      const newWatermark = cursor.distribute.watermark + count;
      const newConfirmedCount = attempt.outcome === 'confirmed'
        ? cursor.distribute.confirmedCount + count
        : cursor.distribute.confirmedCount;
      await storage.cursor.update({
        distribute: { watermark: newWatermark, confirmedCount: newConfirmedCount },
      });
      bus.emit('distribute-progressed');
    }
  }

  return {
    async start() {
      if (driverPromise) return;
      stopping = false;
      status = 'running';
      driverPromise = driver()
        .catch((err) => {
          console.error('[distributor-loop] driver threw:', err);
        })
        .finally(() => {
          if (status === 'running' || status === 'paused') status = 'idle';
        });
    },

    async stop() {
      stopping = true;
      if (driverPromise) {
        await driverPromise;
        driverPromise = null;
      }
      if (status !== 'completed' && status !== 'errored') status = 'idle';
    },

    status: () => status,

    on: (event, handler) => bus.on(event, handler),
  };
}
