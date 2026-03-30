import { confirm, isCancel } from '@clack/prompts';
import { disperseTokens, disperseTokensSimple } from '@titrate/sdk';
import type { Address, Hex } from 'viem';
import type { CampaignStepResult } from './campaign.js';
import type { FiltersStepResult } from './filters.js';
import type { AmountsStepResult } from './amounts.js';
import type { WalletStepResult } from './wallet.js';
import { createRpcClient } from '../../utils/rpc.js';
import { createProgressRenderer } from '../../progress/renderer.js';
import { formatAddress, formatCount, formatToken } from '../format.js';

/**
 * Builds the boxed review summary string.
 * Uses box-drawing characters to match the spec output.
 */
function buildReviewBox(params: {
  campaignName: string;
  chainName: string;
  chainId: number;
  tokenSymbol: string;
  tokenAddress: string;
  tokenDecimals: number;
  contractName: string;
  contractAddress: string;
  contractVariant: string;
  recipientCount: number;
  totalAmount: bigint;
  uniformAmount: bigint | null;
  batchSize: number;
  hotAddress: string;
}): string {
  const {
    campaignName,
    chainName,
    chainId,
    tokenSymbol,
    tokenAddress,
    tokenDecimals,
    contractName,
    contractAddress,
    contractVariant,
    recipientCount,
    totalAmount,
    uniformAmount,
    batchSize,
    hotAddress,
  } = params;

  const batches = Math.ceil(recipientCount / batchSize);
  const amountStr = uniformAmount !== null
    ? `${formatToken(uniformAmount, tokenDecimals, tokenSymbol)} each (${formatToken(totalAmount, tokenDecimals, tokenSymbol)} total)`
    : `variable (${formatToken(totalAmount, tokenDecimals, tokenSymbol)} total)`;

  const lines = [
    `┌ Review ──────────────────────────────────────`,
    `│ Campaign:   ${campaignName}`,
    `│ Chain:      ${chainName} (${chainId})`,
    `│ Token:      ${tokenSymbol} (${formatAddress(tokenAddress)}) · ${tokenDecimals} decimals`,
    `│ Contract:   ${contractName} (${formatAddress(contractAddress)}) [${contractVariant}]`,
    `│ Recipients: ${formatCount(recipientCount)}`,
    `│ Amount:     ${amountStr}`,
    `│ Batches:    ${formatCount(batches)} (${batchSize} per batch)`,
    `│ Hot wallet: ${formatAddress(hotAddress)}`,
    `└──────────────────────────────────────────────`,
  ];

  return lines.join('\n');
}

/**
 * Step 6: Review & Distribute.
 * Shows summary box, confirms, then runs distribution with progress renderer.
 *
 * @param campaign - Result from Step 1
 * @param filters - Result from Step 3
 * @param amounts - Result from Step 4
 * @param wallet - Result from Step 5
 */
export async function distributeStep(
  campaign: CampaignStepResult,
  filters: FiltersStepResult,
  amounts: AmountsStepResult,
  wallet: WalletStepResult,
): Promise<void | symbol> {
  const { tokenDecimals, tokenSymbol, tokenAddress, contractVariant, contractName, batchSize, chainId, rpcUrl } = campaign;
  const { addresses, addressCount } = filters;
  const { contractAddress, hotAddress, hotWalletClient } = wallet;

  const uniformAmount = amounts.mode === 'uniform' ? amounts.uniformAmount : null;
  const totalAmount = amounts.totalAmount;

  // Find chain name for display
  const { SUPPORTED_CHAINS } = await import('@titrate/sdk');
  const chain = SUPPORTED_CHAINS.find((c) => c.chainId === chainId);
  const chainName = chain?.name ?? `Chain ${chainId}`;

  // Display review box
  const review = buildReviewBox({
    campaignName: campaign.name,
    chainName,
    chainId,
    tokenSymbol,
    tokenAddress,
    tokenDecimals,
    contractName,
    contractAddress,
    contractVariant,
    recipientCount: addressCount,
    totalAmount,
    uniformAmount,
    batchSize,
    hotAddress,
  });

  process.stdout.write(`\n${review}\n\n`);

  const shouldDistribute = await confirm({
    message: 'Start distribution?',
    initialValue: false,
  });
  if (isCancel(shouldDistribute)) return shouldDistribute;
  if (!(shouldDistribute as boolean)) {
    return;
  }

  const publicClient = createRpcClient(rpcUrl, chainId);
  const onProgress = createProgressRenderer();
  const recipients = addresses as Address[];

  process.stdout.write('\n  Starting distribution...\n');

  if (amounts.mode === 'uniform') {
    await disperseTokensSimple({
      contractAddress,
      variant: contractVariant,
      token: tokenAddress as Address,
      recipients,
      amount: amounts.uniformAmount,
      walletClient: hotWalletClient,
      publicClient,
      batchSize,
      onProgress,
    });
  } else {
    // Variable amounts — must align with filtered address list
    const amountList = amounts.amounts as bigint[];
    // Trim/pad amounts to match filtered recipient count
    const alignedAmounts = recipients.map((_, i) => amountList[i] ?? 0n);

    await disperseTokens({
      contractAddress,
      variant: contractVariant,
      token: tokenAddress as Address,
      recipients,
      amounts: alignedAmounts,
      walletClient: hotWalletClient,
      publicClient,
      batchSize,
      onProgress,
    });
  }

  process.stdout.write(`\n  Distribution complete! ${formatCount(addressCount)} recipients processed.\n`);
}
