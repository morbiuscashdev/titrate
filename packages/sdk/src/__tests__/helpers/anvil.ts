import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  type PublicClient,
  type WalletClient,
  type Address,
  type Hex,
  type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

// Anvil default account #0
const ANVIL_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;

export type AnvilContext = {
  readonly rpcUrl: string;
  readonly publicClient: PublicClient;
  readonly walletClient: WalletClient;
  readonly account: { readonly address: Address; readonly privateKey: Hex };
  readonly chain: Chain;
};

export function createAnvilContext(rpcUrl = 'http://127.0.0.1:8545'): AnvilContext {
  const account = privateKeyToAccount(ANVIL_PRIVATE_KEY);

  const publicClient = createPublicClient({
    chain: foundry,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    chain: foundry,
    transport: http(rpcUrl),
    account,
  });

  return {
    rpcUrl,
    publicClient,
    walletClient,
    account: { address: account.address, privateKey: ANVIL_PRIVATE_KEY },
    chain: foundry,
  };
}

/** Deploy a contract and return its address. */
export async function deployContract(
  ctx: AnvilContext,
  bytecode: Hex,
  abi: readonly Record<string, unknown>[],
): Promise<Address> {
  const hash = await ctx.walletClient.deployContract({
    abi: abi as never,
    bytecode,
    account: ctx.walletClient.account!,
    chain: undefined,
  });
  const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) throw new Error('Deploy failed: no contract address');
  return receipt.contractAddress;
}

/** Mine N empty blocks (useful for scanner tests). */
export async function mineBlocks(ctx: AnvilContext, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await ctx.publicClient.request({ method: 'evm_mine' as never, params: [] as never });
  }
}

/** Send ETH from Anvil account to an address. */
export async function fundAddress(
  ctx: AnvilContext,
  to: Address,
  amount: bigint,
): Promise<void> {
  const hash = await ctx.walletClient.sendTransaction({
    to,
    value: amount,
    account: ctx.walletClient.account!,
    chain: undefined,
  });
  await ctx.publicClient.waitForTransactionReceipt({ hash });
}
