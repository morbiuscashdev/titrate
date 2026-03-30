import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { BatchStore, StoredBatch } from '@titrate/sdk';
import type { Address, Hex } from 'viem';

type SerializedBatchAttempt = {
  readonly txHash: Hex;
  readonly nonce: number;
  readonly gasEstimate: string;
  readonly maxFeePerGas: string;
  readonly maxPriorityFeePerGas: string;
  readonly timestamp: number;
  readonly outcome: 'confirmed' | 'replaced' | 'reverted' | 'dropped';
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

function deserialize(raw: SerializedBatch): StoredBatch {
  return {
    ...raw,
    confirmedBlock: raw.confirmedBlock !== null ? BigInt(raw.confirmedBlock) : null,
    attempts: raw.attempts.map((a) => ({
      ...a,
      gasEstimate: BigInt(a.gasEstimate),
      maxFeePerGas: BigInt(a.maxFeePerGas),
      maxPriorityFeePerGas: BigInt(a.maxPriorityFeePerGas),
    })),
  };
}

/**
 * Creates a BatchStore that persists each batch as a JSON file under
 * `{baseDir}/batches/{id}.json`. BigInt fields are serialized as strings.
 */
export function createBatchStore(baseDir: string): BatchStore {
  const dir = join(baseDir, 'batches');

  async function ensureDir(): Promise<void> {
    await mkdir(dir, { recursive: true });
  }

  async function get(id: string): Promise<StoredBatch | null> {
    await ensureDir();
    try {
      const raw = await readFile(join(dir, `${id}.json`), 'utf8');
      return deserialize(JSON.parse(raw) as SerializedBatch);
    } catch {
      return null;
    }
  }

  async function getByCampaign(campaignId: string): Promise<readonly StoredBatch[]> {
    await ensureDir();
    const files = await readdir(dir);
    const batches = await Promise.all(
      files
        .filter((f) => f.endsWith('.json'))
        .map(async (f) => {
          const raw = await readFile(join(dir, f), 'utf8');
          return deserialize(JSON.parse(raw) as SerializedBatch);
        }),
    );
    return batches.filter((b) => b.campaignId === campaignId);
  }

  async function put(batch: StoredBatch): Promise<void> {
    await ensureDir();
    const data = JSON.stringify(serialize(batch), null, 2);
    await writeFile(join(dir, `${batch.id}.json`), data, 'utf8');
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
