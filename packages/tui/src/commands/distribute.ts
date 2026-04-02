import { readFile } from 'node:fs/promises';
import { Command } from 'commander';
import type { Address, Hex } from 'viem';
import { disperseTokens, disperseTokensSimple, parseCSV, serializeBatchResults } from '@titrate/sdk';
import type { BatchResult, GasConfig } from '@titrate/sdk';
import { createRpcClient } from '../utils/rpc.js';
import { createSignerClient, resolvePrivateKey } from '../utils/wallet.js';
import { createProgressRenderer } from '../progress/renderer.js';

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
    .requiredOption('--contract <address>', 'Distributor contract address')
    .requiredOption('--token <address>', 'Token contract address (zero address for native)')
    .requiredOption('--rpc <url>', 'RPC endpoint URL')
    .requiredOption('--addresses <path>', 'CSV file of recipient addresses (and optional amounts)')
    .option('--amount <value>', 'Uniform token amount (in smallest unit) for all recipients')
    .option('--decimals <number>', 'Token decimals (used for display only)', parseInt)
    .option('--variant <simple|full>', 'Contract variant', 'simple')
    .option('--private-key --privateKey <key>', 'Distributor private key (or set TITRATE_PRIVATE_KEY)')
    .option('--from <address>', 'Operator address override (for full variant)')
    .option('--batch-size --batchSize <number>', 'Recipients per transaction batch', '200')
    .option('--campaign-id --campaignId <hex>', 'Campaign ID bytes32 (for full variant)')
    .option('--chain-id --chainId <id>', 'Chain ID for RPC client configuration', parseInt)
    .option('--gas-padding --gasPadding <number>', 'Gas limit padding fraction (default: 0.2)', parseFloat)
    .option('--max-gas-price --maxGasPrice <wei>', 'Max gas price in wei; skip batch if exceeded')
    .option('--max-total-gas-cost --maxTotalGasCost <wei>', 'Stop distribution if cumulative gas cost exceeds this (in wei)')
    .action(async (opts: {
      contract: string;
      token: string;
      rpc: string;
      addresses: string;
      amount?: string;
      decimals?: number;
      variant: 'simple' | 'full';
      privateKey?: string;
      from?: string;
      batchSize: string;
      campaignId?: string;
      chainId?: number;
      gasPadding?: number;
      maxGasPrice?: string;
      maxTotalGasCost?: string;
    }) => {
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
        ...(opts.gasPadding !== undefined && { gasLimitPadding: opts.gasPadding }),
        ...(opts.maxGasPrice !== undefined && { maxGasPrice: BigInt(opts.maxGasPrice) }),
        ...(opts.maxTotalGasCost !== undefined && { maxTotalGasCost: BigInt(opts.maxTotalGasCost) }),
      };

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
        });
      }

      console.log(JSON.stringify(serializeBatchResults(results), null, 2));
    });
}
