import type { StoredBatch } from '../storage/index.js';

/**
 * Computes how many recipients to skip when resuming a distribution.
 * Counts confirmed batches and multiplies by batch size.
 */
export function computeResumeOffset(
  batches: readonly StoredBatch[],
  batchSize: number,
): number {
  const confirmedCount = batches.filter((b) => b.status === 'confirmed').length;
  return confirmedCount * batchSize;
}

/**
 * Slices a variable-amounts array to align with resumed recipients.
 * Returns `count` amounts starting at `offset`. Out-of-bounds indices yield 0n.
 */
export function alignAmountsForResume(
  amounts: readonly bigint[],
  offset: number,
  count: number,
): bigint[] {
  return Array.from({ length: count }, (_, i) => amounts[offset + i] ?? 0n);
}
