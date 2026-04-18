import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir, hostname } from 'node:os';
import { join } from 'node:path';
import { createLockStore } from '../src/lock-store.js';

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'titrate-lock-'));
  path = join(dir, '.pipeline.lock');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('lock-store', () => {
  it('acquires a fresh lock when none exists', async () => {
    const store = createLockStore(path);
    const result = await store.acquire({ session: 'new' });
    expect(result.acquired).toBe(true);
    expect(result.mode).toBe('writer');

    const parsed = JSON.parse(await readFile(path, 'utf8'));
    expect(parsed.pid).toBe(process.pid);
    expect(parsed.hostname).toBe(hostname());
    expect(parsed.session).toBe('new');
  });

  it('returns viewer mode if another live PID owns the lock on the same host', async () => {
    await writeFile(
      path,
      JSON.stringify({
        pid: process.pid,
        hostname: hostname(),
        startedAt: Date.now(),
        session: 'new',
        version: '0.0.1',
      }),
      'utf8',
    );

    const store = createLockStore(path);
    const result = await store.acquire({ session: 'open' });
    expect(result.acquired).toBe(false);
    expect(result.mode).toBe('viewer');
    if (!result.acquired) {
      expect(result.holder.pid).toBe(process.pid);
    }
  });

  it('treats a dead PID as stale and acquires the lock fresh', async () => {
    await writeFile(
      path,
      JSON.stringify({
        pid: 999999,
        hostname: hostname(),
        startedAt: Date.now(),
        session: 'new',
        version: '0.0.1',
      }),
      'utf8',
    );

    const store = createLockStore(path);
    const result = await store.acquire({ session: 'open' });
    expect(result.acquired).toBe(true);
    expect(result.mode).toBe('writer');
    if (result.acquired) {
      expect(result.staleEvicted).toBe(true);
    }

    const parsed = JSON.parse(await readFile(path, 'utf8'));
    expect(parsed.pid).toBe(process.pid);
  });

  it('treats a different hostname as an active foreign writer', async () => {
    await writeFile(
      path,
      JSON.stringify({
        pid: 1,
        hostname: 'some-other-machine',
        startedAt: Date.now(),
        session: 'new',
        version: '0.0.1',
      }),
      'utf8',
    );

    const store = createLockStore(path);
    const result = await store.acquire({ session: 'new' });
    expect(result.acquired).toBe(false);
    expect(result.mode).toBe('viewer');
    if (!result.acquired) {
      expect(result.holder.hostname).toBe('some-other-machine');
    }
  });

  it('release deletes the lockfile if we are the holder', async () => {
    const store = createLockStore(path);
    await store.acquire({ session: 'new' });
    await store.release();

    await expect(readFile(path, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('release is a no-op when the lockfile is owned by someone else', async () => {
    await writeFile(
      path,
      JSON.stringify({
        pid: 1, hostname: 'foreign', startedAt: 0, session: 'new', version: '0.0.1',
      }),
      'utf8',
    );

    const store = createLockStore(path);
    await store.release();
    const raw = await readFile(path, 'utf8');
    expect(JSON.parse(raw).hostname).toBe('foreign');
  });
});
