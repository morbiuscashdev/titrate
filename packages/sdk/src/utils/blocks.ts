import type { PublicClient } from 'viem';
import { resolveBlockByTimestamp } from '../scanner/index.js';

/**
 * Resolves a user-provided string to a block number.
 * Accepts either a raw block number ("19000000") or an ISO date ("2025-01-15").
 * ISO dates are resolved via binary search on-chain.
 */
export async function resolveBlockRef(
  input: string,
  client: PublicClient,
): Promise<bigint> {
  const trimmed = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(`${trimmed}T00:00:00Z`);
    const ts = Math.floor(date.getTime() / 1000);
    return resolveBlockByTimestamp(client, ts);
  }
  return BigInt(trimmed);
}
