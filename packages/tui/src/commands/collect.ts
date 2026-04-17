import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Command } from 'commander';
import type { Address } from 'viem';
import { createPipeline } from '@titrate/sdk';
import { createRpcClient } from '../utils/rpc.js';
import { createProgressRenderer } from '../progress/renderer.js';
import { createCampaignStorage } from '@titrate/storage-campaign';
import { resolveCampaignRoot } from '../utils/campaign-root.js';

/**
 * Load campaign config from a named campaign directory.
 *
 * NOTE: The `encryptedKey` field on WalletRecord is currently a plain string
 * (Task 2 spec). Proper decryption requires the full envelope
 * `{ ciphertext, iv, authTag }` which Task 28 migrates. Until that lands,
 * this helper intentionally throws — the flag scaffolding is wired but the
 * decryption path is not yet functional.
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
        // Currently encryptedKey is just the ciphertext string (Task 28 will fix).
        // For now, decryptPrivateKey needs the full envelope which we don't have.
        // This code path will be completed after Task 28 migrates the schema.
        throw new Error(`--campaign flag requires Task 28 (encryptedKey envelope migration) to land first`);
      } catch (err) {
        throw new Error(`Wallet ${r.index}: ${err}`);
      }
    }),
  );

  // passphrase is read above but not used until Task 28 — suppress unused warning
  void passphrase;

  return { manifest, privateKeys, storage };
}

/**
 * Parses a block range string of the form "start:end" into a tuple of bigints.
 * Throws if the format is invalid.
 */
function parseBlockRange(raw: string): readonly [bigint, bigint] {
  const parts = raw.split(':');
  if (parts.length !== 2) {
    throw new Error(`Invalid --blocks format: expected "start:end", got "${raw}"`);
  }
  return [BigInt(parts[0]), BigInt(parts[1])];
}

/**
 * Registers the `collect` subcommand on a Commander program.
 *
 * Builds a pipeline from CLI flags, executes it, and writes the deduplicated
 * address list to a CSV file (one address per line).
 */
export function registerCollect(program: Command): void {
  program
    .command('collect')
    .description('Collect addresses via block scan and/or CSV sources, apply filters, write output CSV')
    .option('--rpc <url>', 'RPC endpoint URL')
    .option('--output <path>', 'Output CSV file path')
    .option('--blocks <start:end>', 'Block range to scan (e.g. 19000000:19100000)')
    .option('--extract <field>', 'Field to extract: tx.from or tx.to', 'tx.from')
    .option('--csv <path>', 'Input CSV file of addresses to include as a source')
    .option('--filter-contracts --filterContracts', 'Remove contract addresses', false)
    .option('--filter-min-balance --filterMinBalance <ether>', 'Keep addresses with at least this ETH balance')
    .option('--exclude-token-recipients --excludeTokenRecipients <token>', 'Exclude addresses that received this token')
    .option('--exclude-csv --excludeCsv <path>', 'Exclude addresses listed in this CSV file')
    .option('--chain-id --chainId <id>', 'Chain ID for RPC client configuration', parseInt)
    .option('-c, --campaign <name>', 'Campaign name (loads config from campaign directory)')
    .option('--folder <path>', 'Campaign root directory (with --campaign)')
    .action(async (opts: {
      rpc?: string;
      output?: string;
      blocks?: string;
      extract: string;
      csv?: string;
      filterContracts: boolean;
      filterMinBalance?: string;
      excludeTokenRecipients?: string;
      excludeCsv?: string;
      chainId?: number;
      campaign?: string;
      folder?: string;
    }) => {
      if (opts.campaign) {
        // Throws with "requires Task 28" until the encryptedKey envelope migration lands.
        await loadFromCampaign(opts.campaign, opts.folder);
        return;
      }

      // Guard required flags in the non-campaign path (formerly enforced by requiredOption).
      if (!opts.rpc) throw new Error('missing required option: --rpc <url>');
      if (!opts.output) throw new Error('missing required option: --output <path>');

      const rpc = createRpcClient(opts.rpc, opts.chainId);
      const onProgress = createProgressRenderer();
      const pipeline = createPipeline();

      if (opts.blocks) {
        const [startBlock, endBlock] = parseBlockRange(opts.blocks);
        pipeline.addSource('block-scan', {
          startBlock: startBlock.toString(),
          endBlock: endBlock.toString(),
          extract: opts.extract,
        });
      }

      if (opts.csv) {
        const { readFile } = await import('node:fs/promises');
        const raw = await readFile(opts.csv, 'utf8');
        const addresses = raw
          .split('\n')
          .map((l) => l.trim().split(',')[0])
          .filter((a) => a.length > 0);
        pipeline.addSource('csv', { addresses });
      }

      if (opts.filterContracts) {
        pipeline.addFilter('contract-check', {});
      }

      if (opts.filterMinBalance) {
        pipeline.addFilter('min-balance', { minBalance: opts.filterMinBalance });
      }

      if (opts.excludeTokenRecipients) {
        const { readFile } = await import('node:fs/promises');
        // Find blocks from pipeline or use defaults
        pipeline.addFilter('token-recipients', {
          token: opts.excludeTokenRecipients,
          startBlock: '0',
          endBlock: '999999999',
        });
      }

      if (opts.excludeCsv) {
        const { readFile } = await import('node:fs/promises');
        const raw = await readFile(opts.excludeCsv, 'utf8');
        const addresses = raw
          .split('\n')
          .map((l) => l.trim().split(',')[0])
          .filter((a) => a.length > 0);
        pipeline.addFilter('csv-exclusion', { addresses });
      }

      const allAddresses: Address[] = [];
      for await (const batch of pipeline.execute(rpc, onProgress)) {
        allAddresses.push(...batch);
      }

      const csv = allAddresses.join('\n') + '\n';
      await writeFile(opts.output, csv, 'utf8');

      console.log(`Collected ${allAddresses.length} addresses → ${opts.output}`);
    });
}
