import { useQuery } from '@tanstack/react-query';
import { probeToken } from '@titrate/sdk';
import { useChain } from '../providers/ChainProvider.js';
import type { Address } from 'viem';

/**
 * Fetches ERC-20 token metadata (name, symbol, decimals) for a given address.
 *
 * Uses `staleTime: Infinity` because token metadata is immutable once deployed.
 */
export function useTokenMetadata(tokenAddress: Address | null) {
  const { publicClient } = useChain();

  return useQuery({
    queryKey: ['token-metadata', tokenAddress],
    queryFn: () => probeToken(publicClient!, tokenAddress!),
    enabled: !!publicClient && !!tokenAddress,
    staleTime: Infinity,
  });
}
