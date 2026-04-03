import type { Address } from 'viem';
import type { SpotCheckResult, SpotCheckSample } from './types.js';

/** mulberry32 seeded PRNG — returns a function producing [0, 1) floats */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type SpotCheckOptions = {
  readonly sampleSize?: number;
  readonly amounts?: readonly bigint[];
  readonly seed?: number;
};

/**
 * Selects a random sample of addresses using a Fisher-Yates partial shuffle.
 * Results are deterministic when `seed` is provided.
 */
export function createSpotCheck(
  addresses: readonly Address[],
  explorerUrl: string,
  options?: SpotCheckOptions,
): SpotCheckResult {
  const sampleSize = Math.min(options?.sampleSize ?? 5, addresses.length);

  if (addresses.length === 0) {
    return { samples: [], totalCount: 0, sampleSize: 0 };
  }

  const random = options?.seed !== undefined ? mulberry32(options.seed) : () => Math.random();

  const indices = Array.from({ length: addresses.length }, (_, i) => i);

  // Fisher-Yates partial shuffle — only shuffle the first `sampleSize` positions
  for (let i = 0; i < sampleSize; i++) {
    const j = i + Math.floor(random() * (indices.length - i));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const baseUrl = explorerUrl.endsWith('/') ? explorerUrl.slice(0, -1) : explorerUrl;

  const samples: SpotCheckSample[] = indices.slice(0, sampleSize).map((idx) => ({
    index: idx,
    address: addresses[idx],
    amount: options?.amounts?.[idx],
    explorerUrl: `${baseUrl}/address/${addresses[idx]}`,
  }));

  return { samples, totalCount: addresses.length, sampleSize };
}
