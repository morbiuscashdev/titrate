export type DistributionRequirements = {
  readonly gasTokenNeeded: bigint;
  readonly erc20Needed: bigint;
  readonly batchCount: number;
};

/**
 * Computes how much gas token and ERC-20 a distribution will need.
 * For uniform amounts: erc20 = amountPerRecipient × recipientCount.
 * For variable amounts: provide totalAmount directly.
 */
export function computeRequirements(params: {
  readonly recipientCount: number;
  readonly batchSize: number;
  readonly amountPerRecipient: bigint;
  readonly totalAmount?: bigint;
  readonly gasPerBatch: bigint;
}): DistributionRequirements {
  const { recipientCount, batchSize, amountPerRecipient, totalAmount, gasPerBatch } = params;
  const batchCount = recipientCount === 0 ? 0 : Math.ceil(recipientCount / batchSize);
  const gasTokenNeeded = gasPerBatch * BigInt(batchCount);
  const erc20Needed = totalAmount ?? amountPerRecipient * BigInt(recipientCount);
  return { gasTokenNeeded, erc20Needed, batchCount };
}
