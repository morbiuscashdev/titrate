import { readFile } from 'node:fs/promises';
import { Command } from 'commander';
import type { Address, Hex } from 'viem';
import { disperseTokens, disperseTokensSimple, parseCSV } from '@titrate/sdk';
import type { BatchResult } from '@titrate/sdk';
import { createRpcClient } from '../utils/rpc.js';
import { createSignerClient, resolvePrivateKey } from '../utils/wallet.js';
import { createProgressRenderer } from '../progress/renderer.js';

/**
 * Serializes BatchResult[] to JSON, converting bigint fields to strings.
 */
function serializeResults(results: BatchResult[]): unknown {
  return results.map((r) => ({
    ...r,
    amounts: r.amounts.map((a) => a.toString()),
    blockNumber: r.blockNumber !== null ? r.blockNumber.toString() : null,
    attempts: r.attempts.map((a) => ({
      ...a,
      gasEstimate: a.gasEstimate.toString(),
      maxFeePerGas: a.maxFeePerGas.toString(),
      maxPriorityFeePerGas: a.maxPriorityFeePerGas.toString(),
    })),
  }));
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
    .requiredOption('--contract <address>', 'Distributor contract address')
    .requiredOption('--token <address>', 'Token contract address (zero address for native)')
    .requiredOption('--rpc <url>', 'RPC endpoint URL')
    .requiredOption('--addresses <path>', 'CSV file of recipient addresses (and optional amounts)')
    .option('--amount <value>', 'Uniform token amount (in smallest unit) for all recipients')
    .option('--decimals <number>', 'Token decimals (used for display only)', parseInt)
    .option('--variant <simple|full>', 'Contract variant', 'simple')
    .option('--private-key <key>', 'Distributor private key (or set TITRATE_PRIVATE_KEY)')
    .option('--from <address>', 'Operator address override (for full variant)')
    .option('--batch-size <number>', 'Recipients per transaction batch', '200')
    .option('--campaign-id <hex>', 'Campaign ID bytes32 (for full variant)')
    .option('--chain-id <id>', 'Chain ID for RPC client configuration', parseInt)
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
        });
      }

      console.log(JSON.stringify(serializeResults(results), null, 2));
    });
}
