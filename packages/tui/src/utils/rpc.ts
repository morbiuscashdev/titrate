import { createPublicClient, http } from 'viem';
import type { PublicClient, Chain } from 'viem';
import { getChainConfig } from '@titrate/sdk';

/**
 * Creates a viem PublicClient configured for the given RPC URL.
 * Optionally accepts a chainId to look up chain metadata from the SDK.
 *
 * @param rpcUrl - The RPC endpoint URL
 * @param chainId - Optional chain ID to configure chain metadata
 * @returns A configured PublicClient
 */
export function createRpcClient(rpcUrl: string, chainId?: number): PublicClient {
  let chain: Chain | undefined;

  if (chainId !== undefined) {
    const config = getChainConfig(chainId);
    if (config) {
      chain = {
        id: config.chainId,
        name: config.name,
        nativeCurrency: {
          name: config.nativeSymbol,
          symbol: config.nativeSymbol,
          decimals: config.nativeDecimals,
        },
        rpcUrls: {
          default: { http: config.rpcUrls as string[] },
        },
      };
    }
  }

  return createPublicClient({
    transport: http(rpcUrl),
    chain,
  });
}
