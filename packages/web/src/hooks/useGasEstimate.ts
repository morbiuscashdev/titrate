import { useQuery } from '@tanstack/react-query';
import { useChain } from '../providers/ChainProvider.js';
import type { Address, Abi } from 'viem';

/** Parameters for estimating contract gas usage. */
export type GasEstimateParams = {
  readonly address: Address;
  readonly abi: Abi;
  readonly functionName: string;
  readonly args: readonly unknown[];
  readonly account: Address;
};

/**
 * Estimates gas for a contract call.
 *
 * Pass `null` to disable the query until all parameters are available.
 * Stale after 30 seconds since gas estimates change with network conditions.
 */
export function useGasEstimate(params: GasEstimateParams | null) {
  const { publicClient } = useChain();

  return useQuery({
    queryKey: ['gas-estimate', params?.address, params?.functionName, params?.account],
    queryFn: () =>
      publicClient!.estimateContractGas({
        address: params!.address,
        abi: params!.abi,
        functionName: params!.functionName,
        args: [...params!.args],
        account: params!.account,
      }),
    enabled: !!publicClient && !!params,
    staleTime: 30_000,
  });
}
