// packages/sdk/src/__tests__/trueblocks/balances.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createTrueBlocksClient } from '../../trueblocks/client.js';
import { getBalanceHistory } from '../../trueblocks/balances.js';

function mockFetch(body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true, status: 200, statusText: 'OK',
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

describe('getBalanceHistory', () => {
  it('yields block numbers where balance changed', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080', busKey: 'tb',
      fetchFn: mockFetch({
        data: [
          { address: '0xABC', blockNumber: 19000010, transactionIndex: 3 },
          { address: '0xABC', blockNumber: 19000050, transactionIndex: 7 },
        ],
      }),
    });

    const results: unknown[][] = [];
    for await (const batch of getBalanceHistory({
      client,
      addresses: ['0xABC' as `0x${string}`],
    })) {
      results.push(batch);
    }

    expect(results).toHaveLength(1);
    expect(results[0][0]).toMatchObject({ blockNumber: 19000010n });
    expect(results[0][1]).toMatchObject({ blockNumber: 19000050n });
  });

  it('passes asset and block range params', async () => {
    const fetchFn = mockFetch({ data: [] });
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080', busKey: 'tb', fetchFn,
    });

    for await (const _ of getBalanceHistory({
      client,
      addresses: ['0xABC' as `0x${string}`],
      asset: '0xUSDC' as `0x${string}`,
      firstBlock: 100n,
      lastBlock: 200n,
    })) { /* consume */ }

    expect(fetchFn).toHaveBeenCalledWith(expect.stringContaining('asset=0xUSDC'));
    expect(fetchFn).toHaveBeenCalledWith(expect.stringContaining('changes=true'));
    expect(fetchFn).toHaveBeenCalledWith(expect.stringContaining('balances=true'));
  });

  it('handles empty history', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080', busKey: 'tb',
      fetchFn: mockFetch({ data: [] }),
    });

    const results: unknown[][] = [];
    for await (const batch of getBalanceHistory({
      client, addresses: ['0xABC' as `0x${string}`],
    })) {
      results.push(batch);
    }
    expect(results).toHaveLength(0);
  });
});
