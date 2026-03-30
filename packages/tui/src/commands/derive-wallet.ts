import { Command } from 'commander';
import type { Address, Hex } from 'viem';
import { createEIP712Message, deriveHotWallet } from '@titrate/sdk';
import { resolvePrivateKey } from '../utils/wallet.js';
import { privateKeyToAccount } from 'viem/accounts';

/**
 * Registers the `derive-wallet` subcommand on a Commander program.
 *
 * Signs an EIP-712 message with the cold key, then deterministically derives
 * a hot wallet from the signature. Outputs JSON with hotAddress and privateKey.
 */
export function registerDeriveWallet(program: Command): void {
  program
    .command('derive-wallet')
    .description('Derive a hot wallet from a cold key using EIP-712 signing')
    .requiredOption('--funder <address>', 'Funder address (cold wallet address)')
    .requiredOption('--name <name>', 'Campaign name')
    .option('--version <number>', 'Campaign version', '1')
    .option('--cold-key <key>', 'Cold wallet private key (or set TITRATE_PRIVATE_KEY)')
    .action(async (opts: {
      funder: string;
      name: string;
      version: string;
      coldKey?: string;
    }) => {
      const coldKey = resolvePrivateKey(opts.coldKey);
      const account = privateKeyToAccount(coldKey);

      const typedData = createEIP712Message({
        funder: opts.funder as Address,
        name: opts.name,
        version: parseInt(opts.version, 10),
      });

      const signature = await account.signTypedData({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message,
      });

      const derived = deriveHotWallet(signature as Hex);

      console.log(
        JSON.stringify(
          {
            hotAddress: derived.address,
            privateKey: derived.privateKey,
          },
          null,
          2,
        ),
      );
    });
}
