import type { Address, Hex, PublicClient } from 'viem';
import type { BatchRecord } from '../../storage/index.js';

export type ReconcileDecision =
  | {
      readonly kind: 'confirmed';
      readonly batchIndex: number;
      readonly txHash: Hex;
      readonly blockNumber: bigint;
    }
  | {
      readonly kind: 'pending';
      readonly batchIndex: number;
      readonly txHash: Hex;
    }
  | {
      readonly kind: 'intervention';
      readonly batchIndex: number;
      readonly point:
        | 'reconcile-reverted'
        | 'reconcile-replaced-externally'
        | 'reconcile-dropped'
        | 'reconcile-state-unknown';
      readonly txHash: Hex;
      readonly replacementTxHash?: Hex;
    };

export type ReconcileInput = {
  readonly client: PublicClient;
  readonly batches: readonly BatchRecord[];
  readonly walletAddress?: Address;
  readonly externalReplacementDetector?: (batch: BatchRecord) => Promise<{
    detected: boolean;
    replacementTxHash?: Hex;
  }>;
};

export async function reconcileBatches(input: ReconcileInput): Promise<readonly ReconcileDecision[]> {
  const { client, batches, walletAddress, externalReplacementDetector } = input;
  const out: ReconcileDecision[] = [];

  for (const batch of batches) {
    if (batch.status !== 'broadcast') continue;
    const attempt = batch.attempts[batch.attempts.length - 1];
    if (!attempt) continue;
    const txHash = attempt.txHash;

    let receipt: Awaited<ReturnType<PublicClient['getTransactionReceipt']>> | null = null;
    try {
      receipt = await client.getTransactionReceipt({ hash: txHash });
    } catch {
      out.push({
        kind: 'intervention',
        batchIndex: batch.batchIndex,
        point: 'reconcile-state-unknown',
        txHash,
      });
      continue;
    }

    if (receipt && receipt.status === 'success') {
      out.push({
        kind: 'confirmed',
        batchIndex: batch.batchIndex,
        txHash,
        blockNumber: receipt.blockNumber,
      });
      continue;
    }

    if (receipt && receipt.status === 'reverted') {
      out.push({
        kind: 'intervention',
        batchIndex: batch.batchIndex,
        point: 'reconcile-reverted',
        txHash,
      });
      continue;
    }

    // No receipt — external replacement takes precedence.
    if (externalReplacementDetector) {
      const ext = await externalReplacementDetector(batch);
      if (ext.detected) {
        out.push({
          kind: 'intervention',
          batchIndex: batch.batchIndex,
          point: 'reconcile-replaced-externally',
          txHash,
          ...(ext.replacementTxHash ? { replacementTxHash: ext.replacementTxHash } : {}),
        });
        continue;
      }
    }

    // Check mempool.
    let tx: unknown = null;
    try {
      tx = await client.getTransaction({ hash: txHash });
    } catch { /* fall through */ }

    if (tx !== null) {
      out.push({ kind: 'pending', batchIndex: batch.batchIndex, txHash });
      continue;
    }

    // Check nonce to distinguish dropped from state-unknown.
    if (walletAddress) {
      try {
        const currentNonce = await client.getTransactionCount({
          address: walletAddress,
          blockTag: 'latest',
        });
        if (currentNonce > attempt.nonce) {
          out.push({
            kind: 'intervention',
            batchIndex: batch.batchIndex,
            point: 'reconcile-dropped',
            txHash,
          });
          continue;
        }
      } catch { /* fall through */ }
    }

    out.push({
      kind: 'intervention',
      batchIndex: batch.batchIndex,
      point: 'reconcile-state-unknown',
      txHash,
    });
  }

  return out;
}
