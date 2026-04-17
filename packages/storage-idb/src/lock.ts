export type IDBLockHandle = {
  readonly release: () => Promise<void>;
};

type Nav = {
  readonly locks?: {
    request(
      name: string,
      options: { ifAvailable?: boolean },
      callback: (lock: unknown) => Promise<void>,
    ): Promise<unknown>;
  };
};

/**
 * Acquires a Web Locks API lock for the given campaign ID.
 *
 * Uses `ifAvailable: true` so competing tabs get `null` immediately
 * (viewer mode) rather than blocking. The returned handle's `release()`
 * must be called when the caller is done; it resolves the internal
 * promise that keeps the lock open.
 *
 * If the environment does not support Web Locks (Node, old browsers),
 * every call succeeds and the no-op handle is returned.
 *
 * @param campaignId - Campaign identifier used to construct the lock name.
 * @returns A release handle, or `null` if the lock is already held.
 */
export async function acquireIDBLock(campaignId: string): Promise<IDBLockHandle | null> {
  const nav = globalThis.navigator as Nav | undefined;
  if (!nav?.locks) {
    // Environment has no Web Locks API; treat every call as acquired.
    return { release: async () => {} };
  }

  const name = `titrate:campaign:${campaignId}`;
  let releaseFn: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    releaseFn = resolve;
  });

  let acquired = false;
  // request() resolves once the callback returns. We make the callback
  // await our `held` promise, so the lock persists until we call releaseFn().
  const requestPromise = nav.locks.request(name, { ifAvailable: true }, async (lock) => {
    if (lock === null) return; // lock not available
    acquired = true;
    await held;
  });

  // Give the runtime a microtask to resolve whether acquired === true.
  // request() does NOT resolve until the callback returns, so we can't
  // await it here — instead, race a tiny delay.
  await new Promise<void>((r) => queueMicrotask(r));

  if (!acquired) {
    // The callback returned immediately (lock unavailable).
    await requestPromise;
    return null;
  }

  return {
    async release() {
      releaseFn();
      await requestPromise;
    },
  };
}
