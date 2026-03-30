import type { PublicClient, Address } from 'viem';
import { parseAbiItem } from 'viem';
import type { ProgressCallback } from '../types.js';
import { createTitrateState, adjustRange, shrinkRange, isQuerySizeError } from './titrate-range.js';
import type { BlockRange } from './blocks.js';

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

export type ScanTransferOptions = BlockRange & {
  readonly onProgress?: ProgressCallback;
};

/**
 * Async generator that scans a token's Transfer events over a block range.
 * Uses dynamic titration to automatically adjust the query window size.
 * Yields batches of recipient addresses (the `to` field of each Transfer).
 */
export async function* scanTransferEvents(
  rpc: PublicClient,
  token: Address,
  options: ScanTransferOptions,
): AsyncGenerator<Address[]> {
  const { startBlock, endBlock } = options;
  const state = createTitrateState(1_000n);
  let fromBlock = startBlock;
  let addressesFound = 0;

  while (fromBlock <= endBlock) {
    const toBlock =
      fromBlock + state.blockRange - 1n > endBlock
        ? endBlock
        : fromBlock + state.blockRange - 1n;

    try {
      const t0 = Date.now();
      const logs = await rpc.getLogs({
        address: token,
        event: TRANSFER_EVENT,
        fromBlock,
        toBlock,
      });
      const elapsed = Date.now() - t0;

      const addresses: Address[] = [];
      for (const log of logs) {
        if (log.args.to) {
          addresses.push(log.args.to.toLowerCase() as Address);
        }
      }

      addressesFound += addresses.length;
      options.onProgress?.({
        type: 'scan',
        currentBlock: toBlock,
        endBlock,
        addressesFound,
      });

      if (addresses.length > 0) yield addresses;

      fromBlock = toBlock + 1n;
      adjustRange(state, elapsed);
    } catch (err) {
      if (isQuerySizeError(err)) {
        shrinkRange(state);
        continue;
      }
      throw err;
    }
  }
}
