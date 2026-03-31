import { describe, it, expect, vi } from 'vitest';
import type { ExplorerBus } from '../../explorer/types.js';
import { scanTransactions, scanInternalTransactions } from '../../explorer/transactions.js';

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

describe('scanTransactions', () => {
  it('yields parsed transactions', async () => {
    const bus = createMockBus([[{
      blockNumber: '19000000', timeStamp: '1700000000', hash: '0xabc',
      from: '0x1111111111111111111111111111111111111111',
      to: '0x2222222222222222222222222222222222222222',
      value: '1000000000000000000', isError: '0', gasUsed: '21000',
    }]]);
    const results: unknown[][] = [];
    for await (const batch of scanTransactions({
      bus, address: '0x1111111111111111111111111111111111111111' as `0x${string}`,
    })) {
      results.push(batch);
    }
    expect(results).toHaveLength(1);
    expect(results[0][0]).toMatchObject({
      from: '0x1111111111111111111111111111111111111111',
      value: 1000000000000000000n,
      isError: false,
      gasUsed: 21000n,
    });
  });

  it('parses isError "1" as true', async () => {
    const bus = createMockBus([[{
      blockNumber: '100', timeStamp: '100', hash: '0x1',
      from: '0x1111111111111111111111111111111111111111',
      to: '0x2222222222222222222222222222222222222222',
      value: '0', isError: '1', gasUsed: '21000',
    }]]);
    for await (const batch of scanTransactions({
      bus, address: '0x1111111111111111111111111111111111111111' as `0x${string}`,
    })) {
      expect(batch[0]).toMatchObject({ isError: true });
    }
  });

  it('handles null to field (contract creation)', async () => {
    const bus = createMockBus([[{
      blockNumber: '100', timeStamp: '100', hash: '0x1',
      from: '0x1111111111111111111111111111111111111111',
      to: '', value: '0', isError: '0', gasUsed: '100000',
    }]]);
    for await (const batch of scanTransactions({
      bus, address: '0x1111111111111111111111111111111111111111' as `0x${string}`,
    })) {
      expect(batch[0]).toMatchObject({ to: null });
    }
  });

  it('uses txlist action', async () => {
    const bus = createMockBus([[]]);
    for await (const _ of scanTransactions({
      bus, address: '0x1111111111111111111111111111111111111111' as `0x${string}`,
    })) { /* consume */ }
    expect(bus.request).toHaveBeenCalledWith(expect.objectContaining({ action: 'txlist' }));
  });
});

describe('scanInternalTransactions', () => {
  it('yields parsed internal transactions', async () => {
    const bus = createMockBus([[{
      blockNumber: '19000000', timeStamp: '1700000000', hash: '0xdef',
      from: '0x1111111111111111111111111111111111111111',
      to: '0x2222222222222222222222222222222222222222',
      value: '500000000000000000', type: 'call',
    }]]);
    const results: unknown[][] = [];
    for await (const batch of scanInternalTransactions({
      bus, address: '0x1111111111111111111111111111111111111111' as `0x${string}`,
    })) {
      results.push(batch);
    }
    expect(results).toHaveLength(1);
    expect(results[0][0]).toMatchObject({ value: 500000000000000000n, type: 'call' });
  });

  it('uses txlistinternal action', async () => {
    const bus = createMockBus([[]]);
    for await (const _ of scanInternalTransactions({
      bus, address: '0x1111111111111111111111111111111111111111' as `0x${string}`,
    })) { /* consume */ }
    expect(bus.request).toHaveBeenCalledWith(expect.objectContaining({ action: 'txlistinternal' }));
  });
});
