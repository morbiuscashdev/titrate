import { Command } from 'commander';
import { deployDistributor } from '@titrate/sdk';
import { createRpcClient } from '../utils/rpc.js';
import { createSignerClient, resolvePrivateKey } from '../utils/wallet.js';

/**
 * Registers the `deploy` subcommand on a Commander program.
 *
 * Deploys a TitrateSimple or TitrateFull distributor contract and outputs
 * the result as JSON to stdout.
 */
export function registerDeploy(program: Command): void {
  program
    .command('deploy')
    .description('Deploy a Titrate distributor contract on-chain')
    .requiredOption('--name <name>', 'Logical name for the deployed contract')
    .requiredOption('--rpc <url>', 'RPC endpoint URL')
    .option('--variant <simple|full>', 'Contract variant to deploy', 'simple')
    .option('--private-key <key>', 'Deployer private key (or set TITRATE_PRIVATE_KEY)')
    .option('--chain-id <id>', 'Chain ID for RPC client configuration', parseInt)
    .option('--verify', 'Attempt source verification after deployment', false)
    .action(async (opts: {
      name: string;
      rpc: string;
      variant: 'simple' | 'full';
      privateKey?: string;
      chainId?: number;
      verify: boolean;
    }) => {
      const privateKey = resolvePrivateKey(opts.privateKey);
      const publicClient = createRpcClient(opts.rpc, opts.chainId);
      const walletClient = createSignerClient(privateKey, opts.rpc);

      const result = await deployDistributor({
        variant: opts.variant,
        name: opts.name,
        walletClient,
        publicClient,
      });

      console.log(JSON.stringify(result, null, 2));
    });
}
