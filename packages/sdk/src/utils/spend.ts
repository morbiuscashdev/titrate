import type { StoredBatch } from '../storage/index.js';

export type SpendReport = {
  readonly totalGasEstimate: bigint;
  readonly totalTokensSent: bigint;
  readonly uniqueRecipients: number;
  readonly batchCount: number;
  readonly confirmedBatches: number;
  readonly failedBatches: number;
};

/**
 * Aggregates completed batches into a spend report.
 * Amounts are stored as strings in StoredBatch; this function parses them to bigint for summation.
 * Gas is approximated from confirmed attempt gas estimates.
 */
export function aggregateSpendReport(batches: readonly StoredBatch[]): SpendReport {
  const recipientSet = new Set<string>();
  let totalGasEstimate = 0n;
  let totalTokensSent = 0n;
  let confirmedBatches = 0;
  let failedBatches = 0;

  for (const batch of batches) {
    if (batch.status === 'confirmed') {
      confirmedBatches++;
      for (const addr of batch.recipients) {
        recipientSet.add(addr.toLowerCase());
      }
      for (const amount of batch.amounts) {
        totalTokensSent += BigInt(amount);
      }
      for (const attempt of batch.attempts) {
        if (attempt.outcome === 'confirmed') {
          totalGasEstimate += attempt.gasEstimate;
        }
      }
    } else {
      failedBatches++;
    }
  }

  return {
    totalGasEstimate,
    totalTokensSent,
    uniqueRecipients: recipientSet.size,
    batchCount: batches.length,
    confirmedBatches,
    failedBatches,
  };
}
