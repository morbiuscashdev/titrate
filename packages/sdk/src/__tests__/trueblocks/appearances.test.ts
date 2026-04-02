// packages/sdk/src/__tests__/trueblocks/appearances.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createTrueBlocksClient } from '../../trueblocks/client.js';
import { getAppearances } from '../../trueblocks/appearances.js';

function mockFetch(body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true, status: 200, statusText: 'OK',
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

describe('getAppearances', () => {
  it('yields parsed appearances', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080', busKey: 'tb',
      fetchFn: mockFetch({
        data: [
          { address: '0xABC', blockNumber: 19000000, transactionIndex: 5 },
          { address: '0xABC', blockNumber: 19000050, transactionIndex: 12 },
        ],
      }),
    });

    const results: unknown[][] = [];
    for await (const batch of getAppearances({
      client,
      addresses: ['0xABC' as `0x${string}`],
    })) {
      results.push(batch);
    }

    expect(results).toHaveLength(1);
    expect(results[0]).toHaveLength(2);
    expect(results[0][0]).toMatchObject({
      address: '0xabc',
      blockNumber: 19000000n,
      transactionIndex: 5,
    });
  });

  it('passes block range params', async () => {
    const fetchFn = mockFetch({ data: [] });
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080', busKey: 'tb', fetchFn,
    });

    for await (const _ of getAppearances({
      client,
      addresses: ['0xABC' as `0x${string}`],
      firstBlock: 100n,
      lastBlock: 200n,
    })) { /* consume */ }

    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining('firstBlock=100'),
    );
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining('lastBlock=200'),
    );
  });

  it('handles empty result', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080', busKey: 'tb',
      fetchFn: mockFetch({ data: [] }),
    });

    const results: unknown[][] = [];
    for await (const batch of getAppearances({
      client,
      addresses: ['0xABC' as `0x${string}`],
    })) {
      results.push(batch);
    }
    expect(results).toHaveLength(0);
  });

  it('emits progress events', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080', busKey: 'tb',
      fetchFn: mockFetch({
        data: [{ address: '0xABC', blockNumber: 100, transactionIndex: 0 }],
      }),
    });

    const events: unknown[] = [];
    for await (const _ of getAppearances({
      client,
      addresses: ['0xABC' as `0x${string}`],
      onProgress: (e) => events.push(e),
    })) { /* consume */ }

    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toMatchObject({ type: 'scan' });
  });
});
