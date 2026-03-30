import { text, select, isCancel } from '@clack/prompts';
import type { PublicClient } from 'viem';
import type { Storage } from '@titrate/sdk';
import { SUPPORTED_CHAINS, probeToken } from '@titrate/sdk';
import { createRpcClient } from '../../utils/rpc.js';

/** The result of Step 1: Campaign Setup. */
export type CampaignStepResult = {
  readonly name: string;
  readonly chainId: number;
  readonly rpcUrl: string;
  readonly tokenAddress: string;
  readonly tokenSymbol: string;
  readonly tokenDecimals: number;
  readonly contractVariant: 'simple' | 'full';
  readonly contractName: string;
  readonly batchSize: number;
  readonly publicClient: PublicClient;
  /** Existing campaign id if found and user chose to resume. */
  readonly resumeCampaignId: string | null;
};

const NATIVE_SENTINEL = 'native';

/**
 * Step 1: Campaign Setup.
 * Collects campaign name, chain, token, contract variant, and batch size.
 *
 * @param storage - Shared filesystem storage instance
 * @returns Campaign config or a clack cancel symbol
 */
export async function campaignStep(
  storage: Storage,
): Promise<CampaignStepResult | symbol> {
  // --- Campaign name ---
  const name = await text({
    message: 'Campaign name',
    placeholder: 'March HEX Airdrop',
    validate: (v) => (v.trim().length === 0 ? 'Name is required.' : undefined),
  });
  if (isCancel(name)) return name;

  // Check for existing campaign with same name for auto-resume
  let resumeCampaignId: string | null = null;
  try {
    const existing = await storage.campaigns.list();
    const match = existing.find((c) => c.name === (name as string).trim());
    if (match) {
      const batches = await storage.batches.getByCampaign(match.id);
      const pendingBatches = batches.filter((b) => b.status !== 'confirmed');
      if (pendingBatches.length > 0) {
        const lastCompleted = await storage.batches.getLastCompleted(match.id);
        const resumeFrom = lastCompleted ? lastCompleted.batchIndex + 1 : 0;
        const shouldResume = await select({
          message: `Campaign "${name as string}" already exists. Resume from batch ${resumeFrom}?`,
          options: [
            { value: 'yes', label: 'Yes — resume distribution' },
            { value: 'no', label: 'No — start fresh' },
          ],
        });
        if (isCancel(shouldResume)) return shouldResume;
        if (shouldResume === 'yes') {
          resumeCampaignId = match.id;
        }
      }
    }
  } catch {
    // Storage not initialized yet — that's fine, proceed normally
  }

  // --- Chain selection ---
  const chainOptions = [
    ...SUPPORTED_CHAINS.map((c) => ({
      value: String(c.chainId),
      label: `${c.name} (${c.chainId})`,
    })),
    { value: 'custom', label: 'Custom RPC' },
  ];

  const chainSelection = await select({
    message: 'Select chain',
    options: chainOptions,
  });
  if (isCancel(chainSelection)) return chainSelection;

  let chainId: number;
  let rpcUrl: string;

  if (chainSelection === 'custom') {
    const customRpc = await text({
      message: 'RPC URL',
      placeholder: 'https://my-rpc.example.com',
      validate: (v) => {
        try {
          new URL(v);
          return undefined;
        } catch {
          return 'Enter a valid URL.';
        }
      },
    });
    if (isCancel(customRpc)) return customRpc;

    const customChainId = await text({
      message: 'Chain ID',
      placeholder: '1',
      validate: (v) => {
        const n = Number(v);
        return isNaN(n) || n <= 0 ? 'Enter a valid chain ID.' : undefined;
      },
    });
    if (isCancel(customChainId)) return customChainId;

    rpcUrl = customRpc as string;
    chainId = Number(customChainId as string);
  } else {
    chainId = Number(chainSelection);
    const chain = SUPPORTED_CHAINS.find((c) => c.chainId === chainId)!;
    rpcUrl = chain.rpcUrls[0];
  }

  const publicClient = createRpcClient(rpcUrl, chainId);

  // --- Token address ---
  const tokenInput = await text({
    message: 'Token address (or "native" for ETH/PLS)',
    placeholder: '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39',
    validate: (v) => {
      const val = v.trim().toLowerCase();
      if (val === NATIVE_SENTINEL) return undefined;
      if (/^0x[0-9a-f]{40}$/i.test(val)) return undefined;
      return 'Enter a valid 0x address or "native".';
    },
  });
  if (isCancel(tokenInput)) return tokenInput;

  let tokenAddress: string;
  let tokenSymbol: string;
  let tokenDecimals: number;

  const tokenVal = (tokenInput as string).trim().toLowerCase();

  if (tokenVal === NATIVE_SENTINEL) {
    const chain = SUPPORTED_CHAINS.find((c) => c.chainId === chainId);
    tokenAddress = '0x0000000000000000000000000000000000000000';
    tokenSymbol = chain?.nativeSymbol ?? 'ETH';
    tokenDecimals = chain?.nativeDecimals ?? 18;
  } else {
    const addr = tokenVal as `0x${string}`;
    process.stdout.write('  Probing token contract...\n');
    const info = await probeToken(publicClient, addr);
    if (info) {
      process.stdout.write(`  Found: ${info.symbol} (${info.decimals} decimals)\n`);
      tokenAddress = addr;
      tokenSymbol = info.symbol;
      tokenDecimals = info.decimals;
    } else {
      process.stdout.write('  Warning: Could not verify token. Proceeding with manual entry.\n');

      const manualSymbol = await text({
        message: 'Token symbol',
        placeholder: 'HEX',
        validate: (v) => (v.trim().length === 0 ? 'Symbol required.' : undefined),
      });
      if (isCancel(manualSymbol)) return manualSymbol;

      const manualDecimals = await text({
        message: 'Token decimals',
        placeholder: '8',
        validate: (v) => {
          const n = Number(v);
          return isNaN(n) || n < 0 || n > 18 ? 'Enter a number 0–18.' : undefined;
        },
      });
      if (isCancel(manualDecimals)) return manualDecimals;

      tokenAddress = addr;
      tokenSymbol = (manualSymbol as string).trim();
      tokenDecimals = Number(manualDecimals as string);
    }
  }

  // --- Contract variant ---
  const contractVariant = await select({
    message: 'Contract variant',
    options: [
      { value: 'simple', label: 'Simple — direct distribution, lower gas' },
      { value: 'full', label: 'Full — operator pattern, campaign tracking' },
    ],
  });
  if (isCancel(contractVariant)) return contractVariant;

  // --- Contract name ---
  const contractName = await text({
    message: 'Contract name (for block explorer)',
    placeholder: 'BuyMoreHEX',
    validate: (v) => (v.trim().length === 0 ? 'Name required.' : undefined),
  });
  if (isCancel(contractName)) return contractName;

  // --- Batch size ---
  const batchSizeInput = await text({
    message: 'Recipients per batch',
    initialValue: '200',
    validate: (v) => {
      const n = Number(v);
      return isNaN(n) || n < 1 ? 'Enter a positive integer.' : undefined;
    },
  });
  if (isCancel(batchSizeInput)) return batchSizeInput;

  return {
    name: (name as string).trim(),
    chainId,
    rpcUrl,
    tokenAddress,
    tokenSymbol,
    tokenDecimals,
    contractVariant: contractVariant as 'simple' | 'full',
    contractName: (contractName as string).trim(),
    batchSize: Number(batchSizeInput as string),
    publicClient,
    resumeCampaignId,
  };
}
