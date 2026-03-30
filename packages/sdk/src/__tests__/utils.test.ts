import { describe, it, expect } from 'vitest';
import { chunk } from '../utils/chunk.js';
import { withRetry } from '../utils/retry.js';

describe('chunk', () => {
  it('splits array into chunks of given size', () => {
    const result = chunk([1, 2, 3, 4, 5], 2);
    expect(result).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns single chunk when array is smaller than size', () => {
    expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
  });

  it('returns empty array for empty input', () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it('handles exact division', () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });
});

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const result = await withRetry(() => Promise.resolve(42), 'test');
    expect(result).toBe(42);
  });

  it('retries on failure then succeeds', async () => {
    let calls = 0;
    const result = await withRetry(
      () => {
        calls++;
        if (calls < 3) throw new Error('fail');
        return Promise.resolve('ok');
      },
      'test',
      { maxRetries: 5, baseDelay: 1 },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('throws after max retries', async () => {
    await expect(
      withRetry(
        () => Promise.reject(new Error('always fail')),
        'test',
        { maxRetries: 2, baseDelay: 1 },
      ),
    ).rejects.toThrow('always fail');
  });
});
