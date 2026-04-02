// packages/sdk/src/__tests__/trueblocks/status.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createTrueBlocksClient } from '../../trueblocks/client.js';
import { getTrueBlocksStatus } from '../../trueblocks/status.js';

function mockFetch(body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

describe('getTrueBlocksStatus', () => {
  it('parses a healthy status response', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080',
      busKey: 'tb',
      fetchFn: mockFetch({
        data: [{
          clientVersion: '3.0.0',
          chains: [{ chain: 'mainnet', chainId: 1, rpcProvider: 'http://localhost:8545' }],
          cachePath: '/home/user/.local/share/trueblocks/cache',
          isReady: true,
        }],
      }),
    });

    const status = await getTrueBlocksStatus(client);
    expect(status.isReady).toBe(true);
    expect(status.clientVersion).toBe('3.0.0');
    expect(status.chainId).toBe(1);
    expect(status.rpcProvider).toBe('http://localhost:8545');
    client.destroy();
  });

  it('returns isReady false when instance is not ready', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080',
      busKey: 'tb',
      fetchFn: mockFetch({
        data: [{
          clientVersion: '3.0.0',
          chains: [{ chain: 'mainnet', chainId: 1, rpcProvider: 'http://localhost:8545' }],
          cachePath: '/tmp',
          isReady: false,
        }],
      }),
    });

    const status = await getTrueBlocksStatus(client);
    expect(status.isReady).toBe(false);
    client.destroy();
  });

  it('handles connection failure gracefully', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080',
      busKey: 'tb',
      fetchFn: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch,
    });

    const status = await getTrueBlocksStatus(client);
    expect(status.isReady).toBe(false);
    client.destroy();
  });
});
