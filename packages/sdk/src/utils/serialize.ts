import type { BatchResult } from '../types.js';

/**
 * Converts BatchResult[] to a JSON-serializable format.
 * All bigint fields (amounts, blockNumber, gas values) become strings.
 */
export function serializeBatchResults(results: readonly BatchResult[]): unknown {
  return results.map((r) => ({
    ...r,
    amounts: r.amounts.map((a) => a.toString()),
    blockNumber: r.blockNumber !== null ? r.blockNumber.toString() : null,
    attempts: r.attempts.map((a) => ({
      ...a,
      gasEstimate: a.gasEstimate.toString(),
      maxFeePerGas: a.maxFeePerGas.toString(),
      maxPriorityFeePerGas: a.maxPriorityFeePerGas.toString(),
    })),
  }));
}
