import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Address } from 'viem';
import { createSource } from '../pipeline/sources.js';
import { createFilter } from '../pipeline/filters.js';

// ---------------------------------------------------------------------------
// Hoisted mocks — one fake explorer bus + one fake TrueBlocks client, shared
// across every test. Implementations are reconfigured per-test via `.mockX()`.
// ---------------------------------------------------------------------------

const fakes = vi.hoisted(() => {
  const explorerBus = {
    domain: 'fake.explorer',
    request: vi.fn(),
    getCurrentRate: vi.fn(() => 0),
    destroy: vi.fn(),
  };
  const trueBlocksClient = {
    baseUrl: 'https://fake.trueblocks',
    request: vi.fn(),
    requestPaginated: vi.fn(),
    destroy: vi.fn(),
  };
  return { explorerBus, trueBlocksClient };
});

vi.mock('../explorer/bus.js', () => ({
  getOrCreateBus: vi.fn(() => fakes.explorerBus),
  createExplorerBus: vi.fn(() => fakes.explorerBus),
  destroyAllBuses: vi.fn(),
  ExplorerApiError: class ExplorerApiError extends Error {},
}));

vi.mock('../trueblocks/client.js', () => ({
  createTrueBlocksClient: vi.fn(() => fakes.trueBlocksClient),
  TrueBlocksApiError: class TrueBlocksApiError extends Error {},
}));

// Helpers ----------------------------------------------------------------------

const ADDR_A = '0xaaaa000000000000000000000000000000000001' as Address;
const ADDR_B = '0xaaaa000000000000000000000000000000000002' as Address;
const ADDR_C = '0xaaaa000000000000000000000000000000000003' as Address;
const TOKEN = '0xbbbb000000000000000000000000000000000001' as Address;

function transferRow(from: string, to: string, value = '100', block = 1) {
  return {
    blockNumber: String(block),
    timeStamp: '1700000000',
    hash: '0xdeadbeef',
    from,
    to,
    value,
    tokenName: 'Test',
    tokenSymbol: 'TST',
    tokenDecimal: '18',
  };
}

function appearance(address: string, block = 1, txIndex = 0) {
  return { address, blockNumber: block, transactionIndex: txIndex };
}

function tbTransfer(from: string, to: string, block = 1) {
  return {
    from,
    to,
    value: '100',
    asset: 'ETH',
    blockNumber: block,
    transactionIndex: 0,
    hash: '0xdead',
    timestamp: 1700000000,
  };
}

async function* emitPages<T>(pages: T[][]): AsyncGenerator<T[]> {
  for (const page of pages) yield page;
}

async function drainSource(
  executor: ReturnType<typeof createSource>,
): Promise<Address[]> {
  const out: Address[] = [];
  for await (const batch of executor()) {
    out.push(...batch);
  }
  return out;
}

// ---------------------------------------------------------------------------

describe('sources.ts — explorer-scan source', () => {
  beforeEach(() => {
    fakes.explorerBus.request.mockReset();
  });

  it('extracts "to" addresses by default and deduplicates', async () => {
    fakes.explorerBus.request.mockResolvedValueOnce([
      transferRow(ADDR_A, ADDR_B),
      transferRow(ADDR_A, ADDR_B), // duplicate recipient
      transferRow(ADDR_C, ADDR_C),
    ]);

    const source = createSource('explorer-scan', {
      explorerApiUrl: 'https://fake.explorer/api',
      apiKey: 'k',
      tokenAddress: TOKEN,
      startBlock: 1,
      endBlock: 10,
    });

    const addresses = await drainSource(source);
    expect(new Set(addresses)).toEqual(
      new Set([ADDR_B.toLowerCase(), ADDR_C.toLowerCase()]),
    );
  });

  it('extracts "from" addresses when extract=from', async () => {
    fakes.explorerBus.request.mockResolvedValueOnce([
      transferRow(ADDR_A, ADDR_B),
      transferRow(ADDR_C, ADDR_B),
    ]);

    const source = createSource('explorer-scan', {
      explorerApiUrl: 'https://fake.explorer/api',
      apiKey: 'k',
      tokenAddress: TOKEN,
      extract: 'from',
      startBlock: 1,
      endBlock: 10,
    });

    const addresses = await drainSource(source);
    expect(new Set(addresses)).toEqual(
      new Set([ADDR_A.toLowerCase(), ADDR_C.toLowerCase()]),
    );
  });

  it('forwards onProgress callback to scanTokenTransfers', async () => {
    fakes.explorerBus.request.mockResolvedValueOnce([transferRow(ADDR_A, ADDR_B)]);

    const source = createSource('explorer-scan', {
      explorerApiUrl: 'https://fake.explorer/api',
      apiKey: 'k',
      tokenAddress: TOKEN,
      startBlock: 1,
      endBlock: 5,
    });

    const events: unknown[] = [];
    for await (const _ of source(undefined, (e) => events.push(e))) {
      void _;
    }
    expect(events.length).toBeGreaterThan(0);
    expect((events[0] as { type: string }).type).toBe('scan');
  });

  it('yields nothing when no transfers match', async () => {
    fakes.explorerBus.request.mockResolvedValueOnce([]);

    const source = createSource('explorer-scan', {
      explorerApiUrl: 'https://fake.explorer/api',
      apiKey: 'k',
      tokenAddress: TOKEN,
      startBlock: 0,
      endBlock: 1,
    });

    const addresses = await drainSource(source);
    expect(addresses).toHaveLength(0);
  });

  it('omits startBlock/endBlock params and still runs', async () => {
    fakes.explorerBus.request.mockResolvedValueOnce([transferRow(ADDR_A, ADDR_B)]);

    const source = createSource('explorer-scan', {
      explorerApiUrl: 'https://fake.explorer/api',
      apiKey: 'k',
      tokenAddress: TOKEN,
    });

    const addresses = await drainSource(source);
    expect(addresses).toContain(ADDR_B.toLowerCase());
  });
});

describe('sources.ts — trueblocks-scan source', () => {
  beforeEach(() => {
    fakes.trueBlocksClient.requestPaginated.mockReset();
    fakes.trueBlocksClient.destroy.mockClear();
  });

  it('extracts unique appearances in default mode', async () => {
    fakes.trueBlocksClient.requestPaginated.mockReturnValueOnce(
      emitPages([[appearance(ADDR_A), appearance(ADDR_B), appearance(ADDR_A)]]),
    );

    const source = createSource('trueblocks-scan', {
      trueBlocksUrl: 'https://fake.trueblocks',
      busKey: 'tb-key',
      addresses: [ADDR_A],
      firstBlock: 0,
      lastBlock: 100,
    });

    const addresses = await drainSource(source);
    expect(new Set(addresses)).toEqual(
      new Set([ADDR_A.toLowerCase(), ADDR_B.toLowerCase()]),
    );
    expect(fakes.trueBlocksClient.destroy).toHaveBeenCalledOnce();
  });

  it('extracts "to" transfers by default in transfers mode', async () => {
    fakes.trueBlocksClient.requestPaginated.mockReturnValueOnce(
      emitPages([[tbTransfer(ADDR_A, ADDR_B), tbTransfer(ADDR_C, ADDR_B)]]),
    );

    const source = createSource('trueblocks-scan', {
      trueBlocksUrl: 'https://fake.trueblocks',
      busKey: 'tb-key',
      addresses: [ADDR_A],
      mode: 'transfers',
      asset: TOKEN,
    });

    const addresses = await drainSource(source);
    expect(addresses).toEqual([ADDR_B.toLowerCase()]);
  });

  it('extracts "from" transfers when extract=from', async () => {
    fakes.trueBlocksClient.requestPaginated.mockReturnValueOnce(
      emitPages([[tbTransfer(ADDR_A, ADDR_B), tbTransfer(ADDR_C, ADDR_B)]]),
    );

    const source = createSource('trueblocks-scan', {
      trueBlocksUrl: 'https://fake.trueblocks',
      busKey: 'tb-key',
      addresses: [ADDR_A],
      mode: 'transfers',
      extract: 'from',
    });

    const addresses = await drainSource(source);
    expect(new Set(addresses)).toEqual(
      new Set([ADDR_A.toLowerCase(), ADDR_C.toLowerCase()]),
    );
  });

  it('yields nothing when paginated response is empty', async () => {
    fakes.trueBlocksClient.requestPaginated.mockReturnValueOnce(emitPages<unknown>([]));

    const source = createSource('trueblocks-scan', {
      trueBlocksUrl: 'https://fake.trueblocks',
      busKey: 'tb-key',
      addresses: [ADDR_A],
    });

    const addresses = await drainSource(source);
    expect(addresses).toHaveLength(0);
    expect(fakes.trueBlocksClient.destroy).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------

describe('filters.ts — explorer-balance filter', () => {
  beforeEach(() => {
    fakes.explorerBus.request.mockReset();
  });

  it('keeps ERC-20 holders above the minBalance threshold', async () => {
    // getTokenBalances calls bus.request once per address (tokenbalance).
    fakes.explorerBus.request
      .mockResolvedValueOnce('1000000000000000000') // ADDR_A — 1 token
      .mockResolvedValueOnce('500000000000000000'); // ADDR_B — 0.5 token

    const executor = createFilter('explorer-balance', {
      explorerApiUrl: 'https://fake.explorer/api',
      apiKey: 'k',
      tokenAddress: TOKEN,
      minBalance: '700000000000000000', // 0.7 token
    });

    const input = new Set<Address>([ADDR_A, ADDR_B]);
    const result = await executor(input);

    expect(result.has(ADDR_A.toLowerCase() as Address)).toBe(true);
    expect(result.has(ADDR_B.toLowerCase() as Address)).toBe(false);
  });

  it('uses the native-balance path when tokenAddress === "native"', async () => {
    // getNativeBalances calls bus.request once per batch of ≤20 addresses
    // (balancemulti). One batch is enough for two inputs.
    fakes.explorerBus.request.mockResolvedValueOnce([
      { account: ADDR_A, balance: '2000000000000000000' }, // 2 ETH
      { account: ADDR_B, balance: '100000000000000000' }, // 0.1 ETH
    ]);

    const executor = createFilter('explorer-balance', {
      explorerApiUrl: 'https://fake.explorer/api',
      apiKey: 'k',
      tokenAddress: 'native',
      minBalance: '1000000000000000000', // 1 ETH
    });

    const input = new Set<Address>([ADDR_A, ADDR_B]);
    const result = await executor(input);

    expect(result.has(ADDR_A.toLowerCase() as Address)).toBe(true);
    expect(result.has(ADDR_B.toLowerCase() as Address)).toBe(false);
  });

  it('fires a filter onProgress event with input/output counts', async () => {
    fakes.explorerBus.request.mockResolvedValueOnce('0');

    const executor = createFilter('explorer-balance', {
      explorerApiUrl: 'https://fake.explorer/api',
      apiKey: 'k',
      tokenAddress: TOKEN,
      minBalance: '1',
    });

    const input = new Set<Address>([ADDR_A]);
    const events: unknown[] = [];
    await executor(input, undefined, (e) => events.push(e));

    const filterEvents = events.filter(
      (e) => (e as { type: string }).type === 'filter',
    ) as Array<{ filterName: string; inputCount: number; outputCount: number }>;
    const finalEvent = filterEvents[filterEvents.length - 1];
    expect(finalEvent).toMatchObject({
      filterName: 'explorer-balance',
      inputCount: 1,
      outputCount: 0,
    });
  });
});

describe('filters.ts — trueblocks-balance-hint filter', () => {
  beforeEach(() => {
    fakes.trueBlocksClient.requestPaginated.mockReset();
    fakes.trueBlocksClient.destroy.mockClear();
  });

  it('keeps addresses with at least minChanges balance changes', async () => {
    fakes.trueBlocksClient.requestPaginated.mockReturnValueOnce(
      emitPages([
        [appearance(ADDR_A), appearance(ADDR_A), appearance(ADDR_B)],
      ]),
    );

    const executor = createFilter('trueblocks-balance-hint', {
      trueBlocksUrl: 'https://fake.trueblocks',
      busKey: 'tb-key',
      minChanges: 2,
    });

    const input = new Set<Address>([ADDR_A, ADDR_B, ADDR_C]);
    const result = await executor(input);

    expect(result.has(ADDR_A)).toBe(true);
    expect(result.has(ADDR_B)).toBe(false);
    expect(result.has(ADDR_C)).toBe(false);
    expect(fakes.trueBlocksClient.destroy).toHaveBeenCalledOnce();
  });

  it('defaults minChanges to 1 when omitted', async () => {
    fakes.trueBlocksClient.requestPaginated.mockReturnValueOnce(
      emitPages([[appearance(ADDR_A)]]),
    );

    const executor = createFilter('trueblocks-balance-hint', {
      trueBlocksUrl: 'https://fake.trueblocks',
      busKey: 'tb-key',
    });

    const input = new Set<Address>([ADDR_A, ADDR_B]);
    const result = await executor(input);

    expect(result.has(ADDR_A)).toBe(true);
    expect(result.has(ADDR_B)).toBe(false);
  });

  it('fires a filter onProgress event', async () => {
    fakes.trueBlocksClient.requestPaginated.mockReturnValueOnce(emitPages([[]]));

    const executor = createFilter('trueblocks-balance-hint', {
      trueBlocksUrl: 'https://fake.trueblocks',
      busKey: 'tb-key',
    });

    const events: unknown[] = [];
    await executor(new Set<Address>([ADDR_A]), undefined, (e) => events.push(e));

    const filterEvents = events.filter(
      (e) => (e as { type: string }).type === 'filter',
    );
    expect(filterEvents.length).toBeGreaterThan(0);
    expect(filterEvents[filterEvents.length - 1]).toMatchObject({
      filterName: 'trueblocks-balance-hint',
    });
  });

  it('passes the optional asset parameter through to TrueBlocks', async () => {
    fakes.trueBlocksClient.requestPaginated.mockReturnValueOnce(
      emitPages([[appearance(ADDR_A)]]),
    );

    const executor = createFilter('trueblocks-balance-hint', {
      trueBlocksUrl: 'https://fake.trueblocks',
      busKey: 'tb-key',
      asset: TOKEN,
    });

    await executor(new Set<Address>([ADDR_A]));

    const call = fakes.trueBlocksClient.requestPaginated.mock.calls[0];
    // call shape: [endpoint, params, pageSize?]
    expect(call?.[1]).toMatchObject({ asset: TOKEN });
  });
});
