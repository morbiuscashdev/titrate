// packages/sdk/src/trueblocks/client.ts
import type { TrueBlocksClient, TrueBlocksClientOptions } from './types.js';
import { getOrCreateBus } from '../request-bus.js';

const DEFAULT_PAGE_SIZE = 1000;

/**
 * Thrown when TrueBlocks returns an HTTP error (non-2xx status).
 */
export class TrueBlocksApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly statusText: string,
  ) {
    super(`TrueBlocks API error: ${statusCode} ${statusText}`);
    this.name = 'TrueBlocksApiError';
  }
}

type TrueBlocksResponse = {
  readonly data?: unknown[] | null;
  readonly errors?: string[];
};

/**
 * Creates a TrueBlocks API client.
 * Routes all requests through a generic RequestBus for optional rate limiting.
 */
export function createTrueBlocksClient(options: TrueBlocksClientOptions): TrueBlocksClient {
  const { baseUrl, busKey, fetchFn = globalThis.fetch } = options;

  const bus = getOrCreateBus(busKey);

  async function request<T>(endpoint: string, params: Record<string, string>): Promise<T[]> {
    return bus.execute(async () => {
      const searchParams = new URLSearchParams(params);
      const url = `${baseUrl}${endpoint}?${searchParams.toString()}`;

      const response = await fetchFn(url);
      if (!response.ok) {
        throw new TrueBlocksApiError(response.status, response.statusText);
      }

      const body = (await response.json()) as TrueBlocksResponse;
      return (body.data ?? []) as T[];
    });
  }

  async function* requestPaginated<T>(
    endpoint: string,
    params: Record<string, string>,
    pageSize = DEFAULT_PAGE_SIZE,
  ): AsyncGenerator<T[]> {
    let firstRecord = 0;

    while (true) {
      const page = await request<T>(endpoint, {
        ...params,
        firstRecord: firstRecord.toString(),
        maxRecords: pageSize.toString(),
      });

      if (page.length === 0) break;
      yield page;
      if (page.length < pageSize) break;
      firstRecord += pageSize;
    }
  }

  return {
    baseUrl,
    request,
    requestPaginated,
    destroy: () => bus.destroy(),
  };
}
