// packages/sdk/src/__tests__/trueblocks/traces.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createTrueBlocksClient } from '../../trueblocks/client.js';
import { getTraces } from '../../trueblocks/traces.js';

function mockFetch(body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true, status: 200, statusText: 'OK',
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

describe('getTraces', () => {
  it('yields parsed traces', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080', busKey: 'tb',
      fetchFn: mockFetch({
        data: [{
          from: '0x1111111111111111111111111111111111111111',
          to: '0x2222222222222222222222222222222222222222',
          value: '500000000000000000',
          hash: '0xdef456',
          blockNumber: 19000000,
          type: 'call',
          traceAddress: '0.1',
        }],
      }),
    });

    const results: unknown[][] = [];
    for await (const batch of getTraces({
      client,
      addresses: ['0x1111111111111111111111111111111111111111' as `0x${string}`],
    })) {
      results.push(batch);
    }

    expect(results).toHaveLength(1);
    expect(results[0][0]).toMatchObject({
      from: '0x1111111111111111111111111111111111111111',
      to: '0x2222222222222222222222222222222222222222',
      value: 500000000000000000n,
      traceType: 'call',
    });
  });

  it('parses trace depth from traceAddress', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080', busKey: 'tb',
      fetchFn: mockFetch({
        data: [{
          from: '0x1111111111111111111111111111111111111111',
          to: '0x2222222222222222222222222222222222222222',
          value: '0', hash: '0xabc', blockNumber: 100,
          type: 'delegatecall',
          traceAddress: '0.1.2',
        }],
      }),
    });

    for await (const batch of getTraces({
      client,
      addresses: ['0x1111111111111111111111111111111111111111' as `0x${string}`],
    })) {
      expect(batch[0]).toMatchObject({ traceType: 'delegatecall', depth: 3 });
    }
  });

  it('uses traces param in export endpoint', async () => {
    const fetchFn = mockFetch({ data: [] });
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080', busKey: 'tb', fetchFn,
    });

    for await (const _ of getTraces({
      client,
      addresses: ['0xABC' as `0x${string}`],
    })) { /* consume */ }

    expect(fetchFn).toHaveBeenCalledWith(expect.stringContaining('traces=true'));
  });

  it('handles empty result', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080', busKey: 'tb',
      fetchFn: mockFetch({ data: [] }),
    });

    const results: unknown[][] = [];
    for await (const batch of getTraces({
      client, addresses: ['0xABC' as `0x${string}`],
    })) {
      results.push(batch);
    }
    expect(results).toHaveLength(0);
  });
});
