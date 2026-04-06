import { useMemo } from 'react';
import { useChain } from '../providers/ChainProvider.js';
import { checkRecipients } from '@titrate/sdk';
import type { Address, Hex } from 'viem';
import type { LiveFilter } from '@titrate/sdk';

/**
 * Composes multiple live filters into a single filter function.
 * Filters are applied in sequence — each receives the output of the previous.
 * Returns `undefined` when no active filters are provided.
 */
export function composeLiveFilters(
  ...filters: readonly (LiveFilter | undefined)[]
): LiveFilter | undefined {
  const active = filters.filter(
    (f): f is LiveFilter => typeof f === 'function',
  );

  if (active.length === 0) return undefined;
  if (active.length === 1) return active[0];

  return async (addresses: readonly Address[]): Promise<readonly Address[]> => {
    let result: readonly Address[] = addresses;
    for (const filter of active) {
      result = await filter(result);
    }
    return result;
  };
}

/**
 * Parameters for the useLiveFilter hook.
 */
export type UseLiveFilterParams = {
  readonly contractAddress: Address | null;
  readonly campaignId: Hex | null;
  readonly variant: 'simple' | 'full';
};

/**
 * Creates a live filter that checks whether addresses have already received
 * tokens in this campaign via the on-chain registry (TitrateFull only).
 *
 * The registry check calls `checkRecipients` on the TitrateFull contract,
 * which returns a boolean array indicating which addresses have already
 * been processed. Only addresses that have NOT been sent to are returned.
 *
 * @returns The live filter function, or undefined if conditions are not met
 */
export function useLiveFilter(params: UseLiveFilterParams): LiveFilter | undefined {
  const { publicClient } = useChain();
  const { contractAddress, campaignId, variant } = params;

  return useMemo(() => {
    if (variant !== 'full') return undefined;
    if (!contractAddress) return undefined;
    if (!campaignId) return undefined;
    if (!publicClient) return undefined;

    const addr = contractAddress;
    const cid = campaignId;
    const client = publicClient;

    return async (addresses: readonly Address[]): Promise<readonly Address[]> => {
      if (addresses.length === 0) return [];

      const alreadySent = await checkRecipients({
        contractAddress: addr,
        distributor: addr,
        campaignId: cid,
        recipients: addresses,
        publicClient: client,
      });

      return addresses.filter((_, index) => !alreadySent[index]);
    };
  }, [variant, contractAddress, campaignId, publicClient]);
}
