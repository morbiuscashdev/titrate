import type { Address, Hex, PublicClient, WalletClient } from 'viem';
import type { BatchResult, BatchAttempt, ProgressCallback } from '../types.js';
import type { InterventionConfig } from '../intervention/types.js';
import TitrateSimpleArtifact from './artifacts/TitrateSimple.json' with { type: 'json' };
import TitrateFullArtifact from './artifacts/TitrateFull.json' with { type: 'json' };

export type GasSpeed = 'slow' | 'medium' | 'fast';

const HEADROOM_MULTIPLIERS: Record<GasSpeed, { numerator: bigint; denominator: bigint }> = {
  slow: { numerator: 9n, denominator: 8n },    // 1.125×
  medium: { numerator: 3n, denominator: 2n },   // 1.5×
  fast: { numerator: 2n, denominator: 1n },      // 2×
};

const PRIORITY_PERCENTILES: Record<GasSpeed, number> = {
  slow: 25,
  medium: 50,
  fast: 75,
};

function getAbi(variant: 'simple' | 'full'): never {
  return (variant === 'simple' ? TitrateSimpleArtifact.abi : TitrateFullArtifact.abi) as never;
}

const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;
const WAD = 1_000_000_000_000_000_000n;
const DEFAULT_FEE_BUMP_WAD = 125_000_000_000_000_000n; // 0.125 WAD = 12.5% bump

/**
 * Live filter function applied per-batch before sending.
 * Receives candidate addresses, returns only those that should still receive tokens.
 * Used to filter out addresses that received tokens between batches.
 */
export type LiveFilter = (addresses: readonly Address[]) => Promise<readonly Address[]>;

/**
 * Gas configuration for disperse operations.
 */
export type GasConfig = {
  /** Gas limit multiplier preset: slow=1.125×, medium=1.5×, fast=2×. Default: 'medium'. */
  readonly headroom?: GasSpeed;
  /** Priority fee percentile: slow=25th, medium=50th, fast=75th. Default: 'medium'. */
  readonly priority?: GasSpeed;
  /** Abort batch if base fee (in wei) exceeds this. Default: no cap. */
  readonly maxBaseFee?: bigint;
  /** Clamp priority fee to this max (in wei). Default: no cap. */
  readonly maxPriorityFee?: bigint;
  /** Stop distribution if cumulative gas cost exceeds this (in wei). Default: no limit. */
  readonly maxTotalGasCost?: bigint;
  /**
   * Fee bump additive factor for stuck tx replacement, expressed as a WAD
   * fraction of the current fee. The replacement fee is `current + current * feeBumpWad / 1e18`.
   * Default: 125_000_000_000_000_000n (0.125 WAD = 12.5% bump).
   */
  readonly feeBumpWad?: bigint;
};

export type DisperseParams = {
  readonly contractAddress: Address;
  readonly variant: 'simple' | 'full';
  readonly token: Address;
  readonly recipients: readonly Address[];
  readonly amounts: readonly bigint[];
  readonly from?: Address;
  readonly campaignId?: Hex;
  readonly walletClient: WalletClient;
  readonly publicClient: PublicClient;
  readonly batchSize?: number;
  readonly liveFilter?: LiveFilter;
  readonly onProgress?: ProgressCallback;
  readonly gasConfig?: GasConfig;
  readonly interventionConfig?: InterventionConfig;
};

export type DisperseSimpleParams = {
  readonly contractAddress: Address;
  readonly variant: 'simple' | 'full';
  readonly token: Address;
  readonly recipients: readonly Address[];
  readonly amount: bigint;
  readonly from?: Address;
  readonly campaignId?: Hex;
  readonly walletClient: WalletClient;
  readonly publicClient: PublicClient;
  readonly batchSize?: number;
  readonly liveFilter?: LiveFilter;
  readonly onProgress?: ProgressCallback;
  readonly gasConfig?: GasConfig;
  readonly interventionConfig?: InterventionConfig;
};

/**
 * Fills a batch by streaming through candidates and applying a live filter.
 * Pulls addresses from the source starting at `cursor`, filters each chunk,
 * and accumulates until `batchSize` is reached or the source is exhausted.
 *
 * Returns the filled batch and the new cursor position.
 */
async function fillBatch(
  candidates: readonly Address[],
  cursor: number,
  batchSize: number,
  liveFilter: LiveFilter | undefined,
  filterChunkSize = 500,
): Promise<{ addresses: Address[]; newCursor: number }> {
  const batch: Address[] = [];

  while (batch.length < batchSize && cursor < candidates.length) {
    const needed = batchSize - batch.length;
    const windowSize = liveFilter
      ? Math.min(needed + Math.ceil(needed * 0.25), candidates.length - cursor, filterChunkSize)
      : Math.min(needed, candidates.length - cursor);
    const window = candidates.slice(cursor, cursor + windowSize);
    cursor += window.length;

    const passed = liveFilter ? await liveFilter(window) : window;
    for (const addr of passed) {
      batch.push(addr);
      if (batch.length >= batchSize) break;
    }
  }

  return { addresses: batch, newCursor: cursor };
}

/**
 * Same as fillBatch but also carries parallel amounts from a paired array.
 * Addresses that fail the live filter have their amounts dropped too.
 */
async function fillBatchWithAmounts(
  candidates: readonly Address[],
  candidateAmounts: readonly bigint[],
  cursor: number,
  batchSize: number,
  liveFilter: LiveFilter | undefined,
  filterChunkSize = 500,
): Promise<{ addresses: Address[]; amounts: bigint[]; newCursor: number }> {
  const batchAddrs: Address[] = [];
  const batchAmounts: bigint[] = [];

  while (batchAddrs.length < batchSize && cursor < candidates.length) {
    const needed = batchSize - batchAddrs.length;
    const windowSize = liveFilter
      ? Math.min(needed + Math.ceil(needed * 0.25), candidates.length - cursor, filterChunkSize)
      : Math.min(needed, candidates.length - cursor);
    const windowAddrs = candidates.slice(cursor, cursor + windowSize);
    const windowAmounts = candidateAmounts.slice(cursor, cursor + windowSize);
    cursor += windowSize;

    if (liveFilter) {
      const passed = new Set((await liveFilter(windowAddrs)).map((a) => a.toLowerCase()));
      for (let j = 0; j < windowAddrs.length; j++) {
        if (!passed.has(windowAddrs[j].toLowerCase())) continue;
        batchAddrs.push(windowAddrs[j]);
        batchAmounts.push(windowAmounts[j]);
        if (batchAddrs.length >= batchSize) break;
      }
    } else {
      for (let j = 0; j < windowAddrs.length; j++) {
        batchAddrs.push(windowAddrs[j]);
        batchAmounts.push(windowAmounts[j]);
        if (batchAddrs.length >= batchSize) break;
      }
    }
  }

  return { addresses: batchAddrs, amounts: batchAmounts, newCursor: cursor };
}

/**
 * Disperses variable token amounts to multiple recipients.
 * Streams through the recipient list, applying an optional live filter per-batch.
 * If the filter removes addresses, more are pulled from the source to fill the batch.
 *
 * @param params - Disperse parameters including optional liveFilter
 * @returns Array of batch results with tx hashes and attempt logs
 */
export async function disperseTokens(params: DisperseParams): Promise<BatchResult[]> {
  const {
    contractAddress,
    variant,
    token,
    recipients,
    amounts,
    from = ZERO_ADDRESS,
    campaignId = ZERO_BYTES32,
    walletClient,
    publicClient,
    batchSize = 200,
    liveFilter,
    onProgress,
    gasConfig,
  } = params;

  const abi = getAbi(variant);
  const isNative = token === ZERO_ADDRESS;
  const results: BatchResult[] = [];
  let cursor = 0;
  let batchIndex = 0;
  let cumulativeGasCost = 0n;

  while (cursor < recipients.length) {
    const { addresses: batchRecipients, amounts: batchAmounts, newCursor } =
      await fillBatchWithAmounts(recipients, amounts, cursor, batchSize, liveFilter);
    cursor = newCursor;

    if (batchRecipients.length === 0) break;

    const totalValue = isNative ? batchAmounts.reduce((sum, a) => sum + a, 0n) : 0n;

    onProgress?.({
      type: 'batch',
      batchIndex,
      totalBatches: Math.ceil(recipients.length / batchSize),
      status: 'signing',
    });

    const args: readonly unknown[] =
      variant === 'simple'
        ? [token, batchRecipients, batchAmounts]
        : [token, from, batchRecipients, batchAmounts, campaignId];

    const attempt = await executeBatch({
      contractAddress,
      abi,
      functionName: 'disperse',
      args,
      value: totalValue,
      walletClient,
      publicClient,
      gasConfig,
    });

    if (attempt.outcome === 'confirmed') {
      cumulativeGasCost += attempt.gasEstimate * attempt.maxFeePerGas;
    }

    results.push({
      batchIndex,
      recipients: batchRecipients,
      amounts: batchAmounts,
      attempts: [attempt],
      confirmedTxHash: attempt.outcome === 'confirmed' ? attempt.txHash : null,
      blockNumber: null,
    });

    onProgress?.({
      type: 'batch',
      batchIndex,
      totalBatches: Math.ceil(recipients.length / batchSize),
      status: attempt.outcome === 'confirmed' ? 'confirmed' : 'failed',
    });

    batchIndex++;

    if (gasConfig?.maxTotalGasCost && cumulativeGasCost > gasConfig.maxTotalGasCost) {
      break;
    }
  }

  return results;
}

/**
 * Disperses a uniform token amount to multiple recipients.
 * Streams through the recipient list, applying an optional live filter per-batch.
 * If the filter removes addresses, more are pulled from the source to fill the batch.
 *
 * @param params - Disperse simple parameters including optional liveFilter
 * @returns Array of batch results with tx hashes and attempt logs
 */
export async function disperseTokensSimple(
  params: DisperseSimpleParams,
): Promise<BatchResult[]> {
  const {
    contractAddress,
    variant,
    token,
    recipients,
    amount,
    from = ZERO_ADDRESS,
    campaignId = ZERO_BYTES32,
    walletClient,
    publicClient,
    batchSize = 200,
    liveFilter,
    onProgress,
    gasConfig,
  } = params;

  const abi = getAbi(variant);
  const isNative = token === ZERO_ADDRESS;
  const results: BatchResult[] = [];
  let cursor = 0;
  let batchIndex = 0;
  let cumulativeGasCost = 0n;

  while (cursor < recipients.length) {
    const { addresses: batchRecipients, newCursor } =
      await fillBatch(recipients, cursor, batchSize, liveFilter);
    cursor = newCursor;

    if (batchRecipients.length === 0) break;

    const totalValue = isNative ? amount * BigInt(batchRecipients.length) : 0n;

    onProgress?.({
      type: 'batch',
      batchIndex,
      totalBatches: Math.ceil(recipients.length / batchSize),
      status: 'signing',
    });

    const args: readonly unknown[] =
      variant === 'simple'
        ? [token, batchRecipients, amount]
        : [token, from, batchRecipients, amount, campaignId];

    const attempt = await executeBatch({
      contractAddress,
      abi,
      functionName: 'disperseSimple',
      args,
      value: totalValue,
      walletClient,
      publicClient,
      gasConfig,
    });

    if (attempt.outcome === 'confirmed') {
      cumulativeGasCost += attempt.gasEstimate * attempt.maxFeePerGas;
    }

    results.push({
      batchIndex,
      recipients: batchRecipients,
      amounts: batchRecipients.map(() => amount),
      attempts: [attempt],
      confirmedTxHash: attempt.outcome === 'confirmed' ? attempt.txHash : null,
      blockNumber: null,
    });

    onProgress?.({
      type: 'batch',
      batchIndex,
      totalBatches: Math.ceil(recipients.length / batchSize),
      status: attempt.outcome === 'confirmed' ? 'confirmed' : 'failed',
    });

    batchIndex++;

    if (gasConfig?.maxTotalGasCost && cumulativeGasCost > gasConfig.maxTotalGasCost) {
      break;
    }
  }

  return results;
}

/**
 * Estimates a priority fee using both fee history and mempool signals.
 * Returns whichever is higher — fee history captures the trend across recent
 * blocks, while the mempool estimate catches sudden spikes.
 */
async function getPriorityFee(
  publicClient: PublicClient,
  speed: GasSpeed,
): Promise<bigint> {
  const percentile = PRIORITY_PERCENTILES[speed];

  // Fetch both signals in parallel
  const [feeHistory, mempoolEstimate] = await Promise.all([
    publicClient.getFeeHistory({
      blockCount: 10,
      rewardPercentiles: [percentile],
    }),
    publicClient.estimateMaxPriorityFeePerGas(),
  ]);

  // Average the percentile across recent mined blocks
  const rewards = feeHistory.reward ?? [];
  let historyEstimate = 0n;
  if (rewards.length > 0) {
    let total = 0n;
    for (const block of rewards) {
      total += block[0] ?? 0n;
    }
    historyEstimate = total / BigInt(rewards.length);
  }

  // Use whichever is higher — history for trend, mempool for spikes
  return historyEstimate > mempoolEstimate ? historyEstimate : mempoolEstimate;
}

type ExecuteBatchParams = {
  readonly contractAddress: Address;
  readonly abi: never;
  readonly functionName: string;
  readonly args: readonly unknown[];
  readonly value: bigint;
  readonly walletClient: WalletClient;
  readonly publicClient: PublicClient;
  readonly gasConfig?: GasConfig;
};

async function executeBatch(params: ExecuteBatchParams): Promise<BatchAttempt> {
  const { contractAddress, abi, functionName, args, value, walletClient, publicClient, gasConfig } =
    params;
  const timestamp = Date.now();
  const headroom = gasConfig?.headroom ?? 'medium';
  const prioritySpeed = gasConfig?.priority ?? 'medium';
  const { numerator, denominator } = HEADROOM_MULTIPLIERS[headroom];

  const droppedResult = (overrides: Partial<BatchAttempt> = {}): BatchAttempt => ({
    txHash: '0x' as Hex,
    nonce: 0,
    gasEstimate: 0n,
    maxFeePerGas: 0n,
    maxPriorityFeePerGas: 0n,
    timestamp,
    outcome: 'dropped',
    ...overrides,
  });

  try {
    // Estimate gas — let it fail rather than silently falling back
    const gasEstimate = await publicClient.estimateContractGas({
      address: contractAddress,
      abi,
      functionName,
      args: args as never,
      value,
      account: walletClient.account!,
    });

    const gasLimit = (gasEstimate * numerator) / denominator;

    // Get base fee from latest block
    const block = await publicClient.getBlock({ blockTag: 'latest' });
    const baseFee = block.baseFeePerGas ?? 0n;

    // Drop batch without sending if base fee exceeds the configured cap
    if (gasConfig?.maxBaseFee !== undefined && baseFee > gasConfig.maxBaseFee) {
      return droppedResult({ gasEstimate: gasLimit });
    }

    // Get priority fee using both fee history and mempool signals
    let priorityFee = await getPriorityFee(publicClient, prioritySpeed);

    // Clamp priority fee to cap if set (clamp, not abort)
    if (gasConfig?.maxPriorityFee !== undefined && priorityFee > gasConfig.maxPriorityFee) {
      priorityFee = gasConfig.maxPriorityFee;
    }

    let currentPriorityFee = priorityFee;
    let currentMaxFee = (baseFee * numerator) / denominator + priorityFee;

    // Pin the nonce so replacement txs target the same slot
    const nonce = await publicClient.getTransactionCount({
      address: walletClient.account!.address,
      blockTag: 'pending',
    });

    const MAX_ATTEMPTS = 5;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // Check if nonce was already consumed (previous tx confirmed while retrying)
      const currentNonce = await publicClient.getTransactionCount({
        address: walletClient.account!.address,
        blockTag: 'latest',
      });
      if (currentNonce > nonce) {
        return {
          txHash: '0x' as Hex,
          nonce,
          gasEstimate: gasLimit,
          maxFeePerGas: currentMaxFee,
          maxPriorityFeePerGas: currentPriorityFee,
          timestamp,
          outcome: 'confirmed',
        };
      }

      try {
        const hash = await walletClient.writeContract({
          address: contractAddress,
          abi,
          functionName,
          args: args as never,
          value,
          gas: gasLimit,
          maxFeePerGas: currentMaxFee,
          maxPriorityFeePerGas: currentPriorityFee,
          account: walletClient.account!,
          chain: undefined,
          nonce,
        });

        const receipt = await publicClient.waitForTransactionReceipt({
          hash,
          timeout: 60_000,
        });

        return {
          txHash: hash,
          nonce,
          gasEstimate: gasLimit,
          maxFeePerGas: currentMaxFee,
          maxPriorityFeePerGas: currentPriorityFee,
          timestamp,
          outcome: receipt.status === 'success' ? 'confirmed' : 'reverted',
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        // Nonce already used — original tx confirmed while we were retrying
        if (message.includes('nonce too low')) {
          return {
            txHash: '0x' as Hex,
            nonce,
            gasEstimate: gasLimit,
            maxFeePerGas: currentMaxFee,
            maxPriorityFeePerGas: currentPriorityFee,
            timestamp,
            outcome: 'confirmed',
          };
        }

        // Bump both fees by >= 112% for EIP-1559 replacement
        const freshBlock = await publicClient.getBlock({ blockTag: 'latest' });
        const freshBaseFee = freshBlock.baseFeePerGas ?? 0n;

        if (gasConfig?.maxBaseFee !== undefined && freshBaseFee > gasConfig.maxBaseFee) {
          return droppedResult({ nonce, gasEstimate: gasLimit });
        }

        const freshPriorityFee = await getPriorityFee(publicClient, prioritySpeed);
        const bumpWad = gasConfig?.feeBumpWad ?? DEFAULT_FEE_BUMP_WAD;
        const minPriorityFee = currentPriorityFee + currentPriorityFee * bumpWad / WAD;
        const minMaxFee = currentMaxFee + currentMaxFee * bumpWad / WAD;

        const bumpedPriorityFee = minPriorityFee > freshPriorityFee
          ? minPriorityFee
          : freshPriorityFee;

        // Abort if bumped priority fee exceeds the configured cap
        if (gasConfig?.maxPriorityFee !== undefined && bumpedPriorityFee > gasConfig.maxPriorityFee) {
          return droppedResult({ nonce, gasEstimate: gasLimit });
        }

        const calculatedMaxFee = freshBaseFee * 2n + bumpedPriorityFee;
        currentMaxFee = calculatedMaxFee > minMaxFee ? calculatedMaxFee : minMaxFee;
        currentPriorityFee = bumpedPriorityFee;
      }
    }

    // Exhausted retries
    return droppedResult({ nonce, gasEstimate: gasLimit });
  } catch {
    return droppedResult();
  }
}
