import type { Address, PublicClient, WalletClient } from 'viem';
import type { BatchResult, ProgressCallback } from '../types.js';
import type { GasConfig } from './disperse.js';
import { disperseTokens, disperseTokensSimple } from './disperse.js';

/**
 * Parameters for multi-wallet parallel distribution.
 *
 * NOTE: `liveFilter` is intentionally excluded. With parallel wallets operating
 * on independent slices, a live filter cannot safely reason about cross-wallet
 * state (e.g., another wallet may have already sent to an address in its slice).
 * If you need live filtering, use single-wallet `disperseTokens` instead.
 */
export type ParallelDisperseParams = {
  readonly contractAddress: Address;
  readonly variant: 'simple' | 'full';
  readonly token: Address;
  readonly recipients: readonly Address[];
  /** Variable amounts — one per recipient. Mutually exclusive with `amount`. */
  readonly amounts?: readonly bigint[];
  /** Uniform amount per recipient. Mutually exclusive with `amounts`. */
  readonly amount?: bigint;
  readonly walletClients: readonly WalletClient[];
  readonly publicClient: PublicClient;
  readonly batchSize?: number;
  /** Per-wallet nonce window for pipelining. Default: 1 (serial per wallet). */
  readonly nonceWindow?: number;
  readonly onProgress?: ProgressCallback;
  readonly gasConfig?: GasConfig;
};

export type ParallelDisperseResult = {
  readonly walletIndex: number;
  readonly walletAddress: Address;
  readonly results: readonly BatchResult[];
};

/** Batch index offset multiplier — each wallet's batch indices are offset by walletIndex * BATCH_INDEX_STRIDE to avoid collisions. */
const BATCH_INDEX_STRIDE = 1000;

/**
 * Distributes tokens across multiple wallets in parallel.
 *
 * Recipients are partitioned evenly across wallets, each wallet gets a contiguous
 * slice of the recipient list, and all wallets run independently via `Promise.all`.
 *
 * Each wallet's `batchIndex` values are offset by `walletIndex * 1000` to avoid
 * collisions in progress events and result tracking.
 *
 * @param params - Parallel disperse parameters
 * @returns One result per wallet with its batch results
 */
export async function disperseParallel(
  params: ParallelDisperseParams,
): Promise<ParallelDisperseResult[]> {
  const { walletClients, recipients, onProgress, ...rest } = params;
  const walletCount = walletClients.length;
  const chunkSize = Math.ceil(recipients.length / walletCount);

  const lanes = walletClients.map((walletClient, walletIndex) => {
    const start = walletIndex * chunkSize;
    const end = Math.min(start + chunkSize, recipients.length);
    const walletRecipients = recipients.slice(start, end);

    if (walletRecipients.length === 0) return null;

    const batchIndexOffset = walletIndex * BATCH_INDEX_STRIDE;

    // Wrap onProgress to add wallet-scoped batch index offsets
    const walletProgress: ProgressCallback | undefined = onProgress
      ? (event) => {
          if (event.type === 'batch') {
            onProgress({
              ...event,
              batchIndex: event.batchIndex + batchIndexOffset,
            });
          } else if (event.type === 'tx') {
            onProgress({
              ...event,
              batchIndex: event.batchIndex + batchIndexOffset,
            });
          } else {
            onProgress(event);
          }
        }
      : undefined;

    const dispersePromise = params.amount !== undefined
      ? disperseTokensSimple({
          contractAddress: rest.contractAddress,
          variant: rest.variant,
          token: rest.token,
          walletClient,
          publicClient: rest.publicClient,
          recipients: walletRecipients,
          amount: params.amount,
          batchSize: rest.batchSize,
          nonceWindow: rest.nonceWindow,
          onProgress: walletProgress,
          gasConfig: rest.gasConfig,
        })
      : disperseTokens({
          contractAddress: rest.contractAddress,
          variant: rest.variant,
          token: rest.token,
          walletClient,
          publicClient: rest.publicClient,
          recipients: walletRecipients,
          amounts: params.amounts!.slice(start, end),
          batchSize: rest.batchSize,
          nonceWindow: rest.nonceWindow,
          onProgress: walletProgress,
          gasConfig: rest.gasConfig,
        });

    return dispersePromise.then((results): ParallelDisperseResult => ({
      walletIndex,
      walletAddress: walletClient.account!.address,
      results: results.map((r) => ({
        ...r,
        batchIndex: r.batchIndex + batchIndexOffset,
      })),
    }));
  });

  const validLanes = lanes.filter(
    (lane): lane is Promise<ParallelDisperseResult> => lane !== null,
  );

  return Promise.all(validLanes);
}
