// packages/sdk/src/trueblocks/traces.ts
import type { Address, Hex } from 'viem';
import type { GetTracesOptions, TrueBlocksTrace } from './types.js';

type RawTrace = {
  from: string;
  to: string;
  value: string;
  hash: string;
  blockNumber: number;
  type: string;
  traceAddress: string;
};

function parseTrace(raw: RawTrace): TrueBlocksTrace {
  const depth = raw.traceAddress ? raw.traceAddress.split('.').length : 0;
  return {
    from: raw.from.toLowerCase() as Address,
    to: raw.to.toLowerCase() as Address,
    value: BigInt(raw.value),
    hash: raw.hash as Hex,
    blockNumber: BigInt(raw.blockNumber),
    traceType: raw.type,
    depth,
  };
}

/**
 * Exports internal call traces for addresses via TrueBlocks.
 * Traces show contract-to-contract interactions at any depth.
 */
export async function* getTraces(
  options: GetTracesOptions,
): AsyncGenerator<TrueBlocksTrace[]> {
  const { client, addresses, firstBlock, lastBlock, onProgress } = options;

  const params: Record<string, string> = {
    addrs: addresses.join(','),
    traces: 'true',
  };
  if (firstBlock !== undefined) params.firstBlock = firstBlock.toString();
  if (lastBlock !== undefined) params.lastBlock = lastBlock.toString();

  let totalFound = 0;

  for await (const page of client.requestPaginated<RawTrace>('/export', params)) {
    if (page.length === 0) continue;

    const parsed = page.map(parseTrace);
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
