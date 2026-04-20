import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Address, Hex, PublicClient, WalletClient } from 'viem';

import {
  approveOperator,
  increaseOperatorAllowance,
  getAllowance,
} from '../distributor/allowance.js';
import { checkRecipients } from '../distributor/registry.js';
import type { BatchAttempt, BatchResult, ProgressEvent } from '../types.js';

// ---------------------------------------------------------------------------
// disperse-parallel.ts sits on top of disperseTokens / disperseTokensSimple —
// mock that module so we can exercise the partition / offset / event-wrap logic
// without running the real disperse pipeline.
// ---------------------------------------------------------------------------

const disperseFakes = vi.hoisted(() => ({
  disperseTokens: vi.fn(),
  disperseTokensSimple: vi.fn(),
}));

vi.mock('../distributor/disperse.js', () => ({
  disperseTokens: disperseFakes.disperseTokens,
  disperseTokensSimple: disperseFakes.disperseTokensSimple,
  // The real module exports more symbols; these are the only two disperse-parallel
  // touches. Tests that need others should import them from a non-mocked path.
}));

// Imported after vi.mock so the mocked copies bind.
const { disperseParallel } = await import('../distributor/disperse-parallel.js');

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const CONTRACT = '0xc0c0000000000000000000000000000000000001' as Address;
const TOKEN = '0x7070000000000000000000000000000000000002' as Address;
const OPERATOR = '0x0909000000000000000000000000000000000003' as Address;
const OWNER = '0x0b0b000000000000000000000000000000000004' as Address;
const SELECTOR: Hex = '0xaabbccdd';
const TX_HASH: Hex = '0x1111111111111111111111111111111111111111111111111111111111111111';

function addr(n: number): Address {
  return `0x${n.toString(16).padStart(40, '0')}` as Address;
}

function recipients(count: number): Address[] {
  return Array.from({ length: count }, (_, i) => addr(i + 1));
}

function fakeAttempt(overrides: Partial<BatchAttempt> = {}): BatchAttempt {
  return {
    txHash: TX_HASH,
    nonce: 0,
    gasEstimate: 21_000n,
    maxFeePerGas: 1_000n,
    maxPriorityFeePerGas: 100n,
    timestamp: 0,
    outcome: 'confirmed',
    ...overrides,
  };
}

function fakeResult(batchIndex: number, recipients: readonly Address[]): BatchResult {
  return {
    batchIndex,
    recipients,
    amounts: recipients.map(() => 1n),
    attempts: [fakeAttempt()],
    confirmedTxHash: TX_HASH,
    blockNumber: 1n,
  };
}

function fakeWalletClient(address: Address): WalletClient {
  return {
    account: { address },
    writeContract: vi.fn(async () => TX_HASH),
  } as unknown as WalletClient;
}

function fakePublicClient(overrides: Partial<PublicClient> = {}): PublicClient {
  return {
    waitForTransactionReceipt: vi.fn(async () => ({ status: 'success' })),
    readContract: vi.fn(async () => 0n),
    ...overrides,
  } as unknown as PublicClient;
}

// ---------------------------------------------------------------------------
// allowance.ts
// ---------------------------------------------------------------------------

describe('distributor/allowance.ts', () => {
  describe('approveOperator', () => {
    it('writes approve with the operator/selector/amount triple and awaits the receipt', async () => {
      const walletClient = fakeWalletClient(OWNER);
      const publicClient = fakePublicClient();

      const hash = await approveOperator({
        contractAddress: CONTRACT,
        operator: OPERATOR,
        selector: SELECTOR,
        amount: 1_000n,
        walletClient,
        publicClient,
      });

      expect(hash).toBe(TX_HASH);
      expect(walletClient.writeContract).toHaveBeenCalledTimes(1);
      const call = (walletClient.writeContract as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call).toMatchObject({
        address: CONTRACT,
        functionName: 'approve',
        args: [OPERATOR, SELECTOR, 1_000n],
        account: { address: OWNER },
        chain: undefined,
      });
      expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledWith({ hash: TX_HASH });
    });

    it('propagates rejection from writeContract', async () => {
      const walletClient = {
        account: { address: OWNER },
        writeContract: vi.fn(async () => {
          throw new Error('user rejected');
        }),
      } as unknown as WalletClient;
      const publicClient = fakePublicClient();

      await expect(
        approveOperator({
          contractAddress: CONTRACT,
          operator: OPERATOR,
          selector: SELECTOR,
          amount: 1n,
          walletClient,
          publicClient,
        }),
      ).rejects.toThrow(/user rejected/);
      expect(publicClient.waitForTransactionReceipt).not.toHaveBeenCalled();
    });
  });

  describe('increaseOperatorAllowance', () => {
    it('writes increaseAllowance with the same arg triple', async () => {
      const walletClient = fakeWalletClient(OWNER);
      const publicClient = fakePublicClient();

      const hash = await increaseOperatorAllowance({
        contractAddress: CONTRACT,
        operator: OPERATOR,
        selector: SELECTOR,
        amount: 2_500n,
        walletClient,
        publicClient,
      });

      expect(hash).toBe(TX_HASH);
      const call = (walletClient.writeContract as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call).toMatchObject({
        address: CONTRACT,
        functionName: 'increaseAllowance',
        args: [OPERATOR, SELECTOR, 2_500n],
        account: { address: OWNER },
        chain: undefined,
      });
      expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledWith({ hash: TX_HASH });
    });

    it('still awaits the receipt even when writeContract resolves immediately', async () => {
      const walletClient = fakeWalletClient(OWNER);
      const publicClient = fakePublicClient();

      await increaseOperatorAllowance({
        contractAddress: CONTRACT,
        operator: OPERATOR,
        selector: SELECTOR,
        amount: 1n,
        walletClient,
        publicClient,
      });

      expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledTimes(1);
    });
  });

  describe('getAllowance', () => {
    it('reads allowance(owner, operator, selector) and returns the bigint', async () => {
      const publicClient = fakePublicClient({
        readContract: vi.fn(async () => 5_000n),
      } as Partial<PublicClient>);

      const value = await getAllowance({
        contractAddress: CONTRACT,
        owner: OWNER,
        operator: OPERATOR,
        selector: SELECTOR,
        publicClient,
      });

      expect(value).toBe(5_000n);
      const call = (publicClient.readContract as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call).toMatchObject({
        address: CONTRACT,
        functionName: 'allowance',
        args: [OWNER, OPERATOR, SELECTOR],
      });
    });

    it('propagates readContract rejections', async () => {
      const publicClient = fakePublicClient({
        readContract: vi.fn(async () => {
          throw new Error('rpc unavailable');
        }),
      } as Partial<PublicClient>);

      await expect(
        getAllowance({
          contractAddress: CONTRACT,
          owner: OWNER,
          operator: OPERATOR,
          selector: SELECTOR,
          publicClient,
        }),
      ).rejects.toThrow(/rpc unavailable/);
    });
  });
});

// ---------------------------------------------------------------------------
// disperse-parallel.ts
// ---------------------------------------------------------------------------

describe('distributor/disperse-parallel.ts', () => {
  beforeEach(() => {
    disperseFakes.disperseTokens.mockReset();
    disperseFakes.disperseTokensSimple.mockReset();
  });

  /**
   * `disperseTokensSimple` / `disperseTokens` both receive a lane's slice of
   * recipients. Return one `BatchResult` echoing that slice so tests can assert
   * on the partition without re-running the real batcher.
   */
  function routeToRecipientEcho() {
    const handler = async (args: {
      recipients: readonly Address[];
      onProgress?: (event: ProgressEvent) => void;
    }) => {
      // Emit one batch + one tx event so tests can check the offset wrapping.
      args.onProgress?.({ type: 'batch', batchIndex: 0, totalBatches: 1, status: 'confirmed' });
      args.onProgress?.({ type: 'tx', batchIndex: 0, attempt: fakeAttempt() });
      args.onProgress?.({
        type: 'throughput',
        addressesCompleted: args.recipients.length,
        addressesPerHour: 1_000,
        elapsedMs: 1,
        estimatedRemainingMs: 0,
      });
      return [fakeResult(0, args.recipients)];
    };
    disperseFakes.disperseTokens.mockImplementation(handler);
    disperseFakes.disperseTokensSimple.mockImplementation(handler);
  }

  it('routes to disperseTokensSimple when a uniform `amount` is provided', async () => {
    routeToRecipientEcho();
    const walletClient = fakeWalletClient(OWNER);

    const results = await disperseParallel({
      contractAddress: CONTRACT,
      variant: 'simple',
      token: TOKEN,
      recipients: recipients(3),
      amount: 7n,
      walletClients: [walletClient],
      publicClient: fakePublicClient(),
    });

    expect(disperseFakes.disperseTokensSimple).toHaveBeenCalledTimes(1);
    expect(disperseFakes.disperseTokens).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0].results[0].recipients).toHaveLength(3);
  });

  it('routes to disperseTokens when variable `amounts` is provided, slicing amounts per lane', async () => {
    routeToRecipientEcho();
    const walletA = fakeWalletClient(addr(0xa));
    const walletB = fakeWalletClient(addr(0xb));

    await disperseParallel({
      contractAddress: CONTRACT,
      variant: 'full',
      token: TOKEN,
      recipients: recipients(4),
      amounts: [10n, 20n, 30n, 40n],
      walletClients: [walletA, walletB],
      publicClient: fakePublicClient(),
    });

    expect(disperseFakes.disperseTokens).toHaveBeenCalledTimes(2);
    expect(disperseFakes.disperseTokensSimple).not.toHaveBeenCalled();
    const laneAArgs = disperseFakes.disperseTokens.mock.calls[0][0];
    const laneBArgs = disperseFakes.disperseTokens.mock.calls[1][0];
    expect(laneAArgs.amounts).toEqual([10n, 20n]);
    expect(laneBArgs.amounts).toEqual([30n, 40n]);
  });

  it('partitions evenly when the recipient count divides the wallet count', async () => {
    routeToRecipientEcho();
    const wallets = [fakeWalletClient(addr(0xa)), fakeWalletClient(addr(0xb))];

    await disperseParallel({
      contractAddress: CONTRACT,
      variant: 'simple',
      token: TOKEN,
      recipients: recipients(6),
      amount: 1n,
      walletClients: wallets,
      publicClient: fakePublicClient(),
    });

    const laneA = disperseFakes.disperseTokensSimple.mock.calls[0][0];
    const laneB = disperseFakes.disperseTokensSimple.mock.calls[1][0];
    expect(laneA.recipients).toHaveLength(3);
    expect(laneB.recipients).toHaveLength(3);
  });

  it('partitions with the remainder on the first lane when uneven', async () => {
    routeToRecipientEcho();
    const wallets = [fakeWalletClient(addr(0xa)), fakeWalletClient(addr(0xb))];

    await disperseParallel({
      contractAddress: CONTRACT,
      variant: 'simple',
      token: TOKEN,
      recipients: recipients(5),
      amount: 1n,
      walletClients: wallets,
      publicClient: fakePublicClient(),
    });

    const laneA = disperseFakes.disperseTokensSimple.mock.calls[0][0];
    const laneB = disperseFakes.disperseTokensSimple.mock.calls[1][0];
    // Math.ceil(5/2) = 3 → lane A gets 3, lane B gets the remaining 2.
    expect(laneA.recipients).toHaveLength(3);
    expect(laneB.recipients).toHaveLength(2);
  });

  it('drops lanes that would receive zero recipients', async () => {
    routeToRecipientEcho();
    // 2 recipients across 4 wallets → Math.ceil(2/4) = 1, first two lanes get
    // one recipient each, trailing two lanes are empty and must not dispatch.
    const wallets = [
      fakeWalletClient(addr(0xa)),
      fakeWalletClient(addr(0xb)),
      fakeWalletClient(addr(0xc)),
      fakeWalletClient(addr(0xd)),
    ];

    const results = await disperseParallel({
      contractAddress: CONTRACT,
      variant: 'simple',
      token: TOKEN,
      recipients: recipients(2),
      amount: 1n,
      walletClients: wallets,
      publicClient: fakePublicClient(),
    });

    expect(disperseFakes.disperseTokensSimple).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(2);
  });

  it('offsets batchIndex by walletIndex * 1000 on batch + tx progress events; other events pass through', async () => {
    routeToRecipientEcho();
    const wallets = [fakeWalletClient(addr(0xa)), fakeWalletClient(addr(0xb))];
    const events: ProgressEvent[] = [];

    await disperseParallel({
      contractAddress: CONTRACT,
      variant: 'simple',
      token: TOKEN,
      recipients: recipients(4),
      amount: 1n,
      walletClients: wallets,
      publicClient: fakePublicClient(),
      onProgress: (event) => events.push(event),
    });

    const batchIndices = events
      .filter((e): e is Extract<ProgressEvent, { type: 'batch' }> => e.type === 'batch')
      .map((e) => e.batchIndex)
      .sort();
    expect(batchIndices).toEqual([0, 1000]);

    const txIndices = events
      .filter((e): e is Extract<ProgressEvent, { type: 'tx' }> => e.type === 'tx')
      .map((e) => e.batchIndex)
      .sort();
    expect(txIndices).toEqual([0, 1000]);

    // Throughput events carry no batchIndex and pass through unchanged.
    const throughputCount = events.filter((e) => e.type === 'throughput').length;
    expect(throughputCount).toBe(2);
  });

  it('offsets the batchIndex of returned BatchResult entries', async () => {
    routeToRecipientEcho();
    const wallets = [fakeWalletClient(addr(0xa)), fakeWalletClient(addr(0xb))];

    const results = await disperseParallel({
      contractAddress: CONTRACT,
      variant: 'simple',
      token: TOKEN,
      recipients: recipients(4),
      amount: 1n,
      walletClients: wallets,
      publicClient: fakePublicClient(),
    });

    const resultByLane = new Map(results.map((r) => [r.walletIndex, r]));
    expect(resultByLane.get(0)?.results[0].batchIndex).toBe(0);
    expect(resultByLane.get(1)?.results[0].batchIndex).toBe(1000);
  });

  it('includes walletIndex and walletAddress on each returned lane', async () => {
    routeToRecipientEcho();
    const wallets = [fakeWalletClient(addr(0xa)), fakeWalletClient(addr(0xb))];

    const results = await disperseParallel({
      contractAddress: CONTRACT,
      variant: 'simple',
      token: TOKEN,
      recipients: recipients(4),
      amount: 1n,
      walletClients: wallets,
      publicClient: fakePublicClient(),
    });

    const byIndex = new Map(results.map((r) => [r.walletIndex, r.walletAddress]));
    expect(byIndex.get(0)).toBe(addr(0xa));
    expect(byIndex.get(1)).toBe(addr(0xb));
  });
});

// ---------------------------------------------------------------------------
// registry.ts
// ---------------------------------------------------------------------------

describe('distributor/registry.ts', () => {
  const CAMPAIGN_ID: Hex =
    '0x1111111111111111111111111111111111111111111111111111111111111111';
  const DISTRIBUTOR = addr(0xd);
  const ALICE = addr(0xa);
  const BOB = addr(0xb);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards address/abi/functionName/args to publicClient.readContract', async () => {
    const readContract = vi.fn(async () => [false, true]);
    const publicClient = fakePublicClient({ readContract } as unknown as Partial<PublicClient>);

    const result = await checkRecipients({
      contractAddress: CONTRACT,
      distributor: DISTRIBUTOR,
      campaignId: CAMPAIGN_ID,
      recipients: [ALICE, BOB],
      publicClient,
    });

    expect(result).toEqual([false, true]);
    expect(readContract).toHaveBeenCalledTimes(1);
    const call = (readContract as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call).toMatchObject({
      address: CONTRACT,
      functionName: 'checkRecipients',
      args: [DISTRIBUTOR, CAMPAIGN_ID, [ALICE, BOB]],
    });
    // abi must be present — it's the TitrateFull ABI, not inspected in detail.
    expect(Array.isArray(call.abi)).toBe(true);
  });

  it('returns an empty array when given no recipients', async () => {
    const readContract = vi.fn(async () => []);
    const publicClient = fakePublicClient({ readContract } as unknown as Partial<PublicClient>);

    const result = await checkRecipients({
      contractAddress: CONTRACT,
      distributor: DISTRIBUTOR,
      campaignId: CAMPAIGN_ID,
      recipients: [],
      publicClient,
    });

    expect(result).toEqual([]);
    const call = (readContract as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.args[2]).toEqual([]);
  });

  it('propagates errors from readContract', async () => {
    const readContract = vi.fn(async () => {
      throw new Error('execution reverted: unknown campaign');
    });
    const publicClient = fakePublicClient({ readContract } as unknown as Partial<PublicClient>);

    await expect(
      checkRecipients({
        contractAddress: CONTRACT,
        distributor: DISTRIBUTOR,
        campaignId: CAMPAIGN_ID,
        recipients: [ALICE],
        publicClient,
      }),
    ).rejects.toThrow('execution reverted: unknown campaign');
  });
});
