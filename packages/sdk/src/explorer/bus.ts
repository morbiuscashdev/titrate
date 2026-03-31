import type { ExplorerBus, ExplorerBusOptions } from './types.js';
import { parseExplorerResponse, ExplorerApiError, type ExplorerRawResponse } from './client.js';

const WINDOW_MS = 5_000;
const MIN_RATE = 1;
const INITIAL_BACKOFF_FACTOR = 0.8;
const SUBSEQUENT_BACKOFF_FACTOR = 0.95;
const MAX_RETRIES = 3;
// Assumed burst rate when fewer than 2 timestamps are available
const DEFAULT_BURST_RATE = 5;

export function createExplorerBus(
  explorerApiUrl: string,
  options: ExplorerBusOptions,
): ExplorerBus {
  const { apiKey, fetchFn = globalThis.fetch } = options;
  const domain = new URL(explorerApiUrl).hostname;
  const baseUrl = explorerApiUrl;

  const timestamps: number[] = [];
  let enforcedRate: number | null = null;
  let lastRequestTime = 0;

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

  async function request<T>(params: Record<string, string>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      await waitForSlot();

      const searchParams = new URLSearchParams({ ...params, apikey: apiKey });
      const url = `${baseUrl}?${searchParams.toString()}`;

      timestamps.push(Date.now());
      lastRequestTime = Date.now();

      try {
        const response = await fetchFn(url);
        const data = (await response.json()) as ExplorerRawResponse;

        try {
          return parseExplorerResponse<T>(data);
        } catch (err) {
          if (err instanceof ExplorerApiError && err.isRateLimit) {
            handleRateLimit();
            await new Promise((r) => setTimeout(r, 1000 / (enforcedRate ?? 1)));
            continue;
          }
          throw err;
        }
      } catch (err) {
        if (err instanceof ExplorerApiError) throw err;
        lastError = err;
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
        }
      }
    }

    throw lastError;
  }

  return {
    domain,
    request,
    getCurrentRate: () => enforcedRate,
    destroy: () => {
      timestamps.length = 0;
    },
  };
}

// Re-export for convenience
export { ExplorerApiError } from './client.js';

// Bus registry — one bus per domain
const busRegistry = new Map<string, ExplorerBus>();

export function getOrCreateBus(explorerApiUrl: string, apiKey: string): ExplorerBus {
  const domain = new URL(explorerApiUrl).hostname;
  const existing = busRegistry.get(domain);
  if (existing) return existing;
  const bus = createExplorerBus(explorerApiUrl, { apiKey });
  busRegistry.set(domain, bus);
  return bus;
}

export function destroyAllBuses(): void {
  for (const bus of busRegistry.values()) {
    bus.destroy();
  }
  busRegistry.clear();
}
