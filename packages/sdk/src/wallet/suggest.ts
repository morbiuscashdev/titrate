/**
 * Suggests an optimal wallet count for parallel distribution based on
 * recipient count, batch configuration, and block gas constraints.
 */
export function suggestWalletCount(params: {
  readonly recipientCount: number;
  readonly batchSize: number;
  readonly gasPerBatch: bigint;
  readonly blockGasLimit: bigint;
}): { readonly recommended: number; readonly reason: string } {
  const { recipientCount, batchSize, gasPerBatch, blockGasLimit } = params;

  const totalBatches = Math.ceil(recipientCount / batchSize);
  const concurrentBatches = gasPerBatch > 0n
    ? Number(blockGasLimit / gasPerBatch)
    : 1;

  const maxWallets = 10;
  const recommended = Math.max(1, Math.min(totalBatches, concurrentBatches, maxWallets));

  const reason = concurrentBatches < totalBatches && concurrentBatches < maxWallets
    ? `Block gas fits ${concurrentBatches} concurrent batches`
    : totalBatches < maxWallets
      ? `${totalBatches} batches total`
      : `Capped at ${maxWallets} wallets`;

  return { recommended, reason };
}
