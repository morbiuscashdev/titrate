import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Address, PublicClient } from 'viem';

// ---------------------------------------------------------------------------
// Hoisted mock for scanner/blocks — sources.ts delegates block-scan to
// scanBlocks(). Stubbing it keeps the source-unit tests RPC-free.
// ---------------------------------------------------------------------------

const scannerFakes = vi.hoisted(() => ({
  scanBlocks: vi.fn(),
}));

vi.mock('../scanner/blocks.js', () => ({
  scanBlocks: scannerFakes.scanBlocks,
}));

const { createSource } = await import('../pipeline/sources.js');

// ---------------------------------------------------------------------------

const ADDR_A = '0xaaaa000000000000000000000000000000000001' as Address;
const ADDR_B = '0xaaaa000000000000000000000000000000000002' as Address;
const ADDR_C = '0xaaaa000000000000000000000000000000000003' as Address;
const fakeRpc = {} as PublicClient;

async function* emitBatches<T>(batches: T[][]): AsyncGenerator<T[]> {
  for (const b of batches) yield b;
}

async function drainSource(
  executor: ReturnType<typeof createSource>,
  rpc?: PublicClient,
): Promise<Address[]> {
  const out: Address[] = [];
  for await (const batch of executor(rpc)) {
    out.push(...batch);
  }
  return out;
}

beforeEach(() => {
  scannerFakes.scanBlocks.mockReset();
});

// ---------------------------------------------------------------------------
// csv source — already covered by pipeline.test.ts, but include the
// lower-case + dedupe invariants here so sources.ts can be read standalone.
// ---------------------------------------------------------------------------

describe('sources.ts — csv source', () => {
  it('lowercases and deduplicates addresses', async () => {
    const source = createSource('csv', {
      addresses: [ADDR_A.toUpperCase(), ADDR_A, ADDR_B],
    });
    const addrs = await drainSource(source);
    expect(addrs).toEqual([ADDR_A.toLowerCase(), ADDR_B.toLowerCase()]);
  });

  it('yields an empty batch when input is empty', async () => {
    const source = createSource('csv', { addresses: [] });
    const addrs = await drainSource(source);
    expect(addrs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// block-scan source
// ---------------------------------------------------------------------------

describe('sources.ts — block-scan source', () => {
  it('throws when invoked without an RPC client', async () => {
    const source = createSource('block-scan', {
      startBlock: 0,
      endBlock: 10,
      extract: 'tx.from',
    });

    const iter = source();
    await expect(iter.next()).rejects.toThrow(
      'block-scan source requires an RPC client',
    );
  });

  it('delegates to scanBlocks with the provided params', async () => {
    scannerFakes.scanBlocks.mockReturnValueOnce(
      emitBatches([[ADDR_A, ADDR_B]]),
    );

    const source = createSource('block-scan', {
      startBlock: 100,
      endBlock: 110,
      extract: 'tx.to',
      batchSize: 25,
    });

    const addrs = await drainSource(source, fakeRpc);
    expect(addrs).toEqual([ADDR_A, ADDR_B]);

    const [rpcArg, optsArg] = scannerFakes.scanBlocks.mock.calls[0];
    expect(rpcArg).toBe(fakeRpc);
    expect(optsArg).toMatchObject({
      startBlock: 100n,
      endBlock: 110n,
      extract: 'tx.to',
      batchSize: 25,
    });
  });

  it('defaults extract=tx.from and batchSize=100 when omitted', async () => {
    scannerFakes.scanBlocks.mockReturnValueOnce(emitBatches<Address>([]));

    const source = createSource('block-scan', {
      startBlock: 0,
      endBlock: 1,
    });

    await drainSource(source, fakeRpc);

    const [, optsArg] = scannerFakes.scanBlocks.mock.calls[0];
    expect(optsArg).toMatchObject({
      extract: 'tx.from',
      batchSize: 100,
    });
  });

  it('accepts string block numbers and coerces them to BigInt', async () => {
    scannerFakes.scanBlocks.mockReturnValueOnce(emitBatches<Address>([]));
    const source = createSource('block-scan', {
      startBlock: '42',
      endBlock: '99',
    });

    await drainSource(source, fakeRpc);
    const [, optsArg] = scannerFakes.scanBlocks.mock.calls[0];
    expect(optsArg.startBlock).toBe(42n);
    expect(optsArg.endBlock).toBe(99n);
  });

  it('forwards onProgress to scanBlocks', async () => {
    scannerFakes.scanBlocks.mockReturnValueOnce(emitBatches<Address>([]));
    const onProgress = vi.fn();

    const source = createSource('block-scan', {
      startBlock: 0,
      endBlock: 1,
    });

    const iter = source(fakeRpc, onProgress);
    // Drive the generator once to bind params.
    await iter.next();

    const [, optsArg] = scannerFakes.scanBlocks.mock.calls[0];
    expect(optsArg.onProgress).toBe(onProgress);
  });
});

// ---------------------------------------------------------------------------
// union source
// ---------------------------------------------------------------------------

describe('sources.ts — union source', () => {
  it('chains through each sub-source in order', async () => {
    const source = createSource('union', {
      sources: [
        { type: 'csv', params: { addresses: [ADDR_A] } },
        { type: 'csv', params: { addresses: [ADDR_B] } },
        { type: 'csv', params: { addresses: [ADDR_C] } },
      ],
    });

    const addrs = await drainSource(source);
    expect(addrs).toEqual([
      ADDR_A.toLowerCase(),
      ADDR_B.toLowerCase(),
      ADDR_C.toLowerCase(),
    ]);
  });

  it('passes rpc + onProgress through to each sub-source', async () => {
    scannerFakes.scanBlocks.mockReturnValueOnce(emitBatches([[ADDR_A]]));
    const onProgress = vi.fn();

    const source = createSource('union', {
      sources: [
        { type: 'block-scan', params: { startBlock: 0, endBlock: 1 } },
      ],
    });

    const addrs = await drainSource(source, fakeRpc);
    // Drive the onProgress leg explicitly.
    scannerFakes.scanBlocks.mockReturnValueOnce(emitBatches<Address>([]));
    const sourceWithProgress = createSource('union', {
      sources: [
        { type: 'block-scan', params: { startBlock: 0, endBlock: 1 } },
      ],
    });
    const iter = sourceWithProgress(fakeRpc, onProgress);
    await iter.next();

    expect(addrs).toEqual([ADDR_A]);
    const lastCall =
      scannerFakes.scanBlocks.mock.calls[
        scannerFakes.scanBlocks.mock.calls.length - 1
      ];
    expect(lastCall[0]).toBe(fakeRpc);
    expect(lastCall[1].onProgress).toBe(onProgress);
  });

  it('does not yield when the sub-source list is empty', async () => {
    const source = createSource('union', { sources: [] });
    const addrs = await drainSource(source);
    expect(addrs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Factory fallback
// ---------------------------------------------------------------------------

describe('sources.ts — createSource factory', () => {
  it('throws for an unknown source type', () => {
    // @ts-expect-error intentionally invalid source type
    expect(() => createSource('mystery-source', {})).toThrow(
      'Unknown source type: mystery-source',
    );
  });
});
