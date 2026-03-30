import { describe, it, expect, vi } from 'vitest';
import type { PublicClient } from 'viem';
import { probeToken } from '../utils/token.js';

function mockClient(responses: { name: string; symbol: string; decimals: number }): PublicClient {
  return {
    readContract: vi.fn().mockImplementation(({ functionName }: { functionName: string }) => {
      if (functionName === 'name') return Promise.resolve(responses.name);
      if (functionName === 'symbol') return Promise.resolve(responses.symbol);
      if (functionName === 'decimals') return Promise.resolve(responses.decimals);
      return Promise.reject(new Error('unknown function'));
    }),
  } as unknown as PublicClient;
}

describe('probeToken', () => {
  it('returns token metadata on success', async () => {
    const client = mockClient({ name: 'USD Coin', symbol: 'USDC', decimals: 6 });
    const result = await probeToken(client, '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`);
    expect(result).toEqual({ name: 'USD Coin', symbol: 'USDC', decimals: 6 });
  });

  it('returns null when contract calls fail', async () => {
    const client = {
      readContract: vi.fn().mockRejectedValue(new Error('not a contract')),
    } as unknown as PublicClient;
    const result = await probeToken(client, '0x0000000000000000000000000000000000000000' as `0x${string}`);
    expect(result).toBeNull();
  });
});
