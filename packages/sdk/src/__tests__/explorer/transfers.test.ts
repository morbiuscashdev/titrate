import { describe, it, expect, vi } from 'vitest';
import type { ExplorerBus } from '../../explorer/types.js';
import { scanTokenTransfers } from '../../explorer/transfers.js';
import { RESULT_CAP } from '../../explorer/titrate.js';

function createMockBus(responses: unknown[][]): ExplorerBus {
  let callIndex = 0;
  return {
    domain: 'api.etherscan.io',
    request: vi.fn().mockImplementation(() => {
      return Promise.resolve(responses[Math.min(callIndex++, responses.length - 1)]);
    }),
    getCurrentRate: () => null,
    destroy: () => {},
  };
}

function makeRawTransfer(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    blockNumber: '19000000',
    timeStamp: '1700000000',
    hash: '0xabc123',
    from: '0x1111111111111111111111111111111111111111',
    to: '0x2222222222222222222222222222222222222222',
    value: '1000000',
    tokenName: 'USD Coin',
    tokenSymbol: 'USDC',
    tokenDecimal: '6',
    ...overrides,
  };
}

describe('scanTokenTransfers', () => {
  it('yields parsed token transfers', async () => {
    const bus = createMockBus([[makeRawTransfer()]]);
    const results: unknown[][] = [];
    for await (const batch of scanTokenTransfers({
      bus,
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}`,
    })) {
      results.push(batch);
    }
    expect(results).toHaveLength(1);
    expect(results[0][0]).toMatchObject({
      from: '0x1111111111111111111111111111111111111111',
      to: '0x2222222222222222222222222222222222222222',
      value: 1000000n,
      tokenSymbol: 'USDC',
      tokenDecimals: 6,
      blockNumber: 19000000n,
    });
  });

  it('yields empty when no transfers found', async () => {
    const bus = createMockBus([[]]);
    const results: unknown[][] = [];
    for await (const batch of scanTokenTransfers({
      bus,
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}`,
    })) {
      results.push(batch);
    }
    expect(results).toHaveLength(0);
  });

  it('bisects when result count hits the cap', async () => {
    const fullPage = Array.from({ length: RESULT_CAP }, (_, i) =>
      makeRawTransfer({ blockNumber: String(i), hash: `0x${i.toString(16).padStart(64, '0')}` }),
    );
    const leftHalf = Array.from({ length: 6000 }, (_, i) =>
      makeRawTransfer({ blockNumber: String(i), hash: `0x${i.toString(16).padStart(64, '0')}` }),
    );
    const rightHalf = Array.from({ length: 4000 }, (_, i) =>
      makeRawTransfer({ blockNumber: String(5000 + i), hash: `0x${(5000 + i).toString(16).padStart(64, '0')}` }),
    );

    const bus = createMockBus([fullPage, leftHalf, rightHalf]);
    let totalTransfers = 0;
    for await (const batch of scanTokenTransfers({
      bus,
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}`,
      startBlock: 0n,
      endBlock: 10000n,
    })) {
      totalTransfers += batch.length;
    }
    expect(totalTransfers).toBe(10000);
    expect(bus.request).toHaveBeenCalledTimes(3);
  });

  it('emits progress events', async () => {
    const bus = createMockBus([[makeRawTransfer()]]);
    const events: unknown[] = [];
    for await (const _ of scanTokenTransfers({
      bus,
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}`,
      startBlock: 0n,
      endBlock: 1000n,
      onProgress: (e) => events.push(e),
    })) {
      // consume
    }
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toMatchObject({ type: 'scan' });
  });

  it('passes startBlock and endBlock to API params', async () => {
    const bus = createMockBus([[]]);
    for await (const _ of scanTokenTransfers({
      bus,
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}`,
      startBlock: 100n,
      endBlock: 200n,
    })) {
      // consume
    }
    expect(bus.request).toHaveBeenCalledWith(
      expect.objectContaining({ startblock: '100', endblock: '200' }),
    );
  });
});
