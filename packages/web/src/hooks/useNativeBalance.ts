import { useQuery } from '@tanstack/react-query';
import { useChain } from '../providers/ChainProvider.js';
import type { Address } from 'viem';

/**
 * Fetches the native currency balance (e.g. ETH) for a given address.
 *
 * Stale after 15 seconds to balance freshness against RPC rate limits.
 */
export function useNativeBalance(address: Address | null) {
  const { publicClient } = useChain();

  return useQuery({
    queryKey: ['native-balance', address, publicClient?.chain?.id],
    queryFn: () => publicClient!.getBalance({ address: address! }),
    enabled: !!publicClient && !!address,
    staleTime: 15_000,
  });
}
