import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createIDBCacheStore } from '../cache-store.js';

describe('createIDBCacheStore', () => {
  let store: Awaited<ReturnType<typeof createIDBCacheStore>>;

  beforeEach(async () => {
    // Each test gets a fresh database name to avoid cross-test contamination
    store = await createIDBCacheStore(`test-cache-${Math.random()}`);
  });

  it('put and get roundtrip', async () => {
    await store.put({ key: 'abc', value: [1, 2, 3], createdAt: Date.now(), ttl: null });
    const entry = await store.get('abc');
    expect(entry).not.toBeNull();
    expect(entry!.value).toEqual([1, 2, 3]);
  });

  it('returns null for missing key', async () => {
    expect(await store.get('missing')).toBeNull();
  });

  it('delete removes entry', async () => {
    await store.put({ key: 'k', value: 'v', createdAt: Date.now(), ttl: null });
    await store.delete('k');
    expect(await store.get('k')).toBeNull();
  });

  it('clear removes all entries', async () => {
    await store.put({ key: 'a', value: 1, createdAt: Date.now(), ttl: null });
    await store.put({ key: 'b', value: 2, createdAt: Date.now(), ttl: null });
    await store.clear();
    expect(await store.get('a')).toBeNull();
    expect(await store.get('b')).toBeNull();
  });

  it('preserves metadata fields', async () => {
    const now = Date.now();
    await store.put({ key: 'k', value: 'v', createdAt: now, ttl: 3000, metadata: { source: 'test' } });
    const entry = await store.get('k');
    expect(entry!.createdAt).toBe(now);
    expect(entry!.ttl).toBe(3000);
    expect(entry!.metadata).toEqual({ source: 'test' });
  });
});
