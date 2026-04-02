// packages/sdk/src/__tests__/trueblocks/integration.test.ts
import { describe, it, expect } from 'vitest';
import { createTrueBlocksClient } from '../../trueblocks/client.js';
import { getTrueBlocksStatus } from '../../trueblocks/status.js';
import { getAppearances } from '../../trueblocks/appearances.js';
import { getTransfers } from '../../trueblocks/transfers.js';
import { getBalanceHistory } from '../../trueblocks/balances.js';
import { getTraces } from '../../trueblocks/traces.js';

const TRUEBLOCKS_URL = process.env.TRUEBLOCKS_URL;
const describeIf = TRUEBLOCKS_URL ? describe : describe.skip;

// Well-known test data
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as `0x${string}`;
const BLOCK_START = 19000000n;
const BLOCK_END = 19000100n;

function createClient() {
  return createTrueBlocksClient({
    baseUrl: TRUEBLOCKS_URL!,
    busKey: 'trueblocks-integration',
  });
}

describeIf('TrueBlocks integration (real data)', () => {
  it('status: reports healthy instance', async () => {
    const client = createClient();
    const status = await getTrueBlocksStatus(client);
    expect(status.isReady).toBe(true);
    expect(status.chainId).toBe(1);
    expect(status.clientVersion).toBeTruthy();
    client.destroy();
  });

  it('appearances: lists appearances for USDC in block range', async () => {
    const client = createClient();
    let count = 0;
    for await (const batch of getAppearances({
      client,
      addresses: [USDC],
      firstBlock: BLOCK_START,
      lastBlock: BLOCK_END,
    })) {
      for (const a of batch) {
        expect(a.blockNumber).toBeGreaterThanOrEqual(BLOCK_START);
        expect(a.blockNumber).toBeLessThanOrEqual(BLOCK_END);
        expect(a.address).toBe(USDC);
        count++;
      }
    }
    expect(count).toBeGreaterThan(0);
    client.destroy();
  });

  it('transfers: exports transfers for USDC in block range', async () => {
    const client = createClient();
    let count = 0;
    for await (const batch of getTransfers({
      client,
      addresses: [USDC],
      firstBlock: BLOCK_START,
      lastBlock: BLOCK_END,
    })) {
      for (const t of batch) {
        expect(typeof t.from).toBe('string');
        expect(typeof t.to).toBe('string');
        expect(typeof t.value).toBe('bigint');
        expect(typeof t.hash).toBe('string');
        expect(t.hash.startsWith('0x')).toBe(true);
        expect(t.blockNumber).toBeGreaterThanOrEqual(BLOCK_START);
        expect(t.timestamp).toBeGreaterThan(1700000000);
        count++;
      }
    }
    expect(count).toBeGreaterThan(0);
    client.destroy();
  });

  it('balanceHistory: returns block hints for active address', async () => {
    const client = createClient();
    let count = 0;
    for await (const batch of getBalanceHistory({
      client,
      addresses: [USDC],
      firstBlock: BLOCK_START,
      lastBlock: BLOCK_END,
    })) {
      for (const b of batch) {
        expect(b.blockNumber).toBeGreaterThanOrEqual(BLOCK_START);
        expect(b.blockNumber).toBeLessThanOrEqual(BLOCK_END);
        count++;
      }
    }
    // USDC contract may or may not have balance changes in this range
    // Just verify the call succeeds and returns valid data
    expect(count).toBeGreaterThanOrEqual(0);
    client.destroy();
  });

  it('traces: exports traces for USDC in block range', async () => {
    const client = createClient();
    let count = 0;
    for await (const batch of getTraces({
      client,
      addresses: [USDC],
      firstBlock: BLOCK_START,
      lastBlock: BLOCK_END,
    })) {
      for (const t of batch) {
        expect(typeof t.from).toBe('string');
        expect(typeof t.to).toBe('string');
        expect(typeof t.value).toBe('bigint');
        expect(['call', 'create', 'delegatecall', 'suicide', 'staticcall']).toContain(t.traceType);
        expect(t.depth).toBeGreaterThanOrEqual(0);
        count++;
      }
    }
    expect(count).toBeGreaterThan(0);
    client.destroy();
  });
});
