import { describe, it, expect } from 'vitest';
import type { Address } from 'viem';
import { createSpotCheck } from '../../intervention/spot-check.js';

const addresses = Array.from(
  { length: 100 },
  (_, i) => `0x${i.toString(16).padStart(40, '0')}` as Address,
);

describe('createSpotCheck', () => {
  it('returns requested sample count', () => {
    const r = createSpotCheck(addresses, 'https://etherscan.io', { sampleSize: 5 });
    expect(r.samples).toHaveLength(5);
    expect(r.totalCount).toBe(100);
  });

  it('defaults to 5 samples', () => {
    expect(createSpotCheck(addresses, 'https://etherscan.io').samples).toHaveLength(5);
  });

  it('includes explorer URLs', () => {
    const r = createSpotCheck(addresses, 'https://etherscan.io', { sampleSize: 1 });
    expect(r.samples[0].explorerUrl).toContain('https://etherscan.io/address/');
  });

  it('includes amounts when provided', () => {
    const amounts = addresses.map((_, i) => BigInt(i * 1000));
    const r = createSpotCheck(addresses, 'https://etherscan.io', { sampleSize: 3, amounts });
    for (const s of r.samples) expect(s.amount).toBeDefined();
  });

  it('produces deterministic results with seed', () => {
    const r1 = createSpotCheck(addresses, 'https://etherscan.io', { sampleSize: 3, seed: 42 });
    const r2 = createSpotCheck(addresses, 'https://etherscan.io', { sampleSize: 3, seed: 42 });
    expect(r1.samples.map((s) => s.index)).toEqual(r2.samples.map((s) => s.index));
  });

  it('produces different results with different seeds', () => {
    const r1 = createSpotCheck(addresses, 'https://etherscan.io', { sampleSize: 5, seed: 1 });
    const r2 = createSpotCheck(addresses, 'https://etherscan.io', { sampleSize: 5, seed: 2 });
    expect(r1.samples.map((s) => s.index)).not.toEqual(r2.samples.map((s) => s.index));
  });

  it('handles sampleSize larger than array', () => {
    expect(
      createSpotCheck(addresses.slice(0, 3), 'https://etherscan.io', { sampleSize: 10 }).samples,
    ).toHaveLength(3);
  });

  it('handles empty array', () => {
    const r = createSpotCheck([], 'https://etherscan.io');
    expect(r.samples).toHaveLength(0);
    expect(r.totalCount).toBe(0);
  });
});
