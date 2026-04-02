import { readFile, writeFile } from 'node:fs/promises';
import { Command } from 'commander';
import type { Address } from 'viem';
import { deserializePipeline } from '@titrate/sdk';
import type { PipelineConfig } from '@titrate/sdk';
import { createRpcClient } from '../utils/rpc.js';
import { createProgressRenderer } from '../progress/renderer.js';

/**
 * Registers the `run` subcommand on a Commander program.
 *
 * Reads a pipeline config JSON file, executes the pipeline, and writes the
 * collected address list to an output file (or stdout if no --output provided).
 */
export function registerRun(program: Command): void {
  program
    .command('run')
    .description('Execute a pipeline from a JSON config file')
    .requiredOption('--config <path>', 'Path to pipeline config JSON file')
    .requiredOption('--rpc <url>', 'RPC endpoint URL')
    .option('--output <path>', 'Output CSV file path (default: stdout)')
    .option('--chain-id --chainId <id>', 'Chain ID for RPC client configuration', parseInt)
    .action(async (opts: {
      config: string;
      rpc: string;
      output?: string;
      chainId?: number;
    }) => {
      const configRaw = await readFile(opts.config, 'utf8');
      const pipelineConfig = JSON.parse(configRaw) as PipelineConfig;

      const rpc = createRpcClient(opts.rpc, opts.chainId);
      const onProgress = createProgressRenderer();
      const pipeline = deserializePipeline(pipelineConfig);

      const allAddresses: Address[] = [];
      for await (const batch of pipeline.execute(rpc, onProgress)) {
        allAddresses.push(...batch);
      }

      const csv = allAddresses.join('\n') + (allAddresses.length > 0 ? '\n' : '');

      if (opts.output) {
        await writeFile(opts.output, csv, 'utf8');
        console.log(`Pipeline complete: ${allAddresses.length} addresses → ${opts.output}`);
      } else {
        process.stdout.write(csv);
      }
    });
}
