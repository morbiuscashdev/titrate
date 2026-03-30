import { describe, it, expect, beforeAll } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { parseEther, type Address } from 'viem';
import {
  createAnvilContext,
  mineBlocks,
  fundAddress,
  type AnvilContext,
} from './helpers/anvil.js';
import { deployMockERC20, deploySimpleERC20, MOCK_ERC20_ABI_TYPED } from './helpers/mock-erc20.js';
import {
  scanBlocks,
  resolveBlockByTimestamp,
  scanTransferEvents,
  getAddressProperties,
  createTitrateState,
  adjustRange,
  shrinkRange,
} from '../scanner/index.js';
import { isQuerySizeError } from '../scanner/titrate-range.js';

// ---------------------------------------------------------------------------
// titrate-range — pure unit tests (no Anvil needed)
// ---------------------------------------------------------------------------

describe('titrate-range', () => {
  describe('createTitrateState', () => {
    it('creates state with default initial range of 1000', () => {
      const state = createTitrateState();
      expect(state.blockRange).toBe(1_000n);
    });

    it('creates state with a custom initial range', () => {
      const state = createTitrateState(500n);
      expect(state.blockRange).toBe(500n);
    });

    it('creates state with a large range', () => {
      const state = createTitrateState(100_000n);
      expect(state.blockRange).toBe(100_000n);
    });
  });

  describe('adjustRange', () => {
    it('grows range when elapsed is below target (fast query)', () => {
      const state = createTitrateState(1_000n);
      const before = state.blockRange;
      adjustRange(state, 500); // 500ms < 1000ms target → grow
      expect(state.blockRange).toBeGreaterThan(before);
    });

    it('shrinks range when elapsed exceeds target (slow query)', () => {
      const state = createTitrateState(1_000n);
      const before = state.blockRange;
      adjustRange(state, 2_000); // 2000ms > 1000ms target → shrink
      expect(state.blockRange).toBeLessThan(before);
    });

    it('applies 9/8 growth factor for fast queries', () => {
      const state = createTitrateState(1_000n);
      adjustRange(state, 100); // very fast
      // (1000 * 9) / 8 = 1125
      expect(state.blockRange).toBe(1_125n);
    });

    it('enforces minimum range of 50 after shrink from very slow query', () => {
      const state = createTitrateState(100n);
      adjustRange(state, 100_000); // extremely slow — ratio rounds to ~0
      expect(state.blockRange).toBeGreaterThanOrEqual(50n);
    });

    it('clamps tiny fast-grown range to minimum of 50', () => {
      const state = createTitrateState(10n);
      adjustRange(state, 100); // fast, but 10 * 9/8 = 11, which is < 50
      expect(state.blockRange).toBe(50n);
    });

    it('proportionally scales down with slow elapsed', () => {
      const state = createTitrateState(2_000n);
      adjustRange(state, 2_000); // elapsed = target → ratio = 50 → 2000*50/100 = 1000
      expect(state.blockRange).toBe(1_000n);
    });
  });

  describe('shrinkRange', () => {
    it('halves the block range', () => {
      const state = createTitrateState(1_000n);
      shrinkRange(state);
      expect(state.blockRange).toBe(500n);
    });

    it('halves again on repeated calls', () => {
      const state = createTitrateState(1_000n);
      shrinkRange(state);
      shrinkRange(state);
      expect(state.blockRange).toBe(250n);
    });

    it('enforces minimum range of 50 when halving a small value', () => {
      const state = createTitrateState(60n);
      shrinkRange(state); // 60/2 = 30 < 50 → clamped to 50
      expect(state.blockRange).toBe(50n);
    });

    it('enforces minimum range on already-minimal range', () => {
      const state = createTitrateState(50n);
      shrinkRange(state); // 50/2 = 25 < 50 → clamped
      expect(state.blockRange).toBe(50n);
    });
  });

  describe('isQuerySizeError', () => {
    it('returns true for "too many" errors', () => {
      expect(isQuerySizeError(new Error('too many logs in response'))).toBe(true);
      expect(isQuerySizeError('too many results')).toBe(true);
    });

    it('returns true for "exceed" errors', () => {
      expect(isQuerySizeError(new Error('response size exceed limit'))).toBe(true);
    });

    it('returns true for "limit" errors', () => {
      expect(isQuerySizeError(new Error('block range limit reached'))).toBe(true);
    });

    it('returns true for "Log response size exceeded" errors', () => {
      expect(isQuerySizeError(new Error('Log response size exceeded maximum'))).toBe(true);
    });

    it('returns true for "string longer than" errors', () => {
      expect(isQuerySizeError(new Error('string longer than maximum allowed length'))).toBe(true);
    });

    it('returns false for unrelated errors', () => {
      expect(isQuerySizeError(new Error('connection refused'))).toBe(false);
      expect(isQuerySizeError(new Error('invalid address'))).toBe(false);
      expect(isQuerySizeError('timeout error')).toBe(false);
      expect(isQuerySizeError(null)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// properties.ts — Anvil integration tests
// ---------------------------------------------------------------------------

describe('getAddressProperties (anvil)', () => {
  let ctx: AnvilContext;
  let contractAddress: Address;

  const ALICE = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address;

  beforeAll(async () => {
    ctx = createAnvilContext();

    // Fund Alice so she has a known positive balance
    await fundAddress(ctx, ALICE, parseEther('1'));

    // Deploy MockERC20 so we have a real contract to detect
    contractAddress = await deployMockERC20(ctx, 'PropTest', 'PT', 18);
  });

  it('fetches balance for an EOA', async () => {
    const results: { balance?: bigint }[] = [];
    for await (const batch of getAddressProperties(ctx.publicClient, [ALICE], {
      properties: ['balance'],
    })) {
      results.push(...batch);
    }

    expect(results).toHaveLength(1);
    expect(results[0].balance).toBeDefined();
    expect(results[0].balance!).toBeGreaterThan(0n);
  });

  it('identifies EOA as not a contract', async () => {
    const results: { isContract?: boolean }[] = [];
    for await (const batch of getAddressProperties(ctx.publicClient, [ALICE], {
      properties: ['code'],
    })) {
      results.push(...batch);
    }

    expect(results[0].isContract).toBe(false);
  });

  it('identifies deployed contract as a contract', async () => {
    const results: { isContract?: boolean; address: Address }[] = [];
    for await (const batch of getAddressProperties(ctx.publicClient, [contractAddress], {
      properties: ['code'],
    })) {
      results.push(...batch);
    }

    expect(results[0].isContract).toBe(true);
  });

  it('fetches nonce for an account that has sent transactions', async () => {
    const results: { nonce?: number }[] = [];
    for await (const batch of getAddressProperties(
      ctx.publicClient,
      [ctx.account.address],
      { properties: ['nonce'] },
    )) {
      results.push(...batch);
    }

    expect(results[0].nonce).toBeDefined();
    expect(results[0].nonce!).toBeGreaterThan(0);
  });

  it('fetches multiple properties at once', async () => {
    const results: { balance?: bigint; isContract?: boolean; nonce?: number }[] = [];
    for await (const batch of getAddressProperties(ctx.publicClient, [ALICE], {
      properties: ['balance', 'code', 'nonce'],
    })) {
      results.push(...batch);
    }

    const r = results[0];
    expect(r.balance).toBeDefined();
    expect(r.isContract).toBe(false);
    expect(r.nonce).toBeDefined();
  });

  it('calls onProgress callback', async () => {
    const progressEvents: unknown[] = [];
    for await (const _batch of getAddressProperties(ctx.publicClient, [ALICE], {
      properties: ['balance'],
      onProgress: (event) => progressEvents.push(event),
    })) {
      // consume
    }

    expect(progressEvents.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// logs.ts — scanTransferEvents
// ---------------------------------------------------------------------------

describe('scanTransferEvents (anvil)', () => {
  let ctx: AnvilContext;
  let tokenAddress: Address;

  const ALICE = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address;
  const BOB = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as Address;

  beforeAll(async () => {
    ctx = createAnvilContext();

    // Use SimpleERC20 which properly emits Transfer events (MockERC20 does not)
    tokenAddress = await deploySimpleERC20(ctx, 'ScanToken', 'SCAN', 18);

    // Mint tokens to deployer
    const mintHash = await ctx.walletClient.writeContract({
      address: tokenAddress,
      abi: MOCK_ERC20_ABI_TYPED,
      functionName: 'mint',
      args: [ctx.account.address, parseEther('1000')],
      account: ctx.walletClient.account!,
      chain: undefined,
    });
    await ctx.publicClient.waitForTransactionReceipt({ hash: mintHash });

    // Transfer to ALICE to emit a Transfer event
    const transferHash = await ctx.walletClient.writeContract({
      address: tokenAddress,
      abi: MOCK_ERC20_ABI_TYPED,
      functionName: 'transfer',
      args: [ALICE, parseEther('100')],
      account: ctx.walletClient.account!,
      chain: undefined,
    });
    await ctx.publicClient.waitForTransactionReceipt({ hash: transferHash });

    // Transfer to BOB to emit another Transfer event
    const transfer2Hash = await ctx.walletClient.writeContract({
      address: tokenAddress,
      abi: MOCK_ERC20_ABI_TYPED,
      functionName: 'transfer',
      args: [BOB, parseEther('50')],
      account: ctx.walletClient.account!,
      chain: undefined,
    });
    await ctx.publicClient.waitForTransactionReceipt({ hash: transfer2Hash });
  });

  it('scans Transfer events and returns recipient addresses', async () => {
    const currentBlock = await ctx.publicClient.getBlockNumber();
    const addresses: Address[] = [];

    for await (const batch of scanTransferEvents(ctx.publicClient, tokenAddress, {
      startBlock: 0n,
      endBlock: currentBlock,
    })) {
      addresses.push(...batch);
    }

    expect(addresses.length).toBeGreaterThan(0);
    expect(addresses.some((a) => a.toLowerCase() === ALICE.toLowerCase())).toBe(true);
    expect(addresses.some((a) => a.toLowerCase() === BOB.toLowerCase())).toBe(true);
  });

  it('returns empty when no transfers exist in range', async () => {
    // Scan block 0 only — no ERC-20 transfers there
    const addresses: Address[] = [];
    for await (const batch of scanTransferEvents(ctx.publicClient, tokenAddress, {
      startBlock: 0n,
      endBlock: 0n,
    })) {
      addresses.push(...batch);
    }

    expect(addresses.length).toBe(0);
  });

  it('calls onProgress callback during scan', async () => {
    const currentBlock = await ctx.publicClient.getBlockNumber();
    const progressEvents: unknown[] = [];

    for await (const _batch of scanTransferEvents(ctx.publicClient, tokenAddress, {
      startBlock: 0n,
      endBlock: currentBlock,
      onProgress: (event) => progressEvents.push(event),
    })) {
      // consume
    }

    expect(progressEvents.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// scanBlocks — existing tests kept + new coverage for blocks.ts
// ---------------------------------------------------------------------------

describe('scanner (anvil)', () => {
  let ctx: AnvilContext;

  beforeAll(async () => {
    ctx = createAnvilContext();
    // Generate some transactions for scanning
    for (let i = 0; i < 5; i++) {
      const randomAccount = privateKeyToAccount(generatePrivateKey());
      await fundAddress(ctx, randomAccount.address, parseEther('0.01'));
    }
    await mineBlocks(ctx, 3);
  });

  describe('scanBlocks', () => {
    it('extracts from addresses from block transactions', async () => {
      const currentBlock = await ctx.publicClient.getBlockNumber();
      const addresses: string[] = [];

      for await (const batch of scanBlocks(ctx.publicClient, {
        startBlock: 0n,
        endBlock: currentBlock,
        extract: 'tx.from',
      })) {
        addresses.push(...batch);
      }

      expect(addresses.length).toBeGreaterThan(0);
      // Anvil account should appear as a sender
      expect(
        addresses.some((a) => a.toLowerCase() === ctx.account.address.toLowerCase()),
      ).toBe(true);
    });

    it('extracts to addresses from block transactions', async () => {
      const currentBlock = await ctx.publicClient.getBlockNumber();
      const addresses: string[] = [];

      for await (const batch of scanBlocks(ctx.publicClient, {
        startBlock: 0n,
        endBlock: currentBlock,
        extract: 'tx.to',
      })) {
        addresses.push(...batch);
      }

      expect(addresses.length).toBeGreaterThan(0);
    });

    it('respects block range', async () => {
      const currentBlock = await ctx.publicClient.getBlockNumber();
      const addresses: string[] = [];

      // Scan only the last 2 blocks
      for await (const batch of scanBlocks(ctx.publicClient, {
        startBlock: currentBlock - 1n,
        endBlock: currentBlock,
        extract: 'tx.from',
      })) {
        addresses.push(...batch);
      }

      // Should have fewer addresses than full scan
      expect(addresses.length).toBeLessThanOrEqual(10);
    });

    it('calls onProgress during scan', async () => {
      const currentBlock = await ctx.publicClient.getBlockNumber();
      const progressEvents: unknown[] = [];

      for await (const _batch of scanBlocks(ctx.publicClient, {
        startBlock: currentBlock - 2n,
        endBlock: currentBlock,
        extract: 'tx.from',
        onProgress: (event) => progressEvents.push(event),
      })) {
        // consume
      }

      expect(progressEvents.length).toBeGreaterThan(0);
    });
  });

  describe('resolveBlockByTimestamp', () => {
    it('returns a block number for a recent timestamp', async () => {
      const block = await ctx.publicClient.getBlock();
      const blockNumber = await resolveBlockByTimestamp(
        ctx.publicClient,
        Number(block.timestamp),
      );
      expect(blockNumber).toBeGreaterThanOrEqual(0n);
    });

    it('returns latest block for a future timestamp', async () => {
      const latest = await ctx.publicClient.getBlock();
      const futureTimestamp = Number(latest.timestamp) + 1_000_000;
      const blockNumber = await resolveBlockByTimestamp(ctx.publicClient, futureTimestamp);
      expect(blockNumber).toBe(latest.number);
    });

    it('binary-searches to find a block before current time', async () => {
      const latest = await ctx.publicClient.getBlock();
      // Use a timestamp slightly in the past (earlier block)
      const pastTimestamp = Number(latest.timestamp) - 1;
      const blockNumber = await resolveBlockByTimestamp(ctx.publicClient, pastTimestamp);
      expect(blockNumber).toBeLessThanOrEqual(latest.number);
    });
  });
});
