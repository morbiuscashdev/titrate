import { describe, it, expect, vi } from 'vitest';
import type { ExplorerBus } from '../../explorer/types.js';
import { getTokenBalances, getNativeBalances } from '../../explorer/balances.js';

function createMockBus(responseMap: Record<string, unknown>): ExplorerBus {
  return {
    domain: 'api.etherscan.io',
    request: vi.fn().mockImplementation((params: Record<string, string>) => {
      if (params.action === 'tokenbalance') {
        const addr = params.address.toLowerCase();
        return Promise.resolve(responseMap[addr] ?? '0');
      }
      if (params.action === 'balancemulti') {
        const addrs = params.address.split(',');
        return Promise.resolve(
          addrs.map((a: string) => ({
            account: a,
            balance: responseMap[a.toLowerCase()] ?? '0',
          })),
        );
      }
      return Promise.resolve([]);
    }),
    getCurrentRate: () => null,
    destroy: () => {},
  };
}

describe('getTokenBalances', () => {
  it('returns balances for each address', async () => {
    const bus = createMockBus({ '0xaaa': '1000000', '0xbbb': '2000000' });
    const result = await getTokenBalances({
      bus,
      tokenAddress: '0xtoken' as `0x${string}`,
      addresses: ['0xAAA' as `0x${string}`, '0xBBB' as `0x${string}`],
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ address: '0xaaa', balance: 1000000n });
    expect(result[1]).toMatchObject({ address: '0xbbb', balance: 2000000n });
  });

  it('handles zero balances', async () => {
    const bus = createMockBus({});
    const result = await getTokenBalances({
      bus,
      tokenAddress: '0xtoken' as `0x${string}`,
      addresses: ['0xCCC' as `0x${string}`],
    });
    expect(result[0]).toMatchObject({ balance: 0n });
  });

  it('makes one request per address', async () => {
    const bus = createMockBus({ '0xaaa': '100', '0xbbb': '200', '0xccc': '300' });
    await getTokenBalances({
      bus,
      tokenAddress: '0xtoken' as `0x${string}`,
      addresses: ['0xAAA', '0xBBB', '0xCCC'] as `0x${string}`[],
    });
    expect(bus.request).toHaveBeenCalledTimes(3);
  });
});

describe('getNativeBalances', () => {
  it('returns balances for each address', async () => {
    const bus = createMockBus({
      '0xaaa': '1000000000000000000',
      '0xbbb': '2000000000000000000',
    });
    const result = await getNativeBalances({
      bus,
      addresses: ['0xAAA' as `0x${string}`, '0xBBB' as `0x${string}`],
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ balance: 1000000000000000000n });
  });

  it('batches up to 20 addresses per call', async () => {
    const addrs = Array.from({ length: 25 }, (_, i) =>
      `0x${i.toString(16).padStart(40, '0')}` as `0x${string}`,
    );
    const responseMap: Record<string, string> = {};
    for (const a of addrs) responseMap[a.toLowerCase()] = '100';
    const bus = createMockBus(responseMap);
    await getNativeBalances({ bus, addresses: addrs });
    expect(bus.request).toHaveBeenCalledTimes(2);
  });

  it('handles empty address list', async () => {
    const bus = createMockBus({});
    const result = await getNativeBalances({ bus, addresses: [] });
    expect(result).toEqual([]);
  });
});
