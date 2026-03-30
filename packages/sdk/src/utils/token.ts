import type { Address, PublicClient } from 'viem';

export type TokenMetadata = {
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
};

const erc20Abi = [
  { type: 'function', name: 'name', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'symbol', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
] as const;

/**
 * Reads ERC-20 name, symbol, and decimals from a token contract.
 * Returns null if any call fails (not a valid ERC-20).
 */
export async function probeToken(
  client: PublicClient,
  address: Address,
): Promise<TokenMetadata | null> {
  try {
    const [name, symbol, decimals] = await Promise.all([
      client.readContract({ address, abi: erc20Abi, functionName: 'name' }),
      client.readContract({ address, abi: erc20Abi, functionName: 'symbol' }),
      client.readContract({ address, abi: erc20Abi, functionName: 'decimals' }),
    ]);
    return { name: name as string, symbol: symbol as string, decimals: Number(decimals) };
  } catch {
    return null;
  }
}
