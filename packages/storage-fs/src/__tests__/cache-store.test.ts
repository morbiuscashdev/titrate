import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createFileCacheStore } from '../cache-store.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('createFileCacheStore', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'titrate-cache-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  it('put and get roundtrip', async () => {
    const store = createFileCacheStore(dir);
    await store.put({ key: 'abc123', value: { addresses: ['0x1', '0x2'] }, createdAt: Date.now(), ttl: null });
    const entry = await store.get('abc123');
    expect(entry).not.toBeNull();
    expect(entry!.value).toEqual({ addresses: ['0x1', '0x2'] });
  });

  it('returns null for missing key', async () => {
    const store = createFileCacheStore(dir);
    expect(await store.get('missing')).toBeNull();
  });

  it('delete removes entry', async () => {
    const store = createFileCacheStore(dir);
    await store.put({ key: 'k1', value: 'v1', createdAt: Date.now(), ttl: null });
    await store.delete('k1');
    expect(await store.get('k1')).toBeNull();
  });

  it('clear removes all entries', async () => {
    const store = createFileCacheStore(dir);
    await store.put({ key: 'a', value: 1, createdAt: Date.now(), ttl: null });
    await store.put({ key: 'b', value: 2, createdAt: Date.now(), ttl: null });
    await store.clear();
    expect(await store.get('a')).toBeNull();
    expect(await store.get('b')).toBeNull();
  });

  it('preserves ttl and createdAt', async () => {
    const store = createFileCacheStore(dir);
    const now = Date.now();
    await store.put({ key: 'k', value: 'v', createdAt: now, ttl: 5000 });
    const entry = await store.get('k');
    expect(entry!.createdAt).toBe(now);
    expect(entry!.ttl).toBe(5000);
  });
});
