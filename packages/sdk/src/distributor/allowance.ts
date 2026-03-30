import type { Address, Hex, PublicClient, WalletClient } from 'viem';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const TitrateFullArtifact = require('./artifacts/TitrateFull.json');
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const fullAbi = TitrateFullArtifact.abi as never;

export type ApproveOperatorParams = {
  readonly contractAddress: Address;
  readonly operator: Address;
  readonly selector: Hex;
  readonly amount: bigint;
  readonly walletClient: WalletClient;
  readonly publicClient: PublicClient;
};

/** Alias — increase uses the same parameter shape as approve. */
export type IncreaseAllowanceParams = ApproveOperatorParams;

export type GetAllowanceParams = {
  readonly contractAddress: Address;
  readonly owner: Address;
  readonly operator: Address;
  readonly selector: Hex;
  readonly publicClient: PublicClient;
};

/**
 * Sets an operator's allowance for a specific function selector on a TitrateFull contract.
 *
 * @param params - Approve parameters
 * @returns Transaction hash of the approval transaction
 */
export async function approveOperator(params: ApproveOperatorParams): Promise<Hex> {
  const { contractAddress, operator, selector, amount, walletClient, publicClient } = params;

  const hash = await walletClient.writeContract({
    address: contractAddress,
    abi: fullAbi,
    functionName: 'approve',
    args: [operator, selector, amount],
    account: walletClient.account!,
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/**
 * Increases an operator's allowance for a specific function selector on a TitrateFull contract.
 *
 * @param params - Increase allowance parameters
 * @returns Transaction hash of the increase transaction
 */
export async function increaseOperatorAllowance(
  params: IncreaseAllowanceParams,
): Promise<Hex> {
  const { contractAddress, operator, selector, amount, walletClient, publicClient } = params;

  const hash = await walletClient.writeContract({
    address: contractAddress,
    abi: fullAbi,
    functionName: 'increaseAllowance',
    args: [operator, selector, amount],
    account: walletClient.account!,
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/**
 * Reads the current operator allowance for a specific function selector.
 *
 * @param params - Get allowance parameters
 * @returns Current allowance as a bigint
 */
export async function getAllowance(params: GetAllowanceParams): Promise<bigint> {
  const { contractAddress, owner, operator, selector, publicClient } = params;

  return publicClient.readContract({
    address: contractAddress,
    abi: fullAbi,
    functionName: 'allowance',
    args: [owner, operator, selector],
  }) as Promise<bigint>;
}
