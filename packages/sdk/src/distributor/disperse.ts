import type { Address, Hex, PublicClient, WalletClient } from 'viem';
import type { BatchResult, BatchAttempt, ProgressCallback } from '../types.js';
import { chunk } from '../utils/chunk.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const TitrateSimpleArtifact = require('./artifacts/TitrateSimple.json');
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const TitrateFullArtifact = require('./artifacts/TitrateFull.json');

function getAbi(variant: 'simple' | 'full'): unknown[] {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
  return variant === 'simple' ? TitrateSimpleArtifact.abi : TitrateFullArtifact.abi;
}

const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

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
  readonly onProgress?: ProgressCallback;
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
  readonly onProgress?: ProgressCallback;
};

/**
 * Disperses variable token amounts to multiple recipients, batching as needed.
 * For native token, pass the zero address as `token`.
 *
 * @param params - Disperse parameters
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
    onProgress,
  } = params;

  const abi = getAbi(variant);
  const isNative = token === ZERO_ADDRESS;
  const recipientBatches = chunk([...recipients], batchSize);
  const amountBatches = chunk([...amounts], batchSize);
  const results: BatchResult[] = [];

  for (let i = 0; i < recipientBatches.length; i++) {
    const batchRecipients = recipientBatches[i];
    const batchAmounts = amountBatches[i];
    const totalValue = isNative ? batchAmounts.reduce((sum, a) => sum + a, 0n) : 0n;

    onProgress?.({
      type: 'batch',
      batchIndex: i,
      totalBatches: recipientBatches.length,
      status: 'signing',
    });

    const args =
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
    });

    const batchResult: BatchResult = {
      batchIndex: i,
      recipients: batchRecipients,
      amounts: batchAmounts,
      attempts: [attempt],
      confirmedTxHash: attempt.outcome === 'confirmed' ? attempt.txHash : null,
      blockNumber: null,
    };

    results.push(batchResult);

    onProgress?.({
      type: 'batch',
      batchIndex: i,
      totalBatches: recipientBatches.length,
      status: attempt.outcome === 'confirmed' ? 'confirmed' : 'failed',
    });
  }

  return results;
}

/**
 * Disperses a uniform token amount to multiple recipients, batching as needed.
 * For native token, pass the zero address as `token`.
 *
 * @param params - Disperse simple parameters (single amount for all recipients)
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
    onProgress,
  } = params;

  const abi = getAbi(variant);
  const isNative = token === ZERO_ADDRESS;
  const recipientBatches = chunk([...recipients], batchSize);
  const results: BatchResult[] = [];

  for (let i = 0; i < recipientBatches.length; i++) {
    const batchRecipients = recipientBatches[i];
    const totalValue = isNative ? amount * BigInt(batchRecipients.length) : 0n;

    onProgress?.({
      type: 'batch',
      batchIndex: i,
      totalBatches: recipientBatches.length,
      status: 'signing',
    });

    const args =
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
    });

    const batchResult: BatchResult = {
      batchIndex: i,
      recipients: batchRecipients,
      amounts: batchRecipients.map(() => amount),
      attempts: [attempt],
      confirmedTxHash: attempt.outcome === 'confirmed' ? attempt.txHash : null,
      blockNumber: null,
    };

    results.push(batchResult);

    onProgress?.({
      type: 'batch',
      batchIndex: i,
      totalBatches: recipientBatches.length,
      status: attempt.outcome === 'confirmed' ? 'confirmed' : 'failed',
    });
  }

  return results;
}

type ExecuteBatchParams = {
  readonly contractAddress: Address;
  readonly abi: unknown[];
  readonly functionName: string;
  readonly args: readonly unknown[];
  readonly value: bigint;
  readonly walletClient: WalletClient;
  readonly publicClient: PublicClient;
};

async function executeBatch(params: ExecuteBatchParams): Promise<BatchAttempt> {
  const { contractAddress, abi, functionName, args, value, walletClient, publicClient } =
    params;
  const timestamp = Date.now();

  try {
    const gasEstimate = await publicClient
      .estimateContractGas({
        address: contractAddress,
        abi: abi as never,
        functionName,
        args: args as never,
        value,
        account: walletClient.account!,
      })
      .catch(() => 500_000n);

    const paddedGas = gasEstimate + gasEstimate / 5n;

    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: abi as never,
      functionName,
      args: args as never,
      value,
      gas: paddedGas,
      account: walletClient.account!,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    return {
      txHash: hash,
      nonce: 0,
      gasEstimate: paddedGas,
      maxFeePerGas: 0n,
      maxPriorityFeePerGas: 0n,
      timestamp,
      outcome: receipt.status === 'success' ? 'confirmed' : 'reverted',
    };
  } catch (err) {
    return {
      txHash: '0x' as Hex,
      nonce: 0,
      gasEstimate: 0n,
      maxFeePerGas: 0n,
      maxPriorityFeePerGas: 0n,
      timestamp,
      outcome: 'dropped',
    };
  }
}
