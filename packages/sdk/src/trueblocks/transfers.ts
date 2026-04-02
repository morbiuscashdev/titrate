// packages/sdk/src/trueblocks/transfers.ts
import type { Address, Hex } from 'viem';
import type { GetTransfersOptions, TrueBlocksTransfer } from './types.js';

type RawTransfer = {
  from: string;
  to: string;
  value: string;
  asset: string;
  blockNumber: number;
  transactionIndex: number;
  hash: string;
  timestamp: number;
};

function parseTransfer(raw: RawTransfer): TrueBlocksTransfer {
  return {
    from: raw.from.toLowerCase() as Address,
    to: raw.to.toLowerCase() as Address,
    value: BigInt(raw.value),
    asset: raw.asset,
    blockNumber: BigInt(raw.blockNumber),
    transactionIndex: raw.transactionIndex,
    hash: raw.hash as Hex,
    timestamp: raw.timestamp,
  };
}

/**
 * Exports token transfer events for addresses via TrueBlocks.
 * No result caps — TrueBlocks returns the full history.
 * Optional asset filter for specific token address.
 */
export async function* getTransfers(
  options: GetTransfersOptions,
): AsyncGenerator<TrueBlocksTransfer[]> {
  const { client, addresses, asset, firstBlock, lastBlock, onProgress } = options;

  const params: Record<string, string> = {
    addrs: addresses.join(','),
    accounting: 'true',
  };
  if (asset) params.asset = asset;
  if (firstBlock !== undefined) params.firstBlock = firstBlock.toString();
  if (lastBlock !== undefined) params.lastBlock = lastBlock.toString();

  let totalFound = 0;

  for await (const page of client.requestPaginated<RawTransfer>('/export', params)) {
    if (page.length === 0) continue;

    const parsed = page.map(parseTransfer);
    totalFound += parsed.length;

    onProgress?.({
      type: 'scan',
      currentBlock: parsed[parsed.length - 1].blockNumber,
      endBlock: lastBlock ?? 0n,
      addressesFound: totalFound,
    });

    yield parsed;
  }
}
