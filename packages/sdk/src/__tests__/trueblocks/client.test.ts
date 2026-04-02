// packages/sdk/src/__tests__/trueblocks/client.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createTrueBlocksClient, TrueBlocksApiError } from '../../trueblocks/client.js';

function mockFetch(responses: Array<{ status: number; body: unknown }>): typeof fetch {
  let callIndex = 0;
  return vi.fn().mockImplementation(() => {
    const resp = responses[Math.min(callIndex++, responses.length - 1)];
    return Promise.resolve({
      ok: resp.status >= 200 && resp.status < 300,
      status: resp.status,
      statusText: resp.status === 200 ? 'OK' : 'Error',
      json: () => Promise.resolve(resp.body),
    });
  }) as unknown as typeof fetch;
}

describe('createTrueBlocksClient', () => {
  it('stores baseUrl', () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080',
      busKey: 'trueblocks-local',
      fetchFn: mockFetch([]),
    });
    expect(client.baseUrl).toBe('http://localhost:8080');
    client.destroy();
  });
});

describe('client.request', () => {
  it('constructs correct URL with endpoint and params', async () => {
    const fetchFn = mockFetch([
      { status: 200, body: { data: [{ blockNumber: 100 }] } },
    ]);
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080',
      busKey: 'tb',
      fetchFn,
    });
    await client.request('/list', { addrs: '0xabc' });
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining('http://localhost:8080/list?addrs=0xabc'),
    );
    client.destroy();
  });

  it('parses data array from response', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080',
      busKey: 'tb',
      fetchFn: mockFetch([
        { status: 200, body: { data: [{ a: 1 }, { a: 2 }] } },
      ]),
    });
    const result = await client.request('/test', {});
    expect(result).toEqual([{ a: 1 }, { a: 2 }]);
    client.destroy();
  });

  it('returns empty array when data is null or missing', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080',
      busKey: 'tb',
      fetchFn: mockFetch([
        { status: 200, body: { data: null } },
      ]),
    });
    const result = await client.request('/test', {});
    expect(result).toEqual([]);
    client.destroy();
  });

  it('throws TrueBlocksApiError on HTTP error', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080',
      busKey: 'tb',
      fetchFn: mockFetch([
        { status: 500, body: { errors: ['internal error'] } },
      ]),
    });
    await expect(client.request('/test', {})).rejects.toThrow(TrueBlocksApiError);
    client.destroy();
  });

  it('throws TrueBlocksApiError on 404', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080',
      busKey: 'tb',
      fetchFn: mockFetch([
        { status: 404, body: {} },
      ]),
    });
    await expect(client.request('/test', {})).rejects.toThrow(TrueBlocksApiError);
    client.destroy();
  });
});

describe('client.requestPaginated', () => {
  it('fetches pages until result count is less than page size', async () => {
    const fetchFn = mockFetch([
      { status: 200, body: { data: Array.from({ length: 100 }, (_, i) => ({ id: i })) } },
      { status: 200, body: { data: Array.from({ length: 100 }, (_, i) => ({ id: 100 + i })) } },
      { status: 200, body: { data: Array.from({ length: 50 }, (_, i) => ({ id: 200 + i })) } },
    ]);
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080',
      busKey: 'tb',
      fetchFn,
    });

    let totalItems = 0;
    let pageCount = 0;
    for await (const page of client.requestPaginated('/list', { addrs: '0xabc' }, 100)) {
      totalItems += page.length;
      pageCount++;
    }

    expect(totalItems).toBe(250);
    expect(pageCount).toBe(3);
    client.destroy();
  });

  it('stops after first page if result count is under page size', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080',
      busKey: 'tb',
      fetchFn: mockFetch([
        { status: 200, body: { data: [{ id: 1 }, { id: 2 }] } },
      ]),
    });

    let pageCount = 0;
    for await (const _ of client.requestPaginated('/list', {}, 100)) {
      pageCount++;
    }
    expect(pageCount).toBe(1);
    client.destroy();
  });

  it('handles empty first page', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080',
      busKey: 'tb',
      fetchFn: mockFetch([
        { status: 200, body: { data: [] } },
      ]),
    });

    let pageCount = 0;
    for await (const _ of client.requestPaginated('/list', {}, 100)) {
      pageCount++;
    }
    expect(pageCount).toBe(0);
    client.destroy();
  });

  it('passes firstRecord and maxRecords params', async () => {
    const fetchFn = mockFetch([
      { status: 200, body: { data: [{ id: 1 }] } },
    ]);
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080',
      busKey: 'tb',
      fetchFn,
    });

    for await (const _ of client.requestPaginated('/list', { addrs: '0xabc' }, 50)) {
      // consume
    }

    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining('firstRecord=0'),
    );
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining('maxRecords=50'),
    );
    client.destroy();
  });
});
