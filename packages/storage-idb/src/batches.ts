import type { Address, Hex } from 'viem';
import type { BatchAttemptOutcome, BatchStore, StoredBatch } from '@titrate/sdk';
import type { TitrateDB } from './db.js';

type SerializedBatchAttempt = {
  readonly txHash: Hex;
  readonly nonce: number;
  readonly gasEstimate: string;
  readonly maxFeePerGas: string;
  readonly maxPriorityFeePerGas: string;
  readonly timestamp: number;
  readonly outcome: BatchAttemptOutcome;
};

type SerializedBatch = Omit<StoredBatch, 'confirmedBlock' | 'amounts' | 'recipients' | 'attempts'> & {
  readonly confirmedBlock: string | null;
  readonly amounts: readonly string[];
  readonly recipients: readonly Address[];
  readonly attempts: readonly SerializedBatchAttempt[];
};

function serialize(batch: StoredBatch): SerializedBatch {
  return {
    ...batch,
    confirmedBlock: batch.confirmedBlock !== null ? batch.confirmedBlock.toString() : null,
    attempts: batch.attempts.map((a) => ({
      ...a,
      gasEstimate: a.gasEstimate.toString(),
      maxFeePerGas: a.maxFeePerGas.toString(),
      maxPriorityFeePerGas: a.maxPriorityFeePerGas.toString(),
    })),
  };
}

function deserialize(raw: Record<string, unknown>): StoredBatch {
  const serialized = raw as SerializedBatch;
  return {
    ...serialized,
    confirmedBlock: serialized.confirmedBlock !== null ? BigInt(serialized.confirmedBlock) : null,
    attempts: serialized.attempts.map((a) => ({
      ...a,
      gasEstimate: BigInt(a.gasEstimate),
      maxFeePerGas: BigInt(a.maxFeePerGas),
      maxPriorityFeePerGas: BigInt(a.maxPriorityFeePerGas),
    })),
  };
}

/**
 * Creates a BatchStore backed by the 'batches' object store in IDB.
 * BigInt fields (confirmedBlock, gasEstimate, fee fields) are serialized
 * to strings because IDB structured clone does not support BigInt.
 *
 * @param db - Open TitrateDB handle
 * @returns BatchStore implementation
 */
export function createBatchStore(db: TitrateDB): BatchStore {
  async function get(id: string): Promise<StoredBatch | null> {
    const data = await db.get('batches', id);
    return data ? deserialize(data) : null;
  }

  async function getByCampaign(campaignId: string): Promise<readonly StoredBatch[]> {
    const all = await db.getAllFromIndex('batches', 'byCampaign', campaignId);
    return all.map(deserialize);
  }

  async function put(batch: StoredBatch): Promise<void> {
    await db.put('batches', serialize(batch) as unknown as Record<string, unknown>);
  }

  async function getLastCompleted(campaignId: string): Promise<StoredBatch | null> {
    const batches = await getByCampaign(campaignId);
    const confirmed = batches.filter((b) => b.status === 'confirmed');
    if (confirmed.length === 0) return null;
    return confirmed.reduce((highest, b) =>
      b.batchIndex > highest.batchIndex ? b : highest,
    );
  }

  return { get, getByCampaign, put, getLastCompleted };
}
