import type { Address, Hex } from 'viem';
import type { ScanTransactionsOptions, Transaction, InternalTransaction, ExplorerBus } from './types.js';
import {
  createExplorerTitrateState,
  shouldBisect,
  bisectRange,
  updateLearnedRange,
  getMaxBisectionDepth,
} from './titrate.js';

type RawTransaction = {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  isError: string;
  gasUsed: string;
};

type RawInternalTransaction = {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  type: string;
};

function parseTransaction(raw: RawTransaction): Transaction {
  return {
    from: raw.from.toLowerCase() as Address,
    to: raw.to ? (raw.to.toLowerCase() as Address) : null,
    value: BigInt(raw.value),
    hash: raw.hash as Hex,
    blockNumber: BigInt(raw.blockNumber),
    timestamp: Number(raw.timeStamp),
    isError: raw.isError === '1',
    gasUsed: BigInt(raw.gasUsed),
  };
}

function parseInternalTransaction(raw: RawInternalTransaction): InternalTransaction {
  return {
    from: raw.from.toLowerCase() as Address,
    to: raw.to.toLowerCase() as Address,
    value: BigInt(raw.value),
    hash: raw.hash as Hex,
    blockNumber: BigInt(raw.blockNumber),
    type: raw.type,
  };
}

// Shared bisection scanner — DRY across both transaction types
async function* scanWithBisection<TRaw, TParsed>(
  bus: ExplorerBus,
  action: string,
  addressParam: Record<string, string>,
  startBlock: bigint,
  endBlock: bigint,
  parse: (raw: TRaw) => TParsed,
  onProgress?: ScanTransactionsOptions['onProgress'],
): AsyncGenerator<TParsed[]> {
  const state = createExplorerTitrateState();
  let itemsFound = 0;

  async function* scanRange(from: bigint, to: bigint, depth: number): AsyncGenerator<TParsed[]> {
    if (from > to) return;
    if (depth > getMaxBisectionDepth()) {
      throw new Error(`Explorer bisection depth exceeded (${depth}). Narrow the block range.`);
    }

    const raw = await bus.request<TRaw[]>({
      module: 'account',
      action,
      ...addressParam,
      startblock: from.toString(),
      endblock: to.toString(),
      sort: 'asc',
    });

    if (shouldBisect(raw.length)) {
      const [left, right] = bisectRange(from, to);
      yield* scanRange(left[0], left[1], depth + 1);
      yield* scanRange(right[0], right[1], depth + 1);
      return;
    }

    updateLearnedRange(state, to - from + 1n, raw.length);

    if (raw.length > 0) {
      const parsed = raw.map(parse);
      itemsFound += parsed.length;
      yield parsed;
    }

    onProgress?.({
      type: 'scan',
      currentBlock: to,
      endBlock,
      addressesFound: itemsFound,
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

export async function* scanTransactions(
  options: ScanTransactionsOptions,
): AsyncGenerator<Transaction[]> {
  const { bus, address, startBlock = 0n, endBlock = 99_999_999n, onProgress } = options;
  yield* scanWithBisection<RawTransaction, Transaction>(
    bus, 'txlist', { address }, startBlock, endBlock, parseTransaction, onProgress,
  );
}

export async function* scanInternalTransactions(
  options: ScanTransactionsOptions,
): AsyncGenerator<InternalTransaction[]> {
  const { bus, address, startBlock = 0n, endBlock = 99_999_999n, onProgress } = options;
  yield* scanWithBisection<RawInternalTransaction, InternalTransaction>(
    bus, 'txlistinternal', { address }, startBlock, endBlock, parseInternalTransaction, onProgress,
  );
}
