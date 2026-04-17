import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Command } from 'commander';
import type { Address, Hex } from 'viem';
import { disperseTokens, disperseTokensSimple, disperseParallel, parseCSV, serializeBatchResults, parseGwei, createEIP712Message, deriveMultipleWallets } from '@titrate/sdk';
import type { BatchResult, GasConfig, GasSpeed, RevalidationConfig } from '@titrate/sdk';
import { decryptPrivateKey } from '../utils/passphrase.js';
import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http } from 'viem';
import type { WalletClient } from 'viem';
import { createRpcClient } from '../utils/rpc.js';
import { createSignerClient, resolvePrivateKey } from '../utils/wallet.js';
import { createProgressRenderer } from '../progress/renderer.js';
import { createCampaignStorage } from '@titrate/storage-campaign';
import { resolveCampaignRoot } from '../utils/campaign-root.js';

/**
 * Load campaign config from a named campaign directory.
 *
 * Reads the passphrase interactively, then decrypts each wallet's private key
 * using the full AES-GCM envelope stored in `encryptedKey`.
 */
async function loadFromCampaign(campaignName: string, folder?: string) {
  const root = await resolveCampaignRoot({ folder });
  const dir = join(root, campaignName);
  const storage = createCampaignStorage(dir);
  const manifest = await storage.manifest.read();

  const rl = createInterface({ input, output });
  const passphrase = await rl.question('Passphrase for this campaign: ');
  rl.close();

  const records = await storage.wallets.readAll();
  const privateKeys = await Promise.all(
    records.map(async (r) => {
      try {
        return await decryptPrivateKey({
          ciphertext: r.encryptedKey.ciphertext,
          iv: r.encryptedKey.iv,
          authTag: r.encryptedKey.authTag,
          kdf: r.kdf,
          kdfParams: r.kdfParams,
        }, passphrase);
      } catch (err) {
        throw new Error(`Wallet ${r.index}: could not decrypt (wrong passphrase?) — ${err}`);
      }
    }),
  );

  return { manifest, privateKeys, storage };
}

/**
 * Registers the `distribute` subcommand on a Commander program.
 *
 * Reads a CSV of addresses, distributes tokens via the deployed contract.
 * Supports uniform amount (--amount flag) or variable amounts (from CSV column).
 * Outputs BatchResult JSON to stdout.
 */
export function registerDistribute(program: Command): void {
  program
    .command('distribute')
    .description('Distribute tokens to addresses from a CSV file')
    .option('--contract <address>', 'Distributor contract address')
    .option('--token <address>', 'Token contract address (zero address for native)')
    .option('--rpc <url>', 'RPC endpoint URL')
    .option('--addresses <path>', 'CSV file of recipient addresses (and optional amounts)')
    .option('--amount <value>', 'Uniform token amount (in smallest unit) for all recipients')
    .option('--decimals <number>', 'Token decimals (used for display only)', parseInt)
    .option('--variant <simple|full>', 'Contract variant', 'simple')
    .option('--private-key --privateKey <key>', 'Distributor private key (or set TITRATE_PRIVATE_KEY)')
    .option('--from <address>', 'Operator address override (for full variant)')
    .option('--batch-size --batchSize <number>', 'Recipients per transaction batch', '200')
    .option('--campaign-id --campaignId <hex>', 'Campaign ID bytes32 (for full variant)')
    .option('--chain-id --chainId <id>', 'Chain ID for RPC client configuration', parseInt)
    .option('--headroom <speed>', 'Gas limit multiplier preset: slow (1.125×), medium (1.5×), fast (2×). Default: medium')
    .option('--priority <speed>', 'Priority fee percentile: slow (25th), medium (50th), fast (75th). Default: medium')
    .option('--max-base-fee --maxBaseFee <gwei>', 'Abort batch if base fee exceeds this (in gwei, e.g. "50" or "2.5")')
    .option('--max-priority-fee --maxPriorityFee <gwei>', 'Clamp priority fee to this max (in gwei, e.g. "2" or "1.5")')
    .option('--max-total-gas-cost --maxTotalGasCost <wei>', 'Stop distribution if cumulative gas cost exceeds this (in wei)')
    .option('--fee-bump --feeBump <percent>', 'Fee bump percentage for stuck tx replacement (default: 12.5)')
    .option('--nonce-window --nonceWindow <count>', 'Number of batches to pipeline before waiting (1-10, default: 1)', parseInt)
    .option('--revalidation', 'Enable block-by-block revalidation of pending batches (requires live filter)')
    .option('--revalidation-threshold --revalidationThreshold <count>', 'Invalidation threshold for revalidation (default: 2)', parseInt)
    .option('--wallets <count>', 'Number of derived hot wallets for parallel distribution', parseInt)
    .option('--wallet-offset --walletOffset <number>', 'Starting index offset for wallet derivation (default: 0)', parseInt)
    .option('--campaign-name --campaignName <name>', 'Campaign name for EIP-712 wallet derivation')
    .option('-c, --campaign <name>', 'Campaign name (loads config from campaign directory)')
    .option('--folder <path>', 'Campaign root directory (with --campaign)')
    .action(async (opts: {
      contract?: string;
      token?: string;
      rpc?: string;
      addresses?: string;
      amount?: string;
      decimals?: number;
      variant: 'simple' | 'full';
      privateKey?: string;
      from?: string;
      batchSize: string;
      campaignId?: string;
      chainId?: number;
      headroom?: string;
      priority?: string;
      maxBaseFee?: string;
      maxPriorityFee?: string;
      maxTotalGasCost?: string;
      feeBump?: string;
      nonceWindow?: number;
      revalidation?: boolean;
      revalidationThreshold?: number;
      wallets?: number;
      walletOffset?: number;
      campaignName?: string;
      campaign?: string;
      folder?: string;
    }) => {
      if (opts.campaign) {
        await loadFromCampaign(opts.campaign, opts.folder);
        return;
      }

      // Guard required flags in the non-campaign path (formerly enforced by requiredOption).
      if (!opts.contract) throw new Error('missing required option: --contract <address>');
      if (!opts.token) throw new Error('missing required option: --token <address>');
      if (!opts.rpc) throw new Error('missing required option: --rpc <url>');
      if (!opts.addresses) throw new Error('missing required option: --addresses <path>');

      const privateKey = resolvePrivateKey(opts.privateKey);
      const publicClient = createRpcClient(opts.rpc, opts.chainId);
      const walletClient = createSignerClient(privateKey, opts.rpc);
      const onProgress = createProgressRenderer();

      const csvRaw = await readFile(opts.addresses, 'utf8');
      const parsed = parseCSV(csvRaw);
      const recipients = parsed.rows.map((r) => r.address);

      const contractAddress = opts.contract as Address;
      const tokenAddress = opts.token as Address;
      const batchSize = parseInt(opts.batchSize, 10);
      const from = opts.from as Address | undefined;
      const campaignId = opts.campaignId as Hex | undefined;

      const gasConfig: GasConfig = {
        ...(opts.headroom !== undefined && { headroom: opts.headroom as GasSpeed }),
        ...(opts.priority !== undefined && { priority: opts.priority as GasSpeed }),
        ...(opts.maxBaseFee !== undefined && { maxBaseFee: parseGwei(opts.maxBaseFee) }),
        ...(opts.maxPriorityFee !== undefined && { maxPriorityFee: parseGwei(opts.maxPriorityFee) }),
        ...(opts.maxTotalGasCost !== undefined && { maxTotalGasCost: BigInt(opts.maxTotalGasCost) }),
        ...(opts.feeBump !== undefined && {
          feeBumpWad: BigInt(Math.round(parseFloat(opts.feeBump) * 1e16)) * 100n,
        }),
      };

      const nonceWindow = opts.nonceWindow ? Math.max(1, Math.min(10, opts.nonceWindow)) : undefined;

      const revalidation: RevalidationConfig | undefined = opts.revalidation
        ? { invalidThreshold: opts.revalidationThreshold ?? 2 }
        : undefined;

      // ── Multi-wallet parallel path ──────────────────────────────────
      if (opts.wallets && opts.wallets > 1) {
        if (!opts.campaignName) {
          throw new Error('--campaign-name is required when using --wallets');
        }

        const account = privateKeyToAccount(privateKey);
        const typedData = createEIP712Message({
          funder: account.address,
          name: opts.campaignName,
          version: 1,
        });
        const signature = await account.signTypedData({
          domain: typedData.domain,
          types: typedData.types,
          primaryType: typedData.primaryType,
          message: typedData.message,
        });

        const walletOffset = opts.walletOffset ?? 0;
        const derived = deriveMultipleWallets({
          signature: signature as Hex,
          count: opts.wallets,
          offset: walletOffset,
        });

        const walletClients: WalletClient[] = derived.map((w) =>
          createWalletClient({
            account: privateKeyToAccount(w.privateKey as Hex),
            transport: http(opts.rpc),
          }),
        );

        const parallelResults = await disperseParallel({
          contractAddress,
          variant: opts.variant,
          token: tokenAddress,
          recipients,
          ...(opts.amount ? { amount: BigInt(opts.amount) } : { amounts: parsed.rows.map((r) => BigInt(r.amount ?? '0')) }),
          walletClients,
          publicClient,
          batchSize,
          onProgress,
          gasConfig,
          ...(nonceWindow !== undefined && { nonceWindow }),
        });

        const serialized = parallelResults.map((pr) => ({
          walletIndex: pr.walletIndex,
          walletAddress: pr.walletAddress,
          results: serializeBatchResults([...pr.results]),
        }));
        console.log(JSON.stringify(serialized, null, 2));
        return;
      }

      // ── Single-wallet path ────────────────────────────────────────
      let results: BatchResult[];

      if (opts.amount) {
        // Uniform mode: same amount for all recipients
        const amount = BigInt(opts.amount);
        results = await disperseTokensSimple({
          contractAddress,
          variant: opts.variant,
          token: tokenAddress,
          recipients,
          amount,
          from,
          campaignId,
          walletClient,
          publicClient,
          batchSize,
          onProgress,
          gasConfig,
          ...(nonceWindow !== undefined && { nonceWindow }),
          ...(revalidation !== undefined && { revalidation }),
        });
      } else {
        // Variable mode: amounts come from CSV second column
        const amounts = parsed.rows.map((r) => BigInt(r.amount ?? '0'));
        results = await disperseTokens({
          contractAddress,
          variant: opts.variant,
          token: tokenAddress,
          recipients,
          amounts,
          from,
          campaignId,
          walletClient,
          publicClient,
          batchSize,
          onProgress,
          gasConfig,
          ...(nonceWindow !== undefined && { nonceWindow }),
          ...(revalidation !== undefined && { revalidation }),
        });
      }

      console.log(JSON.stringify(serializeBatchResults(results), null, 2));
    });
}
