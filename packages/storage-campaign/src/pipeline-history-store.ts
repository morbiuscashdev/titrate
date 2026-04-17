import type { PipelineHistoryEntry } from '@titrate/sdk';
import { createAppendableJSONL } from './appendable-jsonl.js';

export type PipelineHistoryStore = {
  readonly append: (entry: PipelineHistoryEntry) => Promise<void>;
  readonly readAll: () => Promise<readonly PipelineHistoryEntry[]>;
  readonly readFrom: (offset: number) => AsyncIterable<PipelineHistoryEntry>;
  readonly count: () => Promise<number>;
};

/**
 * Append-only store for pipeline history entries, backed by a JSONL file.
 * Each call to `append` writes one entry as a single JSON line.
 */
export function createPipelineHistoryStore(path: string): PipelineHistoryStore {
  const jsonl = createAppendableJSONL<PipelineHistoryEntry>(path);
  return {
    append: (entry) => jsonl.append([entry]),
    readAll: () => jsonl.readAll(),
    readFrom: (offset) => jsonl.readFrom(offset),
    count: () => jsonl.count(),
  };
}
