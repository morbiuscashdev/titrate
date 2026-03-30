import type { PublicClient, Address } from 'viem';
import type { ProgressCallback } from '../types.js';
import { withRetry } from '../utils/retry.js';

export type BlockRange = {
  readonly startBlock: bigint;
  readonly endBlock: bigint;
};

export type ScanOptions = BlockRange & {
  readonly extract: 'tx.from' | 'tx.to';
  readonly batchSize?: number;
  readonly onProgress?: ProgressCallback;
};

/**
 * Async generator that scans a range of blocks and yields batches of addresses.
 * Extracts either the `from` or `to` address of each transaction.
 */
export async function* scanBlocks(
  rpc: PublicClient,
  options: ScanOptions,
): AsyncGenerator<Address[]> {
  const { startBlock, endBlock, extract, batchSize = 100 } = options;
  let current = startBlock;
  let addressesFound = 0;

  while (current <= endBlock) {
    const batchEnd =
      current + BigInt(batchSize) - 1n > endBlock
        ? endBlock
        : current + BigInt(batchSize) - 1n;

    const addresses: Address[] = [];

    for (let blockNum = current; blockNum <= batchEnd; blockNum++) {
      const block = await withRetry(
        () => rpc.getBlock({ blockNumber: blockNum, includeTransactions: true }),
        `Block ${blockNum}`,
        { maxRetries: 5, baseDelay: 500 },
      );

      for (const tx of block.transactions) {
        if (typeof tx === 'string') continue;
        const addr = extract === 'tx.from' ? tx.from : tx.to;
        if (addr) addresses.push(addr.toLowerCase() as Address);
      }
    }

    addressesFound += addresses.length;
    options.onProgress?.({
      type: 'scan',
      currentBlock: batchEnd,
      endBlock,
      addressesFound,
    });

    if (addresses.length > 0) yield addresses;
    current = batchEnd + 1n;
  }
}

/**
 * Binary-searches the chain to find the block number closest to the given Unix timestamp.
 * Returns the latest block number if the timestamp is in the future.
 */
export async function resolveBlockByTimestamp(
  rpc: PublicClient,
  timestamp: number,
): Promise<bigint> {
  const latest = await rpc.getBlock({ blockTag: 'latest' });
  const latestTimestamp = Number(latest.timestamp);

  if (timestamp >= latestTimestamp) return latest.number;

  let low = 0n;
  let high = latest.number;

  while (low < high) {
    const mid = (low + high) / 2n;
    const block = await withRetry(
      () => rpc.getBlock({ blockNumber: mid }),
      `Block timestamp ${mid}`,
      { maxRetries: 3, baseDelay: 200 },
    );
    if (Number(block.timestamp) < timestamp) {
      low = mid + 1n;
    } else {
      high = mid;
    }
  }

  return low;
}
