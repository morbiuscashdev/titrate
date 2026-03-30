import type { Address, PublicClient } from 'viem';
import type { SourceType, ProgressCallback } from '../types.js';
import { scanBlocks, type ScanOptions } from '../scanner/blocks.js';

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
