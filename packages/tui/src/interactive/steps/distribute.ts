import { confirm, isCancel } from '@clack/prompts';
import { disperseTokens, disperseTokensSimple, slugifyCampaignName, computeResumeOffset, alignAmountsForResume } from '@titrate/sdk';
import type { Storage } from '@titrate/sdk';
import type { Address } from 'viem';
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
 * Saves all batch results from a disperse call to storage.
 * Each result maps to one StoredBatch record under the campaign.
 */
async function saveBatchResults(
  storage: Storage,
  campaignId: string,
  batchResults: Awaited<ReturnType<typeof disperseTokens>>,
  batchOffset: number,
): Promise<void> {
  const now = Date.now();
  await Promise.all(
    batchResults.map((result) => {
      const adjustedIndex = result.batchIndex + batchOffset;
      return storage.batches.put({
        id: `${campaignId}-batch-${adjustedIndex}`,
        campaignId,
        batchIndex: adjustedIndex,
        recipients: [...result.recipients],
        amounts: result.amounts.map(String),
        status: result.confirmedTxHash !== null ? 'confirmed' : 'failed',
        attempts: result.attempts.map((a) => ({ ...a })),
        confirmedTxHash: result.confirmedTxHash,
        confirmedBlock: result.blockNumber,
        createdAt: now,
        updatedAt: now,
      });
    }),
  );
}

/**
 * Step 6: Review & Distribute.
 * Shows summary box, confirms, then runs distribution with progress renderer.
 * Persists campaign and batch results to storage for auto-resume support.
 *
 * @param campaign - Result from Step 1
 * @param filters - Result from Step 3
 * @param amounts - Result from Step 4
 * @param wallet - Result from Step 5
 * @param storage - Shared filesystem storage instance
 */
export async function distributeStep(
  campaign: CampaignStepResult,
  filters: FiltersStepResult,
  amounts: AmountsStepResult,
  wallet: WalletStepResult,
  storage: Storage,
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

  // Determine campaign ID — use existing if resuming, otherwise derive from name
  const campaignId = campaign.resumeCampaignId ?? slugifyCampaignName(campaign.name);

  // Detect resume offset from previously confirmed batches
  const existingBatches = await storage.batches.getByCampaign(campaignId);
  const confirmedCount = existingBatches.filter((b) => b.status === 'confirmed').length;
  const startOffset = computeResumeOffset(existingBatches, batchSize);

  const allRecipients = addresses as Address[];
  const recipients = startOffset > 0 ? allRecipients.slice(startOffset) : allRecipients;
  const effectiveRecipientCount = recipients.length;

  if (startOffset > 0) {
    process.stdout.write(`  Resuming from batch ${confirmedCount + 1} (${startOffset} recipients already sent)\n`);
  }

  // Display review box (show full recipient count for context)
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
    recipientCount: effectiveRecipientCount,
    totalAmount,
    uniformAmount,
    batchSize,
    hotAddress,
  });

  process.stdout.write(`\n${review}\n\n`);

  const shouldDistribute = await confirm({
    message: startOffset > 0 ? 'Resume distribution?' : 'Start distribution?',
    initialValue: false,
  });
  if (isCancel(shouldDistribute)) return shouldDistribute;
  if (!(shouldDistribute as boolean)) {
    return;
  }

  // Save campaign record before starting (idempotent — overwrites if already exists)
  const now = Date.now();
  await storage.campaigns.put({
    id: campaignId,
    funder: hotAddress as Address,
    name: campaign.name,
    version: 1,
    chainId,
    rpcUrl,
    tokenAddress: tokenAddress as Address,
    tokenDecimals,
    contractAddress,
    contractVariant,
    contractName,
    amountMode: amounts.mode,
    amountFormat: amounts.format,
    uniformAmount: amounts.mode === 'uniform' ? amounts.uniformAmount.toString() : null,
    batchSize,
    campaignId: null,
    pinnedBlock: null,
    createdAt: now,
    updatedAt: now,
  });

  const publicClient = createRpcClient(rpcUrl, chainId);
  const onProgress = createProgressRenderer();

  process.stdout.write('\n  Starting distribution...\n');

  let batchResults: Awaited<ReturnType<typeof disperseTokens>>;

  if (amounts.mode === 'uniform') {
    batchResults = await disperseTokensSimple({
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
    // Variable amounts — align with the sliced recipient list
    const amountList = amounts.amounts as bigint[];
    const alignedAmounts = alignAmountsForResume(amountList, startOffset, recipients.length);

    batchResults = await disperseTokens({
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

  // Persist batch results for future resume
  await saveBatchResults(storage, campaignId, batchResults, confirmedCount);

  process.stdout.write(`\n  Distribution complete! ${formatCount(effectiveRecipientCount)} recipients processed.\n`);
}
