import type { Address, Hex } from 'viem';
import type { ScanTokenTransfersOptions, TokenTransfer, ExplorerBus } from './types.js';
import {
  createExplorerTitrateState,
  shouldBisect,
  bisectRange,
  updateLearnedRange,
  getMaxBisectionDepth,
} from './titrate.js';

type RawTokenTransfer = {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
};

function parseTokenTransfer(raw: RawTokenTransfer): TokenTransfer {
  return {
    from: raw.from.toLowerCase() as Address,
    to: raw.to.toLowerCase() as Address,
    value: BigInt(raw.value),
    tokenSymbol: raw.tokenSymbol,
    tokenName: raw.tokenName,
    tokenDecimals: Number(raw.tokenDecimal),
    hash: raw.hash as Hex,
    blockNumber: BigInt(raw.blockNumber),
    timestamp: Number(raw.timeStamp),
  };
}

async function fetchTransferRange(
  bus: ExplorerBus,
  tokenAddress: Address,
  startBlock: bigint,
  endBlock: bigint,
): Promise<RawTokenTransfer[]> {
  return bus.request<RawTokenTransfer[]>({
    module: 'account',
    action: 'tokentx',
    contractaddress: tokenAddress,
    startblock: startBlock.toString(),
    endblock: endBlock.toString(),
    sort: 'asc',
  });
}

export async function* scanTokenTransfers(
  options: ScanTokenTransfersOptions,
): AsyncGenerator<TokenTransfer[]> {
  const {
    bus,
    tokenAddress,
    startBlock = 0n,
    endBlock = 99_999_999n,
    onProgress,
  } = options;

  const state = createExplorerTitrateState();
  let addressesFound = 0;

  async function* scanRange(
    from: bigint,
    to: bigint,
    depth: number,
  ): AsyncGenerator<TokenTransfer[]> {
    if (from > to) return;
    if (depth > getMaxBisectionDepth()) {
      throw new Error(`Explorer bisection depth exceeded (${depth}). Narrow the block range.`);
    }

    const raw = await fetchTransferRange(bus, tokenAddress, from, to);

    if (shouldBisect(raw.length)) {
      const [left, right] = bisectRange(from, to);
      yield* scanRange(left[0], left[1], depth + 1);
      yield* scanRange(right[0], right[1], depth + 1);
      return;
    }

    const rangeSize = to - from + 1n;
    updateLearnedRange(state, rangeSize, raw.length);

    if (raw.length > 0) {
      const parsed = raw.map(parseTokenTransfer);
      addressesFound += parsed.length;
      yield parsed;
    }

    onProgress?.({
      type: 'scan',
      currentBlock: to,
      endBlock,
      addressesFound,
    });
  }

  let cursor = startBlock;
  while (cursor <= endBlock) {
    const chunkEnd =
      state.learnedRange !== null
        ? (cursor + state.learnedRange - 1n > endBlock ? endBlock : cursor + state.learnedRange - 1n)
        : endBlock;
    yield* scanRange(cursor, chunkEnd, 0);
    cursor = chunkEnd + 1n;
  }
}
