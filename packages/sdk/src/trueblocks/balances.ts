// packages/sdk/src/trueblocks/balances.ts
import type { Address } from 'viem';
import type { GetBalanceHistoryOptions, BalanceChange } from './types.js';

type RawBalanceChange = {
  address: string;
  blockNumber: number;
  transactionIndex: number;
};

function parseBalanceChange(raw: RawBalanceChange): BalanceChange {
  return {
    address: raw.address.toLowerCase() as Address,
    blockNumber: BigInt(raw.blockNumber),
    transactionIndex: raw.transactionIndex,
  };
}

/**
 * Queries which blocks an address's balance changed at.
 * Does NOT return actual balances — returns block numbers where changes occurred.
 * The caller queries the RPC at those blocks for actual values.
 */
export async function* getBalanceHistory(
  options: GetBalanceHistoryOptions,
): AsyncGenerator<BalanceChange[]> {
  const { client, addresses, asset, firstBlock, lastBlock, onProgress } = options;

  const params: Record<string, string> = {
    addrs: addresses.join(','),
    balances: 'true',
    changes: 'true',
  };
  if (asset) params.asset = asset;
  if (firstBlock !== undefined) params.firstBlock = firstBlock.toString();
  if (lastBlock !== undefined) params.lastBlock = lastBlock.toString();

  let totalFound = 0;

  for await (const page of client.requestPaginated<RawBalanceChange>('/export', params)) {
    if (page.length === 0) continue;

    const parsed = page.map(parseBalanceChange);
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
