import type { Address, Hex, PublicClient } from 'viem';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const TitrateFullArtifact = require('./artifacts/TitrateFull.json');
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const fullAbi = TitrateFullArtifact.abi as never;

export type CheckRecipientsParams = {
  readonly contractAddress: Address;
  readonly distributor: Address;
  readonly campaignId: Hex;
  readonly recipients: readonly Address[];
  readonly publicClient: PublicClient;
};

/**
 * Checks which recipients have already been processed for a given campaign.
 * Returns a boolean array parallel to `recipients` — true means already sent.
 *
 * @param params - Check recipients parameters
 * @returns Array of booleans indicating prior-send status for each recipient
 */
export async function checkRecipients(
  params: CheckRecipientsParams,
): Promise<boolean[]> {
  const { contractAddress, distributor, campaignId, recipients, publicClient } = params;

  const result = await publicClient.readContract({
    address: contractAddress,
    abi: fullAbi,
    functionName: 'checkRecipients',
    args: [distributor, campaignId, recipients],
  });

  return result as boolean[];
}
