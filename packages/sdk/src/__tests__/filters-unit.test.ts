import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Address, PublicClient } from 'viem';

// ---------------------------------------------------------------------------
// Hoisted scanner mocks — filters.ts uses `getAddressProperties` and
// `scanTransferEvents` as its RPC workhorses. Stub them here so the RPC-driven
// executors (contract-check / min-balance / nonce-range / token-recipients)
// can be exercised offline.
// ---------------------------------------------------------------------------

const scannerFakes = vi.hoisted(() => ({
  getAddressProperties: vi.fn(),
  scanTransferEvents: vi.fn(),
}));

vi.mock('../scanner/properties.js', () => ({
  getAddressProperties: scannerFakes.getAddressProperties,
}));

vi.mock('../scanner/logs.js', () => ({
  scanTransferEvents: scannerFakes.scanTransferEvents,
}));

// Imported after vi.mock so the mocked copies bind.
const { createFilter } = await import('../pipeline/filters.js');

// ---------------------------------------------------------------------------

const ADDR_A = '0xaaaa000000000000000000000000000000000001' as Address;
const ADDR_B = '0xaaaa000000000000000000000000000000000002' as Address;
const ADDR_C = '0xaaaa000000000000000000000000000000000003' as Address;
const TOKEN = '0xbbbb000000000000000000000000000000000001' as Address;

const fakeRpc = {} as PublicClient;

async function* emitBatches<T>(batches: T[][]): AsyncGenerator<T[]> {
  for (const batch of batches) yield batch;
}

beforeEach(() => {
  scannerFakes.getAddressProperties.mockReset();
  scannerFakes.scanTransferEvents.mockReset();
});

// ---------------------------------------------------------------------------
// contract-check filter
// ---------------------------------------------------------------------------

describe('filters.ts — contract-check filter', () => {
  it('keeps EOAs, drops contracts', async () => {
    scannerFakes.getAddressProperties.mockReturnValueOnce(
      emitBatches([
        [
          { address: ADDR_A, isContract: false },
          { address: ADDR_B, isContract: true },
          { address: ADDR_C, isContract: false },
        ],
      ]),
    );

    const executor = createFilter('contract-check', {});
    const input = new Set<Address>([ADDR_A, ADDR_B, ADDR_C]);
    const result = await executor(input, fakeRpc);

    expect(result.has(ADDR_A)).toBe(true);
    expect(result.has(ADDR_B)).toBe(false);
    expect(result.has(ADDR_C)).toBe(true);
  });

  it('forwards rpc + properties=[code] to getAddressProperties', async () => {
    scannerFakes.getAddressProperties.mockReturnValueOnce(emitBatches([[]]));
    const executor = createFilter('contract-check', {});
    await executor(new Set<Address>([ADDR_A]), fakeRpc);

    const [rpcArg, addrArg, optsArg] = scannerFakes.getAddressProperties.mock.calls[0];
    expect(rpcArg).toBe(fakeRpc);
    expect(addrArg).toEqual([ADDR_A]);
    expect(optsArg).toMatchObject({ properties: ['code'], concurrency: 100 });
  });

  it('concatenates multiple batches from the generator', async () => {
    scannerFakes.getAddressProperties.mockReturnValueOnce(
      emitBatches([
        [{ address: ADDR_A, isContract: false }],
        [{ address: ADDR_B, isContract: false }],
      ]),
    );

    const executor = createFilter('contract-check', {});
    const result = await executor(new Set<Address>([ADDR_A, ADDR_B]), fakeRpc);

    expect(result.size).toBe(2);
  });

  it('fires a filter onProgress event with input/output counts', async () => {
    scannerFakes.getAddressProperties.mockReturnValueOnce(
      emitBatches([
        [
          { address: ADDR_A, isContract: false },
          { address: ADDR_B, isContract: true },
        ],
      ]),
    );

    const executor = createFilter('contract-check', {});
    const events: unknown[] = [];
    await executor(new Set<Address>([ADDR_A, ADDR_B]), fakeRpc, (e) =>
      events.push(e),
    );

    expect(events).toEqual([
      {
        type: 'filter',
        filterName: 'contract-check',
        inputCount: 2,
        outputCount: 1,
      },
    ]);
  });

  it('propagates errors from getAddressProperties', async () => {
    scannerFakes.getAddressProperties.mockImplementationOnce(
      // eslint-disable-next-line require-yield
      async function* () {
        throw new Error('rpc exploded');
      },
    );

    const executor = createFilter('contract-check', {});
    await expect(executor(new Set<Address>([ADDR_A]), fakeRpc)).rejects.toThrow(
      'rpc exploded',
    );
  });
});

// ---------------------------------------------------------------------------
// min-balance filter
// ---------------------------------------------------------------------------

describe('filters.ts — min-balance filter', () => {
  it('keeps addresses at or above the threshold (parsed as ether)', async () => {
    scannerFakes.getAddressProperties.mockReturnValueOnce(
      emitBatches([
        [
          { address: ADDR_A, balance: 2n * 10n ** 18n }, // 2 ETH
          { address: ADDR_B, balance: 10n ** 17n }, // 0.1 ETH
        ],
      ]),
    );

    const executor = createFilter('min-balance', { minBalance: '1.0' });
    const result = await executor(
      new Set<Address>([ADDR_A, ADDR_B]),
      fakeRpc,
    );

    expect(result.has(ADDR_A)).toBe(true);
    expect(result.has(ADDR_B)).toBe(false);
  });

  it('passes blockNumber through to getAddressProperties when provided', async () => {
    scannerFakes.getAddressProperties.mockReturnValueOnce(emitBatches([[]]));
    const executor = createFilter('min-balance', {
      minBalance: '0.5',
      blockNumber: 12345,
    });

    await executor(new Set<Address>([ADDR_A]), fakeRpc);

    const [, , optsArg] = scannerFakes.getAddressProperties.mock.calls[0];
    expect(optsArg).toMatchObject({
      properties: ['balance'],
      blockNumber: 12345n,
      concurrency: 100,
    });
  });

  it('omits blockNumber when not provided', async () => {
    scannerFakes.getAddressProperties.mockReturnValueOnce(emitBatches([[]]));
    const executor = createFilter('min-balance', { minBalance: '0.5' });

    await executor(new Set<Address>([ADDR_A]), fakeRpc);

    const [, , optsArg] = scannerFakes.getAddressProperties.mock.calls[0];
    expect(optsArg.blockNumber).toBeUndefined();
  });

  it('throws a helpful error when invoked without an rpc client', async () => {
    const executor = createFilter('min-balance', { minBalance: '0.1' });
    await expect(executor(new Set<Address>([ADDR_A]))).rejects.toThrow(
      'min-balance filter requires an RPC client',
    );
  });

  it('fires a filter onProgress event', async () => {
    scannerFakes.getAddressProperties.mockReturnValueOnce(
      emitBatches([
        [
          { address: ADDR_A, balance: 10n ** 18n },
          { address: ADDR_B, balance: 10n ** 17n },
        ],
      ]),
    );

    const executor = createFilter('min-balance', { minBalance: '0.5' });
    const events: unknown[] = [];
    await executor(new Set<Address>([ADDR_A, ADDR_B]), fakeRpc, (e) =>
      events.push(e),
    );

    expect(events).toEqual([
      {
        type: 'filter',
        filterName: 'min-balance',
        inputCount: 2,
        outputCount: 1,
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// nonce-range filter
// ---------------------------------------------------------------------------

describe('filters.ts — nonce-range filter', () => {
  it('keeps addresses whose nonce is within [min, max] inclusive', async () => {
    scannerFakes.getAddressProperties.mockReturnValueOnce(
      emitBatches([
        [
          { address: ADDR_A, nonce: 5 },
          { address: ADDR_B, nonce: 150 },
          { address: ADDR_C, nonce: 1001 },
        ],
      ]),
    );

    const executor = createFilter('nonce-range', {
      minNonce: 1,
      maxNonce: 200,
    });
    const result = await executor(
      new Set<Address>([ADDR_A, ADDR_B, ADDR_C]),
      fakeRpc,
    );

    expect(result.has(ADDR_A)).toBe(true);
    expect(result.has(ADDR_B)).toBe(true);
    expect(result.has(ADDR_C)).toBe(false);
  });

  it('defaults minNonce=1 and maxNonce=1000 when params are omitted', async () => {
    scannerFakes.getAddressProperties.mockReturnValueOnce(
      emitBatches([
        [
          { address: ADDR_A, nonce: 0 }, // excluded — below default min
          { address: ADDR_B, nonce: 999 }, // kept — within default range
          { address: ADDR_C, nonce: 1001 }, // excluded — above default max
        ],
      ]),
    );

    const executor = createFilter('nonce-range', {});
    const result = await executor(
      new Set<Address>([ADDR_A, ADDR_B, ADDR_C]),
      fakeRpc,
    );

    expect(result.has(ADDR_A)).toBe(false);
    expect(result.has(ADDR_B)).toBe(true);
    expect(result.has(ADDR_C)).toBe(false);
  });

  it('requests the "nonce" property from the scanner', async () => {
    scannerFakes.getAddressProperties.mockReturnValueOnce(emitBatches([[]]));
    const executor = createFilter('nonce-range', { minNonce: 1, maxNonce: 10 });

    await executor(new Set<Address>([ADDR_A]), fakeRpc);

    const [, , optsArg] = scannerFakes.getAddressProperties.mock.calls[0];
    expect(optsArg).toMatchObject({
      properties: ['nonce'],
      concurrency: 100,
    });
  });

  it('fires a filter onProgress event', async () => {
    scannerFakes.getAddressProperties.mockReturnValueOnce(
      emitBatches([
        [
          { address: ADDR_A, nonce: 5 },
          { address: ADDR_B, nonce: 99999 },
        ],
      ]),
    );

    const executor = createFilter('nonce-range', {
      minNonce: 1,
      maxNonce: 100,
    });
    const events: unknown[] = [];
    await executor(new Set<Address>([ADDR_A, ADDR_B]), fakeRpc, (e) =>
      events.push(e),
    );

    expect(events).toEqual([
      {
        type: 'filter',
        filterName: 'nonce-range',
        inputCount: 2,
        outputCount: 1,
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// token-recipients filter
// ---------------------------------------------------------------------------

describe('filters.ts — token-recipients filter', () => {
  it('excludes addresses that appear in any scanned Transfer event', async () => {
    scannerFakes.scanTransferEvents.mockReturnValueOnce(
      emitBatches([[ADDR_B]]),
    );

    const executor = createFilter('token-recipients', {
      token: TOKEN,
      startBlock: 1,
      endBlock: 100,
    });

    const result = await executor(
      new Set<Address>([ADDR_A, ADDR_B, ADDR_C]),
      fakeRpc,
    );

    expect(result.has(ADDR_A)).toBe(true);
    expect(result.has(ADDR_B)).toBe(false);
    expect(result.has(ADDR_C)).toBe(true);
  });

  it('lowercases the token before calling the scanner', async () => {
    scannerFakes.scanTransferEvents.mockReturnValueOnce(emitBatches([[]]));
    const UPPER = ('0x' + 'AB'.repeat(20)) as Address;

    const executor = createFilter('token-recipients', {
      token: UPPER,
      startBlock: 10,
      endBlock: 20,
    });

    await executor(new Set<Address>([ADDR_A]), fakeRpc);

    const [rpcArg, tokenArg, optsArg] = scannerFakes.scanTransferEvents.mock.calls[0];
    expect(rpcArg).toBe(fakeRpc);
    expect(tokenArg).toBe(UPPER.toLowerCase());
    expect(optsArg).toMatchObject({ startBlock: 10n, endBlock: 20n });
  });

  it('accepts string block numbers and coerces them to BigInt', async () => {
    scannerFakes.scanTransferEvents.mockReturnValueOnce(emitBatches([[]]));
    const executor = createFilter('token-recipients', {
      token: TOKEN,
      startBlock: '123',
      endBlock: '456',
    });

    await executor(new Set<Address>([ADDR_A]), fakeRpc);

    const [, , optsArg] = scannerFakes.scanTransferEvents.mock.calls[0];
    expect(optsArg).toMatchObject({ startBlock: 123n, endBlock: 456n });
  });

  it('compares recipients case-insensitively', async () => {
    scannerFakes.scanTransferEvents.mockReturnValueOnce(
      emitBatches([[ADDR_A.toUpperCase() as Address]]),
    );

    const executor = createFilter('token-recipients', {
      token: TOKEN,
      startBlock: 1,
      endBlock: 10,
    });

    const result = await executor(new Set<Address>([ADDR_A]), fakeRpc);
    expect(result.has(ADDR_A)).toBe(false);
  });

  it('fires a filter onProgress event', async () => {
    scannerFakes.scanTransferEvents.mockReturnValueOnce(
      emitBatches([[ADDR_A]]),
    );

    const executor = createFilter('token-recipients', {
      token: TOKEN,
      startBlock: 1,
      endBlock: 10,
    });

    const events: unknown[] = [];
    await executor(new Set<Address>([ADDR_A, ADDR_B]), fakeRpc, (e) =>
      events.push(e),
    );

    const filterEvents = events.filter(
      (e) => (e as { type: string }).type === 'filter',
    );
    expect(filterEvents).toHaveLength(1);
    expect(filterEvents[0]).toMatchObject({
      filterName: 'token-recipients',
      inputCount: 2,
      outputCount: 1,
    });
  });

  it('propagates errors from scanTransferEvents', async () => {
    scannerFakes.scanTransferEvents.mockImplementationOnce(
      // eslint-disable-next-line require-yield
      async function* () {
        throw new Error('scan broke');
      },
    );

    const executor = createFilter('token-recipients', {
      token: TOKEN,
      startBlock: 1,
      endBlock: 10,
    });

    await expect(
      executor(new Set<Address>([ADDR_A]), fakeRpc),
    ).rejects.toThrow('scan broke');
  });
});
