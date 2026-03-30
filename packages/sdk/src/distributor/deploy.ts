import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Address, Hex, PublicClient, WalletClient } from 'viem';
import type { ContractArtifact } from '../types.js';
import TitrateSimpleArtifact from './artifacts/TitrateSimple.json' with { type: 'json' };
import TitrateFullArtifact from './artifacts/TitrateFull.json' with { type: 'json' };

const __dirname = dirname(fileURLToPath(import.meta.url));

export type DeployParams = {
  readonly variant: 'simple' | 'full';
  readonly name: string;
  readonly walletClient: WalletClient;
  readonly publicClient: PublicClient;
};

export type DeployResult = {
  readonly address: Address;
  readonly txHash: Hex;
  readonly variant: 'simple' | 'full';
  readonly name: string;
};

function getArtifact(variant: 'simple' | 'full'): ContractArtifact {
  return (variant === 'simple' ? TitrateSimpleArtifact : TitrateFullArtifact) as ContractArtifact;
}

/**
 * Returns a Solidity source template for the given contract variant.
 * The template uses the canonical contract name; callers may substitute
 * a custom name before submitting to a block explorer.
 */
export function getContractSourceTemplate(variant: 'simple' | 'full'): string {
  const filename = variant === 'simple' ? 'TitrateSimple.sol.txt' : 'TitrateFull.sol.txt';
  return readFileSync(join(__dirname, 'artifacts', filename), 'utf-8');
}

/**
 * Deploys a TitrateSimple or TitrateFull distributor contract on-chain.
 *
 * @param params - Deploy parameters including variant, name, and clients
 * @returns The deployed contract address, transaction hash, variant, and name
 */
export async function deployDistributor(params: DeployParams): Promise<DeployResult> {
  const { variant, name, walletClient, publicClient } = params;
  const artifact = getArtifact(variant);

  const hash = await walletClient.deployContract({
    abi: artifact.abi as never,
    bytecode: artifact.bytecode,
    account: walletClient.account!,
    chain: undefined,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (!receipt.contractAddress) {
    throw new Error(`Contract deployment failed for variant "${variant}": no address in receipt`);
  }

  return {
    address: receipt.contractAddress,
    txHash: hash,
    variant,
    name,
  };
}
