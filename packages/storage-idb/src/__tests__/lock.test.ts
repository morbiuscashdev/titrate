import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { createIDBStorage } from '../index.js';

function setupNavigatorLocks(): void {
  const held = new Set<string>();
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      locks: {
        async request(name: string, opts: { ifAvailable?: boolean }, callback: (lock: unknown) => Promise<void>) {
          if (opts.ifAvailable && held.has(name)) return callback(null);
          held.add(name);
          try {
            return await callback({});
          } finally {
            held.delete(name);
          }
        },
      },
    },
  });
}

describe('IDB acquireLock', () => {
  it('returns a release handle when the lock is available', async () => {
    setupNavigatorLocks();
    const storage = await createIDBStorage(`test-lock-${Math.random()}`);
    const handle = await storage.acquireLock!('camp-1');
    expect(handle).not.toBeNull();
    await handle!.release();
  });

  it('returns null when the lock is already held in the same tab', async () => {
    setupNavigatorLocks();
    const storage = await createIDBStorage(`test-lock-${Math.random()}`);
    const first = await storage.acquireLock!('camp-1');
    expect(first).not.toBeNull();
    const second = await storage.acquireLock!('camp-1');
    expect(second).toBeNull();
    await first!.release();
  });
});
