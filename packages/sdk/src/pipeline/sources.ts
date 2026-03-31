import type { Address, PublicClient } from 'viem';
import type { SourceType, ProgressCallback } from '../types.js';
import { scanBlocks, type ScanOptions } from '../scanner/blocks.js';
import { getOrCreateBus } from '../explorer/bus.js';
import { scanTokenTransfers } from '../explorer/transfers.js';

export type SourceParams = Record<string, unknown>;

export type SourceExecutor = (
  rpc?: PublicClient,
  onProgress?: ProgressCallback,
) => AsyncGenerator<Address[]>;

/** Factory that maps a source type to its async generator executor. */
export function createSource(sourceType: SourceType, params: SourceParams): SourceExecutor {
  switch (sourceType) {
    case 'csv':
      return csvSource(params);
    case 'block-scan':
      return blockScanSource(params);
    case 'union':
      return unionSource(params);
    case 'explorer-scan':
      return explorerScanSource(params);
    default:
      throw new Error(`Unknown source type: ${sourceType}`);
  }
}

function csvSource(params: SourceParams): SourceExecutor {
  const rawAddresses = params.addresses as string[];
  const seen = new Set<string>();
  const deduped: Address[] = [];

  for (const addr of rawAddresses) {
    const lower = addr.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    deduped.push(lower as Address);
  }

  return async function* () {
    yield deduped;
  };
}

function blockScanSource(params: SourceParams): SourceExecutor {
  return async function* (rpc, onProgress) {
    if (!rpc) throw new Error('block-scan source requires an RPC client');

    const scanOptions: ScanOptions = {
      startBlock: BigInt(params.startBlock as string | number),
      endBlock: BigInt(params.endBlock as string | number),
      extract: (params.extract as 'tx.from' | 'tx.to') ?? 'tx.from',
      batchSize: (params.batchSize as number) ?? 100,
      onProgress,
    };

    yield* scanBlocks(rpc, scanOptions);
  };
}

function unionSource(params: SourceParams): SourceExecutor {
  const sources = params.sources as Array<{ type: SourceType; params: SourceParams }>;

  return async function* (rpc, onProgress) {
    for (const s of sources) {
      const executor = createSource(s.type, s.params);
      yield* executor(rpc, onProgress);
    }
  };
}

function explorerScanSource(params: SourceParams): SourceExecutor {
  return async function* (_rpc, onProgress) {
    const explorerApiUrl = params.explorerApiUrl as string;
    const apiKey = params.apiKey as string;
    const tokenAddress = (params.tokenAddress as string).toLowerCase() as Address;
    const extract = (params.extract as 'from' | 'to') ?? 'to';
    const startBlock = params.startBlock ? BigInt(params.startBlock as string | number) : undefined;
    const endBlock = params.endBlock ? BigInt(params.endBlock as string | number) : undefined;

    const bus = getOrCreateBus(explorerApiUrl, apiKey);
    const seen = new Set<string>();
    const batch: Address[] = [];

    for await (const transfers of scanTokenTransfers({
      bus,
      tokenAddress,
      startBlock,
      endBlock,
      onProgress,
    })) {
      for (const t of transfers) {
        const addr = (extract === 'from' ? t.from : t.to).toLowerCase();
        if (seen.has(addr)) continue;
        seen.add(addr);
        batch.push(addr as Address);
      }
    }

    if (batch.length > 0) yield batch;
  };
}
