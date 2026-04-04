import type { ExplorerBus, ExplorerBusOptions } from './types.js';
import { parseExplorerResponse, ExplorerApiError, type ExplorerRawResponse } from './client.js';
import { getOrCreateBus as getOrCreateRequestBus, destroyBus as destroyRequestBus } from '../request-bus.js';

const MAX_RETRIES = 3;

/**
 * Creates an explorer API bus — a protocol-specific wrapper around the generic RequestBus.
 * Handles URL construction, API key injection, response parsing, and network retries.
 * Rate limiting is delegated to the underlying RequestBus.
 */
export function createExplorerBus(
  explorerApiUrl: string,
  options: ExplorerBusOptions,
): ExplorerBus {
  const { apiKey, fetchFn = globalThis.fetch } = options;
  const domain = new URL(explorerApiUrl).hostname;
  const busKey = options.busKey ?? domain;
  const baseUrl = explorerApiUrl;

  const bus = getOrCreateRequestBus(busKey, {
    isRateLimitError: (err) => err instanceof ExplorerApiError && err.isRateLimit,
  });

  async function request<T>(params: Record<string, string>): Promise<T> {
    return bus.execute(async () => {
      let lastError: unknown;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const searchParams = new URLSearchParams({ ...params, apikey: apiKey });
        const url = `${baseUrl}?${searchParams.toString()}`;

        try {
          const response = await fetchFn(url);
          const data = (await response.json()) as ExplorerRawResponse;
          return parseExplorerResponse<T>(data);
        } catch (err) {
          if (err instanceof ExplorerApiError) throw err;
          lastError = err;
          if (attempt < MAX_RETRIES - 1) {
            await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
          }
        }
      }

      throw lastError;
    });
  }

  return {
    domain,
    request,
    getCurrentRate: () => bus.getCurrentRate(),
    destroy: () => destroyRequestBus(busKey),
  };
}

// Re-export for convenience
export { ExplorerApiError } from './client.js';

// ---------------------------------------------------------------------------
// Explorer-specific registry (delegates to generic RequestBus registry)
// ---------------------------------------------------------------------------

const explorerBusCache = new Map<string, ExplorerBus>();

export function getOrCreateBus(explorerApiUrl: string, apiKey: string): ExplorerBus {
  const domain = new URL(explorerApiUrl).hostname;
  const existing = explorerBusCache.get(domain);
  if (existing) return existing;
  const bus = createExplorerBus(explorerApiUrl, { apiKey });
  explorerBusCache.set(domain, bus);
  return bus;
}

export function destroyAllBuses(): void {
  for (const [domain] of explorerBusCache) {
    destroyRequestBus(domain);
  }
  explorerBusCache.clear();
}
