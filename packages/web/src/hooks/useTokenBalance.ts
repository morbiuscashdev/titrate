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
  const { publicClient, rpcBus } = useChain();

  return useQuery({
    queryKey: ['token-balance', tokenAddress, account, publicClient?.chain?.id],
    queryFn: () => {
      const call = () =>
        publicClient!.readContract({
          address: tokenAddress!,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [account!],
        });
      return rpcBus ? rpcBus.execute(call) : call();
    },
    enabled: !!publicClient && !!tokenAddress && !!account,
    staleTime: 15_000,
  });
}
