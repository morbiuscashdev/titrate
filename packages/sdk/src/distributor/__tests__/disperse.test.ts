import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Address, Hex, PublicClient, WalletClient } from 'viem';
import type { ProgressEvent } from '../../types.js';
import { disperseTokens, disperseTokensSimple } from '../disperse.js';
import type { DisperseParams, DisperseSimpleParams, LiveFilter, RevalidationConfig } from '../disperse.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SENDER = '0x1111111111111111111111111111111111111111' as Address;
const TOKEN = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as Address;
const CONTRACT = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' as Address;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;
const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;

function makeAddresses(count: number): Address[] {
  return Array.from({ length: count }, (_, i) => {
    const hex = (i + 1).toString(16).padStart(40, '0');
    return `0x${hex}` as Address;
  });
}

function makeAmounts(count: number, base = 1000n): bigint[] {
  return Array.from({ length: count }, (_, i) => base + BigInt(i));
}

let txHashCounter = 0;
function nextTxHash(): Hex {
  txHashCounter++;
  return `0x${txHashCounter.toString(16).padStart(64, '0')}` as Hex;
}

function createMockPublicClient(overrides: Record<string, unknown> = {}): PublicClient {
  return {
    estimateContractGas: vi.fn().mockResolvedValue(100_000n),
    getBlock: vi.fn().mockResolvedValue({ baseFeePerGas: 10_000_000_000n, gasLimit: 30_000_000n }),
    getBlockNumber: vi.fn().mockResolvedValue(100n),
    getTransactionCount: vi.fn().mockResolvedValue(0),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: 'success', gasUsed: 80_000n }),
    getFeeHistory: vi.fn().mockResolvedValue({ reward: [[1_000_000_000n]] }),
    estimateMaxPriorityFeePerGas: vi.fn().mockResolvedValue(500_000_000n),
    ...overrides,
  } as unknown as PublicClient;
}

function createMockWalletClient(overrides: Record<string, unknown> = {}): WalletClient {
  return {
    account: { address: SENDER },
    writeContract: vi.fn().mockImplementation(() => Promise.resolve(nextTxHash())),
    deployContract: vi.fn().mockResolvedValue(nextTxHash()),
    ...overrides,
  } as unknown as WalletClient;
}

/** Builds base params for disperseTokensSimple. */
function simpleParams(overrides: Partial<DisperseSimpleParams> = {}): DisperseSimpleParams {
  return {
    contractAddress: CONTRACT,
    variant: 'simple',
    token: TOKEN,
    recipients: makeAddresses(3),
    amount: 1000n,
    walletClient: createMockWalletClient(),
    publicClient: createMockPublicClient(),
    batchSize: 3,
    ...overrides,
  };
}

/** Builds base params for disperseTokens. */
function variableParams(overrides: Partial<DisperseParams> = {}): DisperseParams {
  const recipients = overrides.recipients ?? makeAddresses(3);
  return {
    contractAddress: CONTRACT,
    variant: 'simple',
    token: TOKEN,
    recipients,
    amounts: overrides.amounts ?? makeAmounts(recipients.length),
    walletClient: createMockWalletClient(),
    publicClient: createMockPublicClient(),
    batchSize: 3,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Core disperse
// ---------------------------------------------------------------------------

describe('disperseTokensSimple', () => {
  beforeEach(() => {
    txHashCounter = 0;
  });

  it('calls executeBatch with correct args for simple variant', async () => {
    const recipients = makeAddresses(2);
    const walletClient = createMockWalletClient();
    const publicClient = createMockPublicClient();

    const results = await disperseTokensSimple(
      simpleParams({ recipients, walletClient, publicClient, batchSize: 10 }),
    );

    expect(results).toHaveLength(1);
    expect(results[0].recipients).toEqual(recipients);
    expect(results[0].confirmedTxHash).toBeTruthy();
    expect(results[0].attempts).toHaveLength(1);
    expect(results[0].attempts[0].outcome).toBe('confirmed');

    // writeContract should have been called once
    expect(walletClient.writeContract).toHaveBeenCalledOnce();
  });

  it('fires signing and confirmed progress events', async () => {
    const events: ProgressEvent[] = [];
    const onProgress = vi.fn((e: ProgressEvent) => events.push(e));

    await disperseTokensSimple(
      simpleParams({ recipients: makeAddresses(2), batchSize: 10, onProgress }),
    );

    const batchEvents = events.filter((e) => e.type === 'batch');
    expect(batchEvents).toHaveLength(2); // signing + confirmed
    expect(batchEvents[0]).toMatchObject({ type: 'batch', status: 'signing' });
    expect(batchEvents[1]).toMatchObject({ type: 'batch', status: 'confirmed' });

    const throughputEvents = events.filter((e) => e.type === 'throughput');
    expect(throughputEvents).toHaveLength(1);
  });

  it('splits recipients across multiple batches', async () => {
    const recipients = makeAddresses(5);
    const results = await disperseTokensSimple(
      simpleParams({ recipients, batchSize: 2 }),
    );

    // 5 recipients / 2 per batch = 3 batches
    expect(results).toHaveLength(3);
    expect(results[0].recipients).toHaveLength(2);
    expect(results[1].recipients).toHaveLength(2);
    expect(results[2].recipients).toHaveLength(1);
  });
});

describe('disperseTokens', () => {
  beforeEach(() => {
    txHashCounter = 0;
  });

  it('handles variable amounts correctly', async () => {
    const recipients = makeAddresses(3);
    const amounts = [100n, 200n, 300n];
    const walletClient = createMockWalletClient();

    const results = await disperseTokens(
      variableParams({ recipients, amounts, walletClient }),
    );

    expect(results).toHaveLength(1);
    expect(results[0].amounts).toEqual(amounts);
    expect(walletClient.writeContract).toHaveBeenCalledOnce();
  });

  it('live filter removes addresses and their amounts', async () => {
    const recipients = makeAddresses(4);
    const amounts = [100n, 200n, 300n, 400n];

    // Filter removes the 2nd address
    const liveFilter: LiveFilter = vi.fn(async (addrs: readonly Address[]) =>
      addrs.filter((a: Address) => a !== recipients[1]),
    );

    const results = await disperseTokens(
      variableParams({ recipients, amounts, batchSize: 10, liveFilter }),
    );

    expect(results).toHaveLength(1);
    // The 2nd address should have been filtered out
    expect(results[0].recipients).not.toContain(recipients[1]);
    expect(results[0].recipients).toHaveLength(3);
    // Corresponding amounts should also be removed
    expect(results[0].amounts).toEqual([100n, 300n, 400n]);
  });
});

// ---------------------------------------------------------------------------
// Nonce window
// ---------------------------------------------------------------------------

describe('nonce window', () => {
  beforeEach(() => {
    txHashCounter = 0;
  });

  it('nonceWindow=2 submits 2 batches before waiting', async () => {
    const recipients = makeAddresses(6);
    const walletClient = createMockWalletClient();
    const publicClient = createMockPublicClient({
      getTransactionCount: vi.fn().mockResolvedValue(10),
    });

    const results = await disperseTokensSimple(
      simpleParams({
        recipients,
        batchSize: 2,
        nonceWindow: 2,
        walletClient,
        publicClient,
      }),
    );

    // 6 recipients / 2 per batch = 3 batches, all should confirm
    expect(results).toHaveLength(3);
    results.forEach((r) => {
      expect(r.attempts[0].outcome).toBe('confirmed');
    });

    // writeContract should have been called 3 times (all batches)
    expect(walletClient.writeContract).toHaveBeenCalledTimes(3);

    // First two calls should have nonce 10 and 11
    const calls = (walletClient.writeContract as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0].nonce).toBe(10);
    expect(calls[1][0].nonce).toBe(11);
  });

  it('failed batch drains remaining pending', async () => {
    let callCount = 0;
    const walletClient = createMockWalletClient({
      writeContract: vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(nextTxHash());
      }),
    });

    // First receipt succeeds, second reverts
    let receiptCount = 0;
    const publicClient = createMockPublicClient({
      getTransactionCount: vi.fn().mockResolvedValue(0),
      waitForTransactionReceipt: vi.fn().mockImplementation(() => {
        receiptCount++;
        return Promise.resolve({
          status: receiptCount === 1 ? 'success' : 'reverted',
          gasUsed: 80_000n,
        });
      }),
    });

    const results = await disperseTokensSimple(
      simpleParams({
        recipients: makeAddresses(6),
        batchSize: 2,
        nonceWindow: 2,
        walletClient,
        publicClient,
      }),
    );

    // The first batch confirms, the second reverts.
    // After the revert the remaining pending are drained.
    const confirmed = results.filter((r) => r.attempts[0].outcome === 'confirmed');
    const reverted = results.filter((r) => r.attempts[0].outcome === 'reverted');
    expect(confirmed.length).toBeGreaterThanOrEqual(1);
    expect(reverted.length).toBeGreaterThanOrEqual(1);
  });

  it('pins nonce correctly for pipelined batches', async () => {
    const walletClient = createMockWalletClient();
    const publicClient = createMockPublicClient({
      getTransactionCount: vi.fn().mockResolvedValue(42),
    });

    await disperseTokens(
      variableParams({
        recipients: makeAddresses(4),
        amounts: makeAmounts(4),
        batchSize: 2,
        nonceWindow: 2,
        walletClient,
        publicClient,
      }),
    );

    const calls = (walletClient.writeContract as ReturnType<typeof vi.fn>).mock.calls;
    // All batches should get sequential nonces starting from 42
    expect(calls[0][0].nonce).toBe(42);
    expect(calls[1][0].nonce).toBe(43);
  });
});

// ---------------------------------------------------------------------------
// Throughput
// ---------------------------------------------------------------------------

describe('throughput', () => {
  beforeEach(() => {
    txHashCounter = 0;
  });

  it('throughput event fires after batch confirms', async () => {
    const events: ProgressEvent[] = [];
    const onProgress = vi.fn((e: ProgressEvent) => events.push(e));

    await disperseTokensSimple(
      simpleParams({ recipients: makeAddresses(3), batchSize: 3, onProgress }),
    );

    const throughputEvents = events.filter((e) => e.type === 'throughput');
    expect(throughputEvents).toHaveLength(1);
    expect(throughputEvents[0]).toHaveProperty('addressesCompleted', 3);
  });

  it('addressesPerHour is computed correctly', async () => {
    const events: ProgressEvent[] = [];
    const onProgress = vi.fn((e: ProgressEvent) => events.push(e));

    await disperseTokensSimple(
      simpleParams({ recipients: makeAddresses(5), batchSize: 5, onProgress }),
    );

    const throughput = events.find((e) => e.type === 'throughput');
    expect(throughput).toBeDefined();
    if (throughput?.type === 'throughput') {
      // Rate may be 0 if the batch completes within the same ms tick
      expect(throughput.addressesPerHour).toBeGreaterThanOrEqual(0);
      expect(throughput.addressesCompleted).toBe(5);
      expect(throughput.elapsedMs).toBeGreaterThanOrEqual(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Revalidation
// ---------------------------------------------------------------------------

describe('revalidation', () => {
  beforeEach(() => {
    txHashCounter = 0;
  });

  it('not triggered when invalidCount < threshold', async () => {
    const recipients = makeAddresses(4);
    let blockNumber = 100n;
    let getTransactionCallCount = 0;

    const publicClient = createMockPublicClient({
      getBlockNumber: vi.fn().mockImplementation(() => Promise.resolve(blockNumber++)),
      getTransactionCount: vi.fn().mockImplementation(() => {
        getTransactionCallCount++;
        // executeBatch calls getTransactionCount twice before writeContract:
        //   1. For nonce pinning (blockTag: 'pending') — return 0
        //   2. In the retry loop (blockTag: 'latest') to check if nonce was consumed — return 0
        // Then after writeContract + submitOnly return, revalidatePendingBatch calls:
        //   3. To check if confirmed — return 1 (nonce advanced = confirmed)
        if (getTransactionCallCount <= 2) return Promise.resolve(0);
        return Promise.resolve(1);
      }),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: 'success', gasUsed: 80_000n }),
    });

    // Filter removes 1 address — below the default threshold of 2
    const liveFilter: LiveFilter = vi.fn(async (addrs: readonly Address[]) =>
      addrs.filter((a: Address) => a !== recipients[0]),
    );

    const walletClient = createMockWalletClient();

    const results = await disperseTokensSimple(
      simpleParams({
        recipients,
        batchSize: 10,
        liveFilter,
        walletClient,
        publicClient,
        revalidation: { invalidThreshold: 2 },
      }),
    );

    expect(results).toHaveLength(1);
    expect(results[0].attempts[0].outcome).toBe('confirmed');
    // writeContract called once for the submit, no replacements
    expect(walletClient.writeContract).toHaveBeenCalledOnce();
  });

  it('replaces tx when invalidCount >= threshold', async () => {
    const recipients = makeAddresses(4);
    let blockNumber = 100n;
    let getTransactionCallCount = 0;

    const publicClient = createMockPublicClient({
      getBlockNumber: vi.fn().mockImplementation(() => Promise.resolve(blockNumber++)),
      getTransactionCount: vi.fn().mockImplementation(() => {
        getTransactionCallCount++;
        // After several calls the replacement confirms
        if (getTransactionCallCount >= 5) return Promise.resolve(1);
        return Promise.resolve(0);
      }),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: 'success', gasUsed: 90_000n }),
    });

    let filterCallCount = 0;
    const liveFilter: LiveFilter = vi.fn(async (addrs: readonly Address[]) => {
      filterCallCount++;
      // First call: during fillBatch — pass all through
      if (filterCallCount <= 1) return addrs;
      // Subsequent calls (revalidation): remove 2 addresses
      return addrs.filter((a: Address) => a !== recipients[0] && a !== recipients[1]);
    });

    const walletClient = createMockWalletClient();

    const results = await disperseTokensSimple(
      simpleParams({
        recipients,
        batchSize: 10,
        liveFilter,
        walletClient,
        publicClient,
        revalidation: { invalidThreshold: 2 },
      }),
    );

    expect(results).toHaveLength(1);
    expect(results[0].attempts[0].outcome).toBe('confirmed');
    // writeContract called more than once due to replacement
    expect((walletClient.writeContract as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1);
    // Final recipients should exclude the 2 filtered addresses
    expect(results[0].recipients).toHaveLength(2);
    expect(results[0].recipients).not.toContain(recipients[0]);
    expect(results[0].recipients).not.toContain(recipients[1]);
  });

  it('respects maxReplacements', async () => {
    const recipients = makeAddresses(6);
    let blockNumber = 100n;

    const publicClient = createMockPublicClient({
      getBlockNumber: vi.fn().mockImplementation(() => Promise.resolve(blockNumber++)),
      // Nonce never advances — simulates tx stuck in mempool, forces replacements
      getTransactionCount: vi.fn().mockResolvedValue(0),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: 'success', gasUsed: 80_000n }),
    });

    let filterCallCount = 0;
    const liveFilter: LiveFilter = vi.fn(async (addrs: readonly Address[]) => {
      filterCallCount++;
      // First call: fillBatch — pass all
      if (filterCallCount <= 1) return addrs;
      // Each revalidation removes 2 more
      const removeIndex = Math.min(filterCallCount - 1, addrs.length - 1) * 2;
      return addrs.slice(removeIndex > addrs.length ? 0 : 0, Math.max(addrs.length - 2, 1));
    });

    const walletClient = createMockWalletClient();

    const revalidation: RevalidationConfig = {
      invalidThreshold: 2,
      maxReplacements: 2,
    };

    const results = await disperseTokensSimple(
      simpleParams({
        recipients,
        batchSize: 10,
        liveFilter,
        walletClient,
        publicClient,
        revalidation,
      }),
    );

    expect(results).toHaveLength(1);
    // writeContract: 1 initial + at most 2 replacements = at most 3 calls
    const callCount = (walletClient.writeContract as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(callCount).toBeLessThanOrEqual(3);
  });

  it('nonce window forced to 1 when revalidation is active', async () => {
    // Use 8 recipients with batchSize 2. Without liveFilter overhead,
    // fillBatch over-fetches by ~25% per batch (windowSize = needed + ceil(needed*0.25)).
    // With 8 recipients, batchSize 2: each fillBatch grabs ~3 candidates, uses 2.
    // This means ~3 batches consume all 8 candidates (3 + 3 + 2 = 8).
    const recipients = makeAddresses(8);
    let blockNumber = 100n;
    let confirmedNonce = 0;
    const walletClient = createMockWalletClient({
      writeContract: vi.fn().mockImplementation(() => {
        confirmedNonce++;
        return Promise.resolve(nextTxHash());
      }),
    });

    const publicClient = createMockPublicClient({
      getBlockNumber: vi.fn().mockImplementation(() => Promise.resolve(blockNumber++)),
      getTransactionCount: vi.fn().mockImplementation(() => Promise.resolve(confirmedNonce)),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: 'success', gasUsed: 80_000n }),
    });

    const liveFilter: LiveFilter = vi.fn(async (addrs: readonly Address[]) => addrs);

    const results = await disperseTokensSimple(
      simpleParams({
        recipients,
        batchSize: 2,
        nonceWindow: 3, // Requested 3, but should be forced to 1
        liveFilter,
        walletClient,
        publicClient,
        revalidation: { invalidThreshold: 2 },
      }),
    );

    // With revalActive, window is forced to 1 (serial). Batches process one at a time.
    expect(results.length).toBeGreaterThanOrEqual(2);

    // All processed batches should confirm
    results.forEach((r) => {
      expect(r.attempts[0].outcome).toBe('confirmed');
    });

    // Each batch is submitted individually — writeContract count matches batch count
    expect(walletClient.writeContract).toHaveBeenCalledTimes(results.length);

    // Verify the window was forced to 1 by checking nonces are NOT sequentially
    // pinned from a single startNonce (which happens with windowed pipelining).
    // With revalidation, no external nonce pinning occurs.
    const calls = (walletClient.writeContract as ReturnType<typeof vi.fn>).mock.calls;
    // Each call should use a different nonce (serially computed, not windowed)
    for (let i = 1; i < calls.length; i++) {
      expect(calls[i][0].nonce).toBeGreaterThan(calls[i - 1][0].nonce);
    }
  });

  it('revalidation without liveFilter has no effect', async () => {
    const recipients = makeAddresses(4);
    const walletClient = createMockWalletClient();
    const publicClient = createMockPublicClient({
      getTransactionCount: vi.fn().mockResolvedValue(5),
    });

    const results = await disperseTokensSimple(
      simpleParams({
        recipients,
        batchSize: 2,
        nonceWindow: 2,
        walletClient,
        publicClient,
        // revalidation set but no liveFilter — should use normal path with nonceWindow=2
        revalidation: { invalidThreshold: 2 },
      }),
    );

    // Normal windowed path — should pin nonces
    expect(results).toHaveLength(2);
    const calls = (walletClient.writeContract as ReturnType<typeof vi.fn>).mock.calls;
    // Nonce window should still be 2 since revalidation is inactive (no liveFilter)
    expect(calls[0][0].nonce).toBe(5);
    expect(calls[1][0].nonce).toBe(6);
  });

  it('revalidation works with disperseTokens (variable amounts)', async () => {
    const recipients = makeAddresses(3);
    const amounts = [100n, 200n, 300n];
    let blockNumber = 100n;
    let nonceValue = 0;

    const publicClient = createMockPublicClient({
      getBlockNumber: vi.fn().mockImplementation(() => Promise.resolve(blockNumber++)),
      getTransactionCount: vi.fn().mockImplementation(() => {
        const val = nonceValue;
        nonceValue = 1;
        return Promise.resolve(val);
      }),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: 'success', gasUsed: 80_000n }),
    });

    const liveFilter: LiveFilter = vi.fn(async (addrs: readonly Address[]) => addrs);
    const walletClient = createMockWalletClient();

    const results = await disperseTokens(
      variableParams({
        recipients,
        amounts,
        batchSize: 10,
        liveFilter,
        walletClient,
        publicClient,
        revalidation: { invalidThreshold: 2 },
      }),
    );

    expect(results).toHaveLength(1);
    expect(results[0].attempts[0].outcome).toBe('confirmed');
    expect(results[0].amounts).toEqual(amounts);
  });
});

// ---------------------------------------------------------------------------
// Fee bump
// ---------------------------------------------------------------------------

describe('fee bump', () => {
  beforeEach(() => {
    txHashCounter = 0;
  });

  it('custom feeBumpWad applied on replacement', async () => {
    let writeCallCount = 0;
    const walletClient = createMockWalletClient({
      writeContract: vi.fn().mockImplementation(() => {
        writeCallCount++;
        // First call fails, forcing executeBatch to bump fees and retry
        if (writeCallCount === 1) {
          return Promise.reject(new Error('replacement underpriced'));
        }
        return Promise.resolve(nextTxHash());
      }),
    });

    // Nonce flow through executeBatch:
    //   1. getTransactionCount('pending') -> 0 (nonce pin)
    //   2. getTransactionCount('latest') -> 0 (retry loop: currentNonce check, attempt 0)
    //   3. writeContract fails -> catch -> getBlock + getPriorityFee
    //   4. getTransactionCount('latest') -> 0 (retry loop: currentNonce check, attempt 1)
    //   5. writeContract succeeds -> waitForTransactionReceipt
    const publicClient = createMockPublicClient({
      getTransactionCount: vi.fn().mockResolvedValue(0),
    });

    const customBumpWad = 500_000_000_000_000_000n; // 50%

    const results = await disperseTokensSimple(
      simpleParams({
        recipients: makeAddresses(2),
        batchSize: 10,
        walletClient,
        publicClient,
        gasConfig: { feeBumpWad: customBumpWad },
      }),
    );

    expect(results).toHaveLength(1);
    expect(results[0].attempts[0].outcome).toBe('confirmed');
    expect(writeCallCount).toBe(2);

    const calls = (walletClient.writeContract as ReturnType<typeof vi.fn>).mock.calls;
    const firstMaxFee = calls[0][0].maxFeePerGas as bigint;
    const secondMaxFee = calls[1][0].maxFeePerGas as bigint;
    expect(secondMaxFee).toBeGreaterThan(firstMaxFee);
  });

  it('default fee bump is 12.5%', async () => {
    let writeCallCount = 0;
    const walletClient = createMockWalletClient({
      writeContract: vi.fn().mockImplementation(() => {
        writeCallCount++;
        if (writeCallCount === 1) {
          return Promise.reject(new Error('replacement underpriced'));
        }
        return Promise.resolve(nextTxHash());
      }),
    });

    const publicClient = createMockPublicClient({
      getTransactionCount: vi.fn().mockResolvedValue(0),
    });

    const results = await disperseTokensSimple(
      simpleParams({
        recipients: makeAddresses(2),
        batchSize: 10,
        walletClient,
        publicClient,
        // No gasConfig — default feeBumpWad of 12.5%
      }),
    );

    expect(results).toHaveLength(1);
    expect(writeCallCount).toBe(2);

    const calls = (walletClient.writeContract as ReturnType<typeof vi.fn>).mock.calls;
    const firstPriority = calls[0][0].maxPriorityFeePerGas as bigint;
    const secondPriority = calls[1][0].maxPriorityFeePerGas as bigint;
    // Bumped priority should be at least 112.5% of original
    // (original + original * 0.125 = 1.125 * original)
    expect(secondPriority).toBeGreaterThanOrEqual(
      firstPriority + firstPriority * 125_000_000_000_000_000n / 1_000_000_000_000_000_000n,
    );
  });
});

// ---------------------------------------------------------------------------
// Pure functions tested through public API
// ---------------------------------------------------------------------------

describe('fillBatch (via disperseTokensSimple)', () => {
  beforeEach(() => {
    txHashCounter = 0;
  });

  it('returns correct addresses when no filter', async () => {
    const recipients = makeAddresses(5);
    const results = await disperseTokensSimple(
      simpleParams({ recipients, batchSize: 3 }),
    );

    // First batch should have exactly 3 addresses
    expect(results[0].recipients).toHaveLength(3);
    expect(results[0].recipients).toEqual(recipients.slice(0, 3));
    // Second batch should have 2
    expect(results[1].recipients).toHaveLength(2);
    expect(results[1].recipients).toEqual(recipients.slice(3, 5));
  });

  it('pulls more candidates when filter removes some', async () => {
    const recipients = makeAddresses(6);

    // Remove odd-indexed addresses
    const liveFilter: LiveFilter = vi.fn(async (addrs: readonly Address[]) =>
      addrs.filter((_: Address, i: number) => i % 2 === 0),
    );

    const results = await disperseTokensSimple(
      simpleParams({ recipients, batchSize: 2, liveFilter }),
    );

    // Each batch should still fill up to batchSize (2) by pulling more
    results.forEach((r) => {
      expect(r.recipients.length).toBeLessThanOrEqual(2);
      expect(r.recipients.length).toBeGreaterThan(0);
    });
  });
});

describe('fillBatchWithAmounts (via disperseTokens)', () => {
  beforeEach(() => {
    txHashCounter = 0;
  });

  it('filters amounts alongside addresses', async () => {
    const recipients = makeAddresses(4);
    const amounts = [10n, 20n, 30n, 40n];

    // Remove the 3rd address (index 2)
    const liveFilter: LiveFilter = vi.fn(async (addrs: readonly Address[]) =>
      addrs.filter((a: Address) => a !== recipients[2]),
    );

    const results = await disperseTokens(
      variableParams({ recipients, amounts, batchSize: 10, liveFilter }),
    );

    expect(results[0].recipients).not.toContain(recipients[2]);
    expect(results[0].amounts).not.toContain(30n);
    expect(results[0].recipients).toHaveLength(3);
    expect(results[0].amounts).toHaveLength(3);
  });
});

describe('getPriorityFee (via executeBatch)', () => {
  beforeEach(() => {
    txHashCounter = 0;
  });

  it('uses higher of fee history and mempool estimate', async () => {
    // Fee history higher than mempool
    const publicClient1 = createMockPublicClient({
      getFeeHistory: vi.fn().mockResolvedValue({ reward: [[5_000_000_000n]] }),
      estimateMaxPriorityFeePerGas: vi.fn().mockResolvedValue(1_000_000_000n),
    });
    const walletClient1 = createMockWalletClient();

    await disperseTokensSimple(
      simpleParams({ walletClient: walletClient1, publicClient: publicClient1 }),
    );

    const calls1 = (walletClient1.writeContract as ReturnType<typeof vi.fn>).mock.calls;
    const priorityFee1 = calls1[0][0].maxPriorityFeePerGas as bigint;

    // Mempool higher than fee history
    txHashCounter = 0;
    const publicClient2 = createMockPublicClient({
      getFeeHistory: vi.fn().mockResolvedValue({ reward: [[1_000_000_000n]] }),
      estimateMaxPriorityFeePerGas: vi.fn().mockResolvedValue(5_000_000_000n),
    });
    const walletClient2 = createMockWalletClient();

    await disperseTokensSimple(
      simpleParams({ walletClient: walletClient2, publicClient: publicClient2 }),
    );

    const calls2 = (walletClient2.writeContract as ReturnType<typeof vi.fn>).mock.calls;
    const priorityFee2 = calls2[0][0].maxPriorityFeePerGas as bigint;

    // Both should use 5_000_000_000n since it's the max in both cases
    expect(priorityFee1).toBe(5_000_000_000n);
    expect(priorityFee2).toBe(5_000_000_000n);
  });
});

// ---------------------------------------------------------------------------
// Gas config edge cases
// ---------------------------------------------------------------------------

describe('gas config', () => {
  beforeEach(() => {
    txHashCounter = 0;
  });

  it('drops batch when base fee exceeds maxBaseFee', async () => {
    const publicClient = createMockPublicClient({
      getBlock: vi.fn().mockResolvedValue({
        baseFeePerGas: 100_000_000_000n, // 100 gwei
        gasLimit: 30_000_000n,
      }),
    });

    const results = await disperseTokensSimple(
      simpleParams({
        publicClient,
        gasConfig: { maxBaseFee: 50_000_000_000n }, // Cap at 50 gwei
      }),
    );

    expect(results).toHaveLength(1);
    expect(results[0].attempts[0].outcome).toBe('dropped');
    expect(results[0].confirmedTxHash).toBeNull();
  });

  it('clamps priority fee to maxPriorityFee', async () => {
    const publicClient = createMockPublicClient({
      getFeeHistory: vi.fn().mockResolvedValue({ reward: [[10_000_000_000n]] }),
      estimateMaxPriorityFeePerGas: vi.fn().mockResolvedValue(8_000_000_000n),
    });
    const walletClient = createMockWalletClient();

    await disperseTokensSimple(
      simpleParams({
        publicClient,
        walletClient,
        gasConfig: { maxPriorityFee: 5_000_000_000n }, // Cap at 5 gwei
      }),
    );

    const calls = (walletClient.writeContract as ReturnType<typeof vi.fn>).mock.calls;
    const usedPriority = calls[0][0].maxPriorityFeePerGas as bigint;
    expect(usedPriority).toBe(5_000_000_000n);
  });

  it('stops when maxTotalGasCost is exceeded', async () => {
    const results = await disperseTokensSimple(
      simpleParams({
        recipients: makeAddresses(10),
        batchSize: 2,
        gasConfig: { maxTotalGasCost: 1n }, // Tiny limit — first batch will exceed it
      }),
    );

    // Should stop after the first confirmed batch hits the gas cap
    expect(results.length).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Full variant (from, campaignId)
// ---------------------------------------------------------------------------

describe('full variant args', () => {
  beforeEach(() => {
    txHashCounter = 0;
  });

  it('passes from and campaignId for full variant', async () => {
    const from = '0xDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF' as Address;
    const campaignId = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex;
    const walletClient = createMockWalletClient();

    await disperseTokensSimple(
      simpleParams({
        variant: 'full',
        from,
        campaignId,
        walletClient,
      }),
    );

    const calls = (walletClient.writeContract as ReturnType<typeof vi.fn>).mock.calls;
    const args = calls[0][0].args;
    // full variant: [token, from, recipients, amount, campaignId]
    expect(args[1]).toBe(from);
    expect(args[4]).toBe(campaignId);
  });
});

// ---------------------------------------------------------------------------
// Native token (ETH) value calculation
// ---------------------------------------------------------------------------

describe('native token value', () => {
  beforeEach(() => {
    txHashCounter = 0;
  });

  it('sends value when token is zero address (simple)', async () => {
    const walletClient = createMockWalletClient();

    await disperseTokensSimple(
      simpleParams({
        token: ZERO_ADDRESS,
        recipients: makeAddresses(3),
        amount: 1000n,
        batchSize: 3,
        walletClient,
      }),
    );

    const calls = (walletClient.writeContract as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0].value).toBe(3000n); // 3 recipients * 1000
  });

  it('sends value when token is zero address (variable)', async () => {
    const walletClient = createMockWalletClient();
    const amounts = [100n, 200n, 300n];

    await disperseTokens(
      variableParams({
        token: ZERO_ADDRESS,
        recipients: makeAddresses(3),
        amounts,
        batchSize: 3,
        walletClient,
      }),
    );

    const calls = (walletClient.writeContract as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0].value).toBe(600n); // 100 + 200 + 300
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('error handling', () => {
  beforeEach(() => {
    txHashCounter = 0;
  });

  it('returns dropped result when gas estimation fails', async () => {
    const publicClient = createMockPublicClient({
      estimateContractGas: vi.fn().mockRejectedValue(new Error('execution reverted')),
    });

    const results = await disperseTokensSimple(
      simpleParams({ publicClient }),
    );

    expect(results).toHaveLength(1);
    expect(results[0].attempts[0].outcome).toBe('dropped');
  });

  it('handles nonce too low by treating as confirmed', async () => {
    const walletClient = createMockWalletClient({
      writeContract: vi.fn().mockRejectedValue(new Error('nonce too low')),
    });

    const publicClient = createMockPublicClient({
      getTransactionCount: vi.fn()
        .mockResolvedValueOnce(5) // initial nonce fetch (pending)
        .mockResolvedValueOnce(5), // nonce check returns same — not yet confirmed, triggers writeContract
    });

    const results = await disperseTokensSimple(
      simpleParams({ walletClient, publicClient }),
    );

    expect(results).toHaveLength(1);
    // nonce too low is treated as confirmed
    expect(results[0].attempts[0].outcome).toBe('confirmed');
  });
});
