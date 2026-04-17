import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Command } from 'commander';
import type { Address, Hex } from 'viem';
import { createEIP712Message, deriveMultipleWallets } from '@titrate/sdk';
import { decryptPrivateKey } from '../utils/passphrase.js';
import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http, parseAbi } from 'viem';
import { createRpcClient } from '../utils/rpc.js';
import { resolvePrivateKey } from '../utils/wallet.js';
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

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

const erc20Abi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
]);

type SweepResult = {
  readonly index: number;
  readonly address: Address;
  readonly balance: string;
  readonly txHash: string | null;
  readonly error: string | null;
};

/**
 * Registers the `sweep` subcommand on a Commander program.
 *
 * Derives hot wallets from a cold key, checks their token (or native) balances,
 * and transfers any residual funds back to the funder address.
 */
export function registerSweep(program: Command): void {
  program
    .command('sweep')
    .description('Sweep residual balances from derived hot wallets back to the funder')
    .option('--rpc <url>', 'RPC endpoint URL')
    .option('--campaign-name --campaignName <name>', 'Campaign name for EIP-712 wallet derivation')
    .option('--count <number>', 'Number of derived hot wallets to sweep', parseInt)
    .option('--token <address>', 'Token contract address (zero address or omit for native ETH)')
    .option('--private-key --privateKey <key>', 'Cold wallet private key (or set TITRATE_PRIVATE_KEY)')
    .option('--offset <number>', 'Starting index offset for wallet derivation (default: 0)', parseInt)
    .option('--chain-id --chainId <id>', 'Chain ID for RPC client configuration', parseInt)
    .option('--dry-run --dryRun', 'Check balances without sending transactions')
    .option('-c, --campaign <name>', 'Campaign name (loads config from campaign directory)')
    .option('--folder <path>', 'Campaign root directory (with --campaign)')
    .action(async (opts: {
      rpc?: string;
      campaignName?: string;
      count?: number;
      token?: string;
      privateKey?: string;
      offset?: number;
      chainId?: number;
      dryRun?: boolean;
      campaign?: string;
      folder?: string;
    }) => {
      if (opts.campaign) {
        await loadFromCampaign(opts.campaign, opts.folder);
        return;
      }

      // Guard required flags in the non-campaign path (formerly enforced by requiredOption).
      if (!opts.rpc) throw new Error('missing required option: --rpc <url>');
      if (!opts.campaignName) throw new Error('missing required option: --campaign-name <name>');
      if (opts.count === undefined) throw new Error('missing required option: --count <number>');

      const coldKey = resolvePrivateKey(opts.privateKey);
      const coldAccount = privateKeyToAccount(coldKey);
      const funder = coldAccount.address;
      const publicClient = createRpcClient(opts.rpc, opts.chainId);
      const offset = opts.offset ?? 0;
      const isNative = !opts.token || opts.token === ZERO_ADDRESS;
      const tokenAddress = isNative ? ZERO_ADDRESS : (opts.token as Address);

      // Derive hot wallets
      const typedData = createEIP712Message({
        funder,
        name: opts.campaignName,
        version: 1,
      });
      const signature = await coldAccount.signTypedData({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message,
      });

      const derived = deriveMultipleWallets({
        signature: signature as Hex,
        count: opts.count,
        offset,
      });

      // Check balances in parallel
      const balances = await Promise.all(
        derived.map(async (w) => {
          if (isNative) {
            return publicClient.getBalance({ address: w.address });
          }
          return publicClient.readContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [w.address],
          });
        }),
      );

      const results: SweepResult[] = [];

      for (let i = 0; i < derived.length; i++) {
        const wallet = derived[i];
        const balance = balances[i];

        if (balance === 0n) {
          results.push({
            index: offset + i,
            address: wallet.address,
            balance: '0',
            txHash: null,
            error: null,
          });
          continue;
        }

        if (opts.dryRun) {
          results.push({
            index: offset + i,
            address: wallet.address,
            balance: balance.toString(),
            txHash: null,
            error: null,
          });
          continue;
        }

        const walletClient = createWalletClient({
          account: privateKeyToAccount(wallet.privateKey as Hex),
          transport: http(opts.rpc),
        });

        try {
          let txHash: Hex;

          if (isNative) {
            // Reserve gas for the transfer itself
            const gasEstimate = await publicClient.estimateGas({
              account: walletClient.account!,
              to: funder,
              value: balance,
            });
            const gasPrice = await publicClient.getGasPrice();
            const gasCost = gasEstimate * gasPrice;

            if (balance <= gasCost) {
              results.push({
                index: offset + i,
                address: wallet.address,
                balance: balance.toString(),
                txHash: null,
                error: 'Balance too low to cover gas',
              });
              continue;
            }

            txHash = await walletClient.sendTransaction({
              to: funder,
              value: balance - gasCost,
              chain: null,
            });
          } else {
            txHash = await walletClient.writeContract({
              address: tokenAddress,
              abi: erc20Abi,
              functionName: 'transfer',
              args: [funder, balance],
              chain: null,
            });
          }

          results.push({
            index: offset + i,
            address: wallet.address,
            balance: balance.toString(),
            txHash,
            error: null,
          });
        } catch (err) {
          results.push({
            index: offset + i,
            address: wallet.address,
            balance: balance.toString(),
            txHash: null,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      console.log(JSON.stringify(results, null, 2));
    });
}
