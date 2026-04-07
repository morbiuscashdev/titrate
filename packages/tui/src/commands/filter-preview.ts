import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import type { Address } from 'viem';
import { createPipeline, parseCSV } from '@titrate/sdk';
import { createRpcClient } from '../utils/rpc.js';

/**
 * Registers the `filter-preview` subcommand on a Commander program.
 *
 * Previews how filters affect an address list without distributing.
 * Runs the pipeline with selected filters and reports how many addresses
 * survive each stage.
 */
export function registerFilterPreview(program: Command): void {
  program
    .command('filter-preview')
    .description('Preview how filters affect an address list without distributing')
    .requiredOption('--input <path>', 'CSV file with addresses')
    .option('--rpc <url>', 'RPC endpoint URL', 'http://localhost:8545')
    .option('--chain-id <id>', 'Chain ID', parseInt)
    .option('--contract-check', 'Exclude contract addresses')
    .option('--min-balance <eth>', 'Minimum ETH balance')
    .option('--nonce-min <n>', 'Minimum nonce', parseInt)
    .option('--nonce-max <n>', 'Maximum nonce', parseInt)
    .option('--json', 'Output as JSON')
    .action(async (opts: {
      input: string;
      rpc: string;
      chainId?: number;
      contractCheck?: boolean;
      minBalance?: string;
      nonceMin?: number;
      nonceMax?: number;
      json?: boolean;
    }) => {
      const csv = readFileSync(opts.input, 'utf-8');
      const rows = parseCSV(csv).rows;
      const addresses = rows.map((r) => r.address);

      console.error(`Input: ${addresses.length} addresses`);

      const hasFilters = opts.contractCheck || opts.minBalance ||
        opts.nonceMin !== undefined || opts.nonceMax !== undefined;

      if (!hasFilters) {
        console.error('No filters specified. Use --contract-check, --min-balance, --nonce-min/--nonce-max');
        process.exit(1);
      }

      const pipeline = createPipeline();
      pipeline.addSource('csv', { addresses });

      if (opts.contractCheck) {
        pipeline.addFilter('contract-check', {});
      }
      if (opts.minBalance) {
        pipeline.addFilter('min-balance', { minBalance: opts.minBalance });
      }
      if (opts.nonceMin !== undefined || opts.nonceMax !== undefined) {
        pipeline.addFilter('nonce-range', {
          minNonce: opts.nonceMin ?? 0,
          maxNonce: opts.nonceMax ?? 1_000_000,
        });
      }

      const client = createRpcClient(opts.rpc, opts.chainId);

      const surviving: Address[] = [];
      for await (const batch of pipeline.execute(client, (event) => {
        if (event.type === 'filter') {
          console.error(`  ${event.filterName}: ${event.inputCount} -> ${event.outputCount}`);
        }
      })) {
        surviving.push(...batch);
      }

      console.error(`Result: ${surviving.length} of ${addresses.length} addresses pass`);

      if (opts.json) {
        console.log(JSON.stringify({
          input: addresses.length,
          output: surviving.length,
          removed: addresses.length - surviving.length,
          addresses: surviving,
        }, null, 2));
      } else {
        for (const addr of surviving) {
          console.log(addr);
        }
      }
    });
}
