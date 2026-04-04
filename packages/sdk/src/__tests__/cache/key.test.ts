import { describe, it, expect } from 'vitest';
import { computeCacheKey } from '../../cache/key.js';

describe('computeCacheKey', () => {
  it('produces deterministic keys for same params', async () => {
    const k1 = await computeCacheKey({ action: 'test', value: 42 });
    const k2 = await computeCacheKey({ action: 'test', value: 42 });
    expect(k1).toBe(k2);
  });

  it('produces same key regardless of property order', async () => {
    const k1 = await computeCacheKey({ a: 1, b: 2, c: 3 });
    const k2 = await computeCacheKey({ c: 3, a: 1, b: 2 });
    expect(k1).toBe(k2);
  });

  it('handles BigInt values by stringifying', async () => {
    const k1 = await computeCacheKey({ amount: 1000n });
    const k2 = await computeCacheKey({ amount: 1000n });
    expect(k1).toBe(k2);
    expect(k1.length).toBe(64); // SHA-256 hex = 64 chars
  });

  it('produces different keys for different params', async () => {
    const k1 = await computeCacheKey({ action: 'a' });
    const k2 = await computeCacheKey({ action: 'b' });
    expect(k1).not.toBe(k2);
  });

  it('handles nested objects', async () => {
    const k1 = await computeCacheKey({ config: { startBlock: '100', endBlock: '200' } });
    const k2 = await computeCacheKey({ config: { startBlock: '100', endBlock: '200' } });
    expect(k1).toBe(k2);
  });

  it('handles arrays', async () => {
    const k1 = await computeCacheKey({ addresses: ['0xabc', '0xdef'] });
    const k2 = await computeCacheKey({ addresses: ['0xabc', '0xdef'] });
    expect(k1).toBe(k2);
  });

  it('returns hex string of 64 characters', async () => {
    const key = await computeCacheKey({ test: true });
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});
