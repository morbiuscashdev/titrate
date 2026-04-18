import type { BatchAttempt, BatchAttemptRecord } from '../types.js';

export function batchAttemptToRecord(
  attempt: BatchAttempt,
  extras: { confirmedBlock?: bigint | null; reason?: string } = {},
): BatchAttemptRecord {
  return {
    txHash: attempt.txHash,
    nonce: attempt.nonce,
    maxFeePerGas: attempt.maxFeePerGas.toString(),
    maxPriorityFeePerGas: attempt.maxPriorityFeePerGas.toString(),
    broadcastAt: attempt.timestamp,
    outcome: attempt.outcome,
    confirmedBlock:
      extras.confirmedBlock === undefined
        ? null
        : extras.confirmedBlock === null
          ? null
          : extras.confirmedBlock.toString(),
    ...(extras.reason !== undefined ? { reason: extras.reason } : {}),
  };
}

export function batchAttemptFromRecord(record: BatchAttemptRecord): BatchAttempt {
  return {
    txHash: record.txHash,
    nonce: record.nonce,
    gasEstimate: 0n, // unknown — stored form does not retain gasEstimate
    maxFeePerGas: BigInt(record.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(record.maxPriorityFeePerGas),
    timestamp: record.broadcastAt,
    outcome: record.outcome,
  };
}
