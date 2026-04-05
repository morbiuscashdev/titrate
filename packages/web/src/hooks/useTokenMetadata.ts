import { useQuery } from '@tanstack/react-query';
import { probeToken } from '@titrate/sdk';
import { useChain } from '../providers/ChainProvider.js';
import { useCache } from '../providers/CacheProvider.js';
import type { Address } from 'viem';

/**
 * Fetches ERC-20 token metadata (name, symbol, decimals) for a given address.
 *
 * Checks the persistent IDB cache first to avoid unnecessary RPC calls on
 * page reload. Token metadata is immutable once deployed, so entries never
 * expire (`ttl: null`).
 */
export function useTokenMetadata(tokenAddress: Address | null) {
  const { publicClient, rpcBus } = useChain();
  const { cache } = useCache();

  return useQuery({
    queryKey: ['token-metadata', tokenAddress],
    queryFn: async () => {
      if (!publicClient || !tokenAddress) return null;

      const probe = () => probeToken(publicClient, tokenAddress);
      const busWrapped = rpcBus ? () => rpcBus.execute(probe) : probe;

      if (cache) {
        const cacheKey = `token-metadata:${tokenAddress}`;
        return cache.getOrCompute(cacheKey, busWrapped, null);
      }

      return busWrapped();
    },
    enabled: !!publicClient && !!tokenAddress,
    staleTime: Infinity,
  });
}
