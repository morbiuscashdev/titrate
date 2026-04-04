import { useQuery } from '@tanstack/react-query';
import { erc20Abi } from 'viem';
import { useChain } from '../providers/ChainProvider.js';
import type { Address } from 'viem';

/**
 * Fetches an ERC-20 token balance for a given account.
 *
 * Stale after 15 seconds to balance freshness against RPC rate limits.
 */
export function useTokenBalance(tokenAddress: Address | null, account: Address | null) {
  const { publicClient } = useChain();

  return useQuery({
    queryKey: ['token-balance', tokenAddress, account, publicClient?.chain?.id],
    queryFn: () =>
      publicClient!.readContract({
        address: tokenAddress!,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [account!],
      }),
    enabled: !!publicClient && !!tokenAddress && !!account,
    staleTime: 15_000,
  });
}
