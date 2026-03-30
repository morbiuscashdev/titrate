import type { Address, Hex, PublicClient, WalletClient } from 'viem';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const TitrateSimpleArtifact = require('./artifacts/TitrateSimple.json');
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const TitrateFullArtifact = require('./artifacts/TitrateFull.json');

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

function getArtifact(variant: 'simple' | 'full'): { abi: unknown[]; bytecode: string } {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return variant === 'simple' ? TitrateSimpleArtifact : TitrateFullArtifact;
}

/**
 * Returns a Solidity source template for the given contract variant.
 * The template uses the canonical contract name; callers may substitute
 * a custom name before submitting to a block explorer.
 */
export function getContractSourceTemplate(variant: 'simple' | 'full'): string {
  const contractName = variant === 'simple' ? 'TitrateSimple' : 'TitrateFull';
  return `// Source template for ${contractName}\ncontract ${contractName} { /* ... */ }`;
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
    bytecode: artifact.bytecode as Hex,
    account: walletClient.account!,
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
