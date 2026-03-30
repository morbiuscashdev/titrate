import { password, select, text, confirm, isCancel } from '@clack/prompts';
import { createEIP712Message, deriveHotWallet } from '@titrate/sdk';
import { privateKeyToAccount } from 'viem/accounts';
import type { Address, Hex, WalletClient } from 'viem';
import type { CampaignStepResult } from './campaign.js';
import { createSignerClient } from '../../utils/wallet.js';
import { formatAddress } from '../format.js';

/** The result of Step 5: Wallet & Contract Setup. */
export type WalletStepResult = {
  readonly coldAddress: Address;
  readonly hotAddress: Address;
  readonly hotPrivateKey: Hex;
  readonly hotWalletClient: WalletClient;
  readonly contractAddress: Address;
  readonly isNewDeployment: boolean;
  readonly operatorAllowance: bigint | null;
};

/**
 * Attempts to write text to the system clipboard (macOS only).
 * Silently no-ops if pbcopy is unavailable.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    const { exec } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execAsync = promisify(exec);
    await execAsync(`echo -n ${JSON.stringify(text)} | pbcopy`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves the private key from the password prompt or env var.
 * TITRATE_COLD_KEY takes priority over TITRATE_PRIVATE_KEY.
 */
function resolveEnvKey(): string | null {
  return process.env['TITRATE_COLD_KEY'] ?? process.env['TITRATE_PRIVATE_KEY'] ?? null;
}

/**
 * Step 5: Wallet & Contract Setup.
 * Handles cold key input, hot wallet derivation, and contract deploy/use-existing.
 *
 * @param campaign - Result from Step 1
 * @returns Wallet and contract config or a clack cancel symbol
 */
export async function walletStep(
  campaign: CampaignStepResult,
): Promise<WalletStepResult | symbol> {
  // --- Cold wallet private key ---
  let coldKeyHex: Hex;

  const envKey = resolveEnvKey();
  if (envKey) {
    process.stdout.write('  Using cold key from environment variable.\n');
    coldKeyHex = (envKey.startsWith('0x') ? envKey : `0x${envKey}`) as Hex;
  } else {
    const coldKeyInput = await password({
      message: 'Cold wallet private key (input hidden)',
      validate: (v) => {
        const clean = v.trim().replace(/^0x/, '');
        return /^[0-9a-f]{64}$/i.test(clean)
          ? undefined
          : 'Enter a valid 64-character hex private key.';
      },
    });
    if (isCancel(coldKeyInput)) return coldKeyInput;

    const raw = (coldKeyInput as string).trim();
    coldKeyHex = (raw.startsWith('0x') ? raw : `0x${raw}`) as Hex;
  }

  const coldAccount = privateKeyToAccount(coldKeyHex);
  const coldAddress = coldAccount.address;
  process.stdout.write(`  Cold wallet: ${formatAddress(coldAddress)}\n`);

  // --- Derive hot wallet via EIP-712 ---
  process.stdout.write('  Deriving hot wallet...\n');

  const typedData = createEIP712Message({
    funder: coldAddress,
    name: campaign.name,
    version: 1,
  });

  const signature = await coldAccount.signTypedData({
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  });

  const { address: hotAddress, privateKey: hotPrivateKey } = deriveHotWallet(signature as Hex);

  const copied = await copyToClipboard(hotPrivateKey);
  process.stdout.write(
    `  Hot wallet derived: ${formatAddress(hotAddress)}${copied ? ' (private key copied to clipboard)' : ''}\n`,
  );

  const hotWalletClient = createSignerClient(hotPrivateKey as Hex, campaign.rpcUrl);

  // --- Contract deployment choice ---
  const contractChoice = await select({
    message: 'Contract setup',
    options: [
      { value: 'deploy-hot', label: `Deploy new contract (hot wallet: ${formatAddress(hotAddress)})` },
      { value: 'deploy-cold', label: `Deploy new contract (cold wallet: ${formatAddress(coldAddress)})` },
      { value: 'existing', label: 'Use existing contract address' },
    ],
  });
  if (isCancel(contractChoice)) return contractChoice;

  let contractAddress: Address;
  let isNewDeployment = false;

  if (contractChoice === 'deploy-hot' || contractChoice === 'deploy-cold') {
    isNewDeployment = true;
    const deployerKey = contractChoice === 'deploy-hot' ? hotPrivateKey as Hex : coldKeyHex;
    const deployerClient = createSignerClient(deployerKey, campaign.rpcUrl);

    process.stdout.write('  Deploying contract...\n');
    const { deployDistributor } = await import('@titrate/sdk');
    const result = await deployDistributor({
      variant: campaign.contractVariant,
      name: campaign.contractName,
      walletClient: deployerClient,
      publicClient: campaign.publicClient,
    });
    contractAddress = result.address;
    process.stdout.write(`  Contract deployed: ${formatAddress(contractAddress)} (tx: ${formatAddress(result.txHash)})\n`);
  } else {
    const existingAddr = await text({
      message: 'Contract address',
      placeholder: '0xABC...',
      validate: (v) =>
        /^0x[0-9a-f]{40}$/i.test(v.trim()) ? undefined : 'Enter a valid 0x address.',
    });
    if (isCancel(existingAddr)) return existingAddr;
    contractAddress = (existingAddr as string).trim() as Address;
  }

  // --- Operator allowance (full variant only) ---
  let operatorAllowance: bigint | null = null;

  if (campaign.contractVariant === 'full') {
    const shouldSetAllowance = await confirm({
      message: 'Set up operator allowance for the hot wallet?',
      initialValue: true,
    });
    if (isCancel(shouldSetAllowance)) return shouldSetAllowance;

    if (shouldSetAllowance as boolean) {
      const allowanceAmount = await text({
        message: 'Allowance amount (in token smallest units)',
        placeholder: '1000000000000000000',
        validate: (v) => {
          try {
            BigInt(v.trim());
            return undefined;
          } catch {
            return 'Enter a valid integer.';
          }
        },
      });
      if (isCancel(allowanceAmount)) return allowanceAmount;

      const methodSelector = await text({
        message: 'Function selector to approve (4-byte hex, e.g. 0x12345678)',
        placeholder: '0x12345678',
        validate: (v) =>
          /^0x[0-9a-f]{8}$/i.test(v.trim())
            ? undefined
            : 'Enter a valid 4-byte selector (0x + 8 hex chars).',
      });
      if (isCancel(methodSelector)) return methodSelector;

      operatorAllowance = BigInt((allowanceAmount as string).trim());

      const coldSignerClient = createSignerClient(coldKeyHex, campaign.rpcUrl);
      const { approveOperator } = await import('@titrate/sdk');

      process.stdout.write(`  Setting operator allowance of ${operatorAllowance.toString()}...\n`);
      await approveOperator({
        contractAddress,
        operator: hotAddress,
        selector: (methodSelector as string).trim() as Hex,
        amount: operatorAllowance,
        walletClient: coldSignerClient,
        publicClient: campaign.publicClient,
      });
      process.stdout.write(`  Operator allowance set.\n`);
    }
  }

  return {
    coldAddress,
    hotAddress,
    hotPrivateKey: hotPrivateKey as Hex,
    hotWalletClient,
    contractAddress,
    isNewDeployment,
    operatorAllowance,
  };
}
