// packages/sdk/src/__tests__/cache/memory-cache.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMemoryCache } from '../../cache/memory-cache.js';

describe('createMemoryCache', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('get/set roundtrip', () => {
    const cache = createMemoryCache();
    cache.set('key1', 'value1', null);
    expect(cache.get('key1')).toBe('value1');
  });

  it('returns null for missing key', () => {
    const cache = createMemoryCache();
    expect(cache.get('missing')).toBeNull();
  });

  it('respects TTL — returns null after expiry', () => {
    const cache = createMemoryCache();
    cache.set('key1', 'value1', 100);
    expect(cache.get('key1')).toBe('value1');

    vi.advanceTimersByTime(150);
    expect(cache.get('key1')).toBeNull();
  });

  it('null TTL never expires', () => {
    const cache = createMemoryCache();
    cache.set('key1', 'value1', null);

    vi.advanceTimersByTime(999_999);
    expect(cache.get('key1')).toBe('value1');
  });

  it('TTL 0 does not store', () => {
    const cache = createMemoryCache();
    cache.set('key1', 'value1', 0);
    expect(cache.get('key1')).toBeNull();
  });

  it('invalidate removes entry', () => {
    const cache = createMemoryCache();
    cache.set('key1', 'value1', null);
    cache.invalidate('key1');
    expect(cache.get('key1')).toBeNull();
  });

  it('clear removes all entries', () => {
    const cache = createMemoryCache();
    cache.set('a', 1, null);
    cache.set('b', 2, null);
    cache.clear();
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBeNull();
  });

  it('overwrite replaces existing entry', () => {
    const cache = createMemoryCache();
    cache.set('key1', 'old', null);
    cache.set('key1', 'new', null);
    expect(cache.get('key1')).toBe('new');
  });
});
