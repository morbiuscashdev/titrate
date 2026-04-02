// packages/sdk/src/trueblocks/appearances.ts
import type { Address } from 'viem';
import type { GetAppearancesOptions, Appearance } from './types.js';

type RawAppearance = {
  address: string;
  blockNumber: number;
  transactionIndex: number;
};

function parseAppearance(raw: RawAppearance): Appearance {
  return {
    address: raw.address.toLowerCase() as Address,
    blockNumber: BigInt(raw.blockNumber),
    transactionIndex: raw.transactionIndex,
  };
}

/**
 * Lists every transaction where the given addresses appeared — at any trace depth.
 * This is TrueBlocks' unique capability: it knows every place an address shows up,
 * not just as sender/receiver but in any internal call.
 */
export async function* getAppearances(
  options: GetAppearancesOptions,
): AsyncGenerator<Appearance[]> {
  const { client, addresses, firstBlock, lastBlock, onProgress } = options;

  const params: Record<string, string> = {
    addrs: addresses.join(','),
  };
  if (firstBlock !== undefined) params.firstBlock = firstBlock.toString();
  if (lastBlock !== undefined) params.lastBlock = lastBlock.toString();

  let totalFound = 0;

  for await (const page of client.requestPaginated<RawAppearance>('/list', params)) {
    if (page.length === 0) continue;

    const parsed = page.map(parseAppearance);
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
