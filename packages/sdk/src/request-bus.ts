const WINDOW_MS = 5_000;
const MIN_RATE = 1;
const INITIAL_BACKOFF_FACTOR = 0.8;
const SUBSEQUENT_BACKOFF_FACTOR = 0.95;
const DEFAULT_BURST_RATE = 5;

export type RequestBusOptions = {
  readonly isRateLimitError?: (error: unknown) => boolean;
};

export type RequestBus = {
  readonly key: string;
  execute<T>(fn: () => Promise<T>, requestKey?: string): Promise<T>;
  getCurrentRate(): number | null;
  destroy(): void;
};

/**
 * Creates a generic rate-limited execution queue.
 * Starts unthrottled. Learns rate limits from errors matched by `isRateLimitError`.
 * On first rate limit: set limit to 80% of measured burst rate.
 * On subsequent: reduce by 5%. Floor: 1 req/sec.
 * Optional in-flight deduplication via `requestKey`.
 */
export function createRequestBus(key: string, options?: RequestBusOptions): RequestBus {
  const isRateLimitError = options?.isRateLimitError ?? (() => false);

  const timestamps: number[] = [];
  let enforcedRate: number | null = null;
  let lastRequestTime = 0;
  const inFlight = new Map<string, Promise<unknown>>();

  function pruneTimestamps(): void {
    const cutoff = Date.now() - WINDOW_MS;
    while (timestamps.length > 0 && timestamps[0] < cutoff) {
      timestamps.shift();
    }
  }

  function measureBurstRate(): number {
    pruneTimestamps();
    if (timestamps.length < 2) return DEFAULT_BURST_RATE;
    const windowStart = timestamps[0];
    const windowDuration = (Date.now() - windowStart) / 1000;
    if (windowDuration < 0.1) return DEFAULT_BURST_RATE;
    return timestamps.length / windowDuration;
  }

  function handleRateLimit(): void {
    if (enforcedRate === null) {
      const burstRate = measureBurstRate();
      enforcedRate = Math.max(burstRate * INITIAL_BACKOFF_FACTOR, MIN_RATE);
    } else {
      enforcedRate = Math.max(enforcedRate * SUBSEQUENT_BACKOFF_FACTOR, MIN_RATE);
    }
  }

  async function waitForSlot(): Promise<void> {
    if (enforcedRate === null) return;
    const minDelay = 1000 / enforcedRate;
    const elapsed = Date.now() - lastRequestTime;
    if (elapsed >= minDelay) return;
    await new Promise<void>((resolve) => setTimeout(resolve, minDelay - elapsed));
  }

  function execute<T>(fn: () => Promise<T>, requestKey?: string): Promise<T> {
    // In-flight deduplication
    if (requestKey) {
      const existing = inFlight.get(requestKey);
      if (existing) return existing as Promise<T>;
    }

    const promise = runWithRetry(fn);

    if (requestKey) {
      inFlight.set(requestKey, promise);
      promise.finally(() => inFlight.delete(requestKey));
    }

    return promise;
  }

  function runWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    // When unthrottled, call fn() synchronously (no await before it) so that
    // in-flight deduplication works correctly — the promise is registered
    // before any microtask yields.
    if (enforcedRate === null) {
      timestamps.push(Date.now());
      lastRequestTime = Date.now();
      return fn().catch((err: unknown) => {
        if (isRateLimitError(err)) {
          handleRateLimit();
          return retryAfterDelay(fn);
        }
        throw err;
      });
    }

    // Throttled path: wait for slot first, then execute.
    return waitForSlot().then(() => {
      timestamps.push(Date.now());
      lastRequestTime = Date.now();
      return fn();
    }).catch((err: unknown) => {
      if (isRateLimitError(err)) {
        handleRateLimit();
        return retryAfterDelay(fn);
      }
      throw err;
    });
  }

  function retryAfterDelay<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      setTimeout(() => runWithRetry(fn).then(resolve, reject), 1000 / (enforcedRate ?? 1));
    });
  }

  return {
    key,
    execute,
    getCurrentRate: () => enforcedRate,
    destroy: () => {
      timestamps.length = 0;
      inFlight.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// Bus registry
// ---------------------------------------------------------------------------

const busRegistry = new Map<string, RequestBus>();

/** Returns existing bus for the key or creates a new one. */
export function getOrCreateBus(key: string, options?: RequestBusOptions): RequestBus {
  const existing = busRegistry.get(key);
  if (existing) return existing;
  const bus = createRequestBus(key, options);
  busRegistry.set(key, bus);
  return bus;
}

/** Destroys a specific bus and removes it from the registry. */
export function destroyBus(key: string): void {
  const bus = busRegistry.get(key);
  if (bus) {
    bus.destroy();
    busRegistry.delete(key);
  }
}

/** Destroys all buses and clears the registry. */
export function destroyAllBuses(): void {
  for (const bus of busRegistry.values()) {
    bus.destroy();
  }
  busRegistry.clear();
}
