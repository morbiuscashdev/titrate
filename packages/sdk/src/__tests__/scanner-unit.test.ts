import { describe, it, expect, vi } from 'vitest';
import type { Address, PublicClient } from 'viem';
import { getAddressProperties, type AddressProperties } from '../scanner/properties.js';
import { resolveBlockByTimestamp } from '../scanner/blocks.js';
import {
  createTitrateState,
  adjustRange,
  shrinkRange,
  isQuerySizeError,
} from '../scanner/titrate-range.js';

// ---------------------------------------------------------------------------
// Fake PublicClient — only implements the methods scanner code reaches for.
// ---------------------------------------------------------------------------

type FakeClientOverrides = Partial<{
  getBalance: (args: { address: Address; blockNumber?: bigint }) => Promise<bigint>;
  getCode: (args: { address: Address; blockNumber?: bigint }) => Promise<`0x${string}` | undefined>;
  getTransactionCount: (args: { address: Address; blockNumber?: bigint }) => Promise<number>;
  getBlock: (args: { blockNumber?: bigint; blockTag?: string }) => Promise<{ number: bigint; timestamp: bigint }>;
}>;

function createFakeClient(overrides: FakeClientOverrides = {}): PublicClient {
  // The methods we stub satisfy the structural subset scanner code uses.
  // Casting keeps the test surface small without re-implementing viem types.
  return {
    getBalance: vi.fn(overrides.getBalance ?? (async () => 0n)),
    getCode: vi.fn(overrides.getCode ?? (async () => undefined)),
    getTransactionCount: vi.fn(overrides.getTransactionCount ?? (async () => 0)),
    getBlock: vi.fn(overrides.getBlock ?? (async () => ({ number: 0n, timestamp: 0n }))),
  } as unknown as PublicClient;
}

const ADDR_A = '0xaaaa000000000000000000000000000000000001' as Address;
const ADDR_B = '0xaaaa000000000000000000000000000000000002' as Address;

// ---------------------------------------------------------------------------
// getAddressProperties
// ---------------------------------------------------------------------------

describe('scanner/properties.ts — getAddressProperties', () => {
  it('fetches balance when requested and skips other properties', async () => {
    const rpc = createFakeClient({
      getBalance: async ({ address }) => (address === ADDR_A ? 100n : 50n),
    });

    const batches: AddressProperties[][] = [];
    for await (const batch of getAddressProperties(rpc, [ADDR_A, ADDR_B], {
      properties: ['balance'],
    })) {
      batches.push(batch);
    }

    expect(batches).toHaveLength(1);
    const flat = batches.flat();
    expect(flat).toHaveLength(2);
    expect(flat.find((p) => p.address === ADDR_A)?.balance).toBe(100n);
    expect(flat.find((p) => p.address === ADDR_B)?.balance).toBe(50n);
    // Should not have fetched code or nonce
    expect(rpc.getCode).not.toHaveBeenCalled();
    expect(rpc.getTransactionCount).not.toHaveBeenCalled();
  });

  it('marks addresses as contracts when code exists', async () => {
    const rpc = createFakeClient({
      getCode: async ({ address }) => (address === ADDR_A ? '0xdead' : '0x'),
    });

    const results: AddressProperties[] = [];
    for await (const batch of getAddressProperties(rpc, [ADDR_A, ADDR_B], {
      properties: ['code'],
    })) {
      results.push(...batch);
    }

    expect(results.find((p) => p.address === ADDR_A)?.isContract).toBe(true);
    expect(results.find((p) => p.address === ADDR_B)?.isContract).toBe(false);
  });

  it('treats undefined code as EOA (not a contract)', async () => {
    const rpc = createFakeClient({ getCode: async () => undefined });
    const results: AddressProperties[] = [];
    for await (const batch of getAddressProperties(rpc, [ADDR_A], { properties: ['code'] })) {
      results.push(...batch);
    }
    expect(results[0].isContract).toBe(false);
  });

  it('fetches nonces via getTransactionCount', async () => {
    const rpc = createFakeClient({
      getTransactionCount: async ({ address }) => (address === ADDR_A ? 42 : 0),
    });

    const results: AddressProperties[] = [];
    for await (const batch of getAddressProperties(rpc, [ADDR_A, ADDR_B], {
      properties: ['nonce'],
    })) {
      results.push(...batch);
    }

    expect(results.find((p) => p.address === ADDR_A)?.nonce).toBe(42);
    expect(results.find((p) => p.address === ADDR_B)?.nonce).toBe(0);
  });

  it('fetches multiple properties in parallel', async () => {
    const rpc = createFakeClient({
      getBalance: async () => 7n,
      getCode: async () => '0xdead',
      getTransactionCount: async () => 3,
    });

    const results: AddressProperties[] = [];
    for await (const batch of getAddressProperties(rpc, [ADDR_A], {
      properties: ['balance', 'code', 'nonce'],
    })) {
      results.push(...batch);
    }

    expect(results[0]).toMatchObject({
      address: ADDR_A,
      balance: 7n,
      isContract: true,
      nonce: 3,
    });
  });

  it('forwards blockNumber to every RPC call', async () => {
    const rpc = createFakeClient({
      getBalance: async () => 1n,
      getCode: async () => '0x',
      getTransactionCount: async () => 0,
    });

    for await (const _ of getAddressProperties(rpc, [ADDR_A], {
      properties: ['balance', 'code', 'nonce'],
      blockNumber: 12345n,
    })) {
      void _;
    }

    expect(rpc.getBalance).toHaveBeenCalledWith({ address: ADDR_A, blockNumber: 12345n });
    expect(rpc.getCode).toHaveBeenCalledWith({ address: ADDR_A, blockNumber: 12345n });
    expect(rpc.getTransactionCount).toHaveBeenCalledWith({ address: ADDR_A, blockNumber: 12345n });
  });

  it('fires onProgress once per batch with the running processed count', async () => {
    const rpc = createFakeClient({ getBalance: async () => 1n });

    // 1500 addresses → default chunk size is 1000, so expect 2 progress events
    const addresses: Address[] = Array.from(
      { length: 1500 },
      (_, i) => `0x${i.toString(16).padStart(40, '0')}` as Address,
    );

    const events: Array<{ inputCount: number; outputCount: number }> = [];
    for await (const _ of getAddressProperties(rpc, addresses, {
      properties: ['balance'],
      onProgress: (e) => {
        if (e.type === 'filter') {
          events.push({ inputCount: e.inputCount, outputCount: e.outputCount });
        }
      },
    })) {
      void _;
    }

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ inputCount: 1500, outputCount: 1000 });
    expect(events[1]).toEqual({ inputCount: 1500, outputCount: 1500 });
  });

  it('handles an empty address list without yielding', async () => {
    const rpc = createFakeClient();
    const batches: AddressProperties[][] = [];
    for await (const batch of getAddressProperties(rpc, [], { properties: ['balance'] })) {
      batches.push(batch);
    }
    expect(batches).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// resolveBlockByTimestamp
// ---------------------------------------------------------------------------

describe('scanner/blocks.ts — resolveBlockByTimestamp', () => {
  /** Builds a fake chain whose block N has timestamp `genesisTs + N`. */
  function makeLinearChain(latestBlock: bigint, genesisTs: number) {
    return {
      getBlock: async ({ blockNumber, blockTag }: { blockNumber?: bigint; blockTag?: string }) => {
        if (blockTag === 'latest') {
          return { number: latestBlock, timestamp: BigInt(genesisTs) + latestBlock };
        }
        if (blockNumber === undefined) throw new Error('blockNumber or blockTag required');
        return { number: blockNumber, timestamp: BigInt(genesisTs) + blockNumber };
      },
    };
  }

  it('returns the latest block number when the target timestamp is in the future', async () => {
    const rpc = createFakeClient(makeLinearChain(100n, 1_000_000));
    const result = await resolveBlockByTimestamp(rpc, 9_999_999);
    expect(result).toBe(100n);
  });

  it('returns the latest block number when the target equals the latest timestamp', async () => {
    const rpc = createFakeClient(makeLinearChain(100n, 1_000_000));
    // Latest block 100 has timestamp 1_000_100
    const result = await resolveBlockByTimestamp(rpc, 1_000_100);
    expect(result).toBe(100n);
  });

  it('binary-searches to the earliest block with timestamp ≥ target', async () => {
    const rpc = createFakeClient(makeLinearChain(100n, 1_000_000));
    // Timestamp 1_000_042 → block 42 (timestamp matches exactly)
    const result = await resolveBlockByTimestamp(rpc, 1_000_042);
    expect(result).toBe(42n);
  });

  it('returns block 0 when the target is at or before genesis', async () => {
    const rpc = createFakeClient(makeLinearChain(100n, 1_000_000));
    const result = await resolveBlockByTimestamp(rpc, 0);
    expect(result).toBe(0n);
  });

  it('lands between two blocks by picking the first one ≥ target', async () => {
    const rpc = createFakeClient(makeLinearChain(100n, 1_000_000));
    // Target 1_000_042.5 (use 1_000_043 since int) → first block ≥ is 43
    const result = await resolveBlockByTimestamp(rpc, 1_000_043);
    expect(result).toBe(43n);
  });
});

// ---------------------------------------------------------------------------
// titrate-range (pure functions)
// ---------------------------------------------------------------------------

describe('scanner/titrate-range.ts', () => {
  describe('createTitrateState', () => {
    it('uses the default initial range when none is given', () => {
      const s = createTitrateState();
      expect(s.blockRange).toBe(1_000n);
    });

    it('accepts a custom initial range', () => {
      const s = createTitrateState(250n);
      expect(s.blockRange).toBe(250n);
    });
  });

  describe('adjustRange', () => {
    it('grows the range when the last query finished comfortably under the target', () => {
      const s = createTitrateState(1_000n);
      adjustRange(s, 500); // fast
      // Growth factor is 9/8 → 1_000 * 9/8 = 1_125
      expect(s.blockRange).toBe(1_125n);
    });

    it('shrinks the range when the last query blew past the target', () => {
      const s = createTitrateState(1_000n);
      adjustRange(s, 2_000); // 2× the target
      // ratio = round(1000/2000 * 100) = 50 → 1_000 * 50 / 100 = 500
      expect(s.blockRange).toBe(500n);
    });

    it('never shrinks below the MIN_RANGE floor', () => {
      const s = createTitrateState(50n);
      adjustRange(s, 1_000_000); // catastrophically slow
      expect(s.blockRange).toBe(50n);
    });
  });

  describe('shrinkRange', () => {
    it('halves the current range', () => {
      const s = createTitrateState(400n);
      shrinkRange(s);
      expect(s.blockRange).toBe(200n);
    });

    it('clamps to MIN_RANGE', () => {
      const s = createTitrateState(60n);
      shrinkRange(s);
      expect(s.blockRange).toBe(50n);
    });
  });

  describe('isQuerySizeError', () => {
    it.each([
      'returned too many results',
      'response size exceed',
      'exceeded query limit',
      'Log response size exceeded',
      'string longer than allowed',
    ])('recognises "%s" as a size error', (msg) => {
      expect(isQuerySizeError(new Error(msg))).toBe(true);
    });

    it('returns false for unrelated errors', () => {
      expect(isQuerySizeError(new Error('connection refused'))).toBe(false);
      expect(isQuerySizeError(new Error('gateway timeout'))).toBe(false);
    });

    it('accepts non-Error inputs by coercing to string', () => {
      expect(isQuerySizeError('too many logs')).toBe(true);
      expect(isQuerySizeError(null)).toBe(false);
      expect(isQuerySizeError(undefined)).toBe(false);
    });
  });
});
