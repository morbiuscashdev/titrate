// packages/sdk/src/__tests__/trueblocks/transfers.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createTrueBlocksClient } from '../../trueblocks/client.js';
import { getTransfers } from '../../trueblocks/transfers.js';

function mockFetch(body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true, status: 200, statusText: 'OK',
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

describe('getTransfers', () => {
  it('yields parsed transfers', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080', busKey: 'tb',
      fetchFn: mockFetch({
        data: [{
          from: '0x1111111111111111111111111111111111111111',
          to: '0x2222222222222222222222222222222222222222',
          value: '1000000000000000000',
          asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          blockNumber: 19000000,
          transactionIndex: 5,
          hash: '0xabc123',
          timestamp: 1700000000,
        }],
      }),
    });

    const results: unknown[][] = [];
    for await (const batch of getTransfers({
      client,
      addresses: ['0x1111111111111111111111111111111111111111' as `0x${string}`],
    })) {
      results.push(batch);
    }

    expect(results).toHaveLength(1);
    expect(results[0][0]).toMatchObject({
      from: '0x1111111111111111111111111111111111111111',
      to: '0x2222222222222222222222222222222222222222',
      value: 1000000000000000000n,
      blockNumber: 19000000n,
    });
  });

  it('passes asset filter param', async () => {
    const fetchFn = mockFetch({ data: [] });
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080', busKey: 'tb', fetchFn,
    });

    for await (const _ of getTransfers({
      client,
      addresses: ['0xABC' as `0x${string}`],
      asset: '0xUSDC' as `0x${string}`,
    })) { /* consume */ }

    expect(fetchFn).toHaveBeenCalledWith(expect.stringContaining('asset=0xUSDC'));
  });

  it('handles native ETH transfers (asset string)', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080', busKey: 'tb',
      fetchFn: mockFetch({
        data: [{
          from: '0x1111111111111111111111111111111111111111',
          to: '0x2222222222222222222222222222222222222222',
          value: '500000000000000000',
          asset: 'ETH',
          blockNumber: 100,
          transactionIndex: 0,
          hash: '0xdef',
          timestamp: 1700000000,
        }],
      }),
    });

    for await (const batch of getTransfers({
      client,
      addresses: ['0x1111111111111111111111111111111111111111' as `0x${string}`],
    })) {
      expect(batch[0]).toMatchObject({ asset: 'ETH', value: 500000000000000000n });
    }
  });

  it('handles empty result', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080', busKey: 'tb',
      fetchFn: mockFetch({ data: [] }),
    });

    const results: unknown[][] = [];
    for await (const batch of getTransfers({
      client,
      addresses: ['0xABC' as `0x${string}`],
    })) {
      results.push(batch);
    }
    expect(results).toHaveLength(0);
  });
});
