import type { LoopErrorEntry } from '@titrate/sdk';
import { createAppendableJSONL } from './appendable-jsonl.js';

export type ErrorsStore = {
  readonly append: (entry: LoopErrorEntry) => Promise<void>;
  readonly readAll: () => Promise<readonly LoopErrorEntry[]>;
  readonly count: () => Promise<number>;
};

/**
 * Append-only store for loop error entries, backed by a JSONL file.
 * Each call to `append` writes one entry as a single JSON line.
 */
export function createErrorsStore(path: string): ErrorsStore {
  const jsonl = createAppendableJSONL<LoopErrorEntry>(path);
  return {
    append: (entry) => jsonl.append([entry]),
    readAll: () => jsonl.readAll(),
    count: () => jsonl.count(),
  };
}
