import { writeFile } from 'node:fs/promises';
import { Command } from 'commander';
import type { Address } from 'viem';
import { createPipeline } from '@titrate/sdk';
import { createRpcClient } from '../utils/rpc.js';
import { createProgressRenderer } from '../progress/renderer.js';

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
    .requiredOption('--rpc <url>', 'RPC endpoint URL')
    .requiredOption('--output <path>', 'Output CSV file path')
    .option('--blocks <start:end>', 'Block range to scan (e.g. 19000000:19100000)')
    .option('--extract <field>', 'Field to extract: tx.from or tx.to', 'tx.from')
    .option('--csv <path>', 'Input CSV file of addresses to include as a source')
    .option('--filter-contracts', 'Remove contract addresses', false)
    .option('--filter-min-balance <ether>', 'Keep addresses with at least this ETH balance')
    .option('--exclude-token-recipients <token>', 'Exclude addresses that received this token')
    .option('--exclude-csv <path>', 'Exclude addresses listed in this CSV file')
    .option('--chain-id <id>', 'Chain ID for RPC client configuration', parseInt)
    .action(async (opts: {
      rpc: string;
      output: string;
      blocks?: string;
      extract: string;
      csv?: string;
      filterContracts: boolean;
      filterMinBalance?: string;
      excludeTokenRecipients?: string;
      excludeCsv?: string;
      chainId?: number;
    }) => {
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
