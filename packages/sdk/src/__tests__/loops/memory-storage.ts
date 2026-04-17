import type { PipelineCursor, LoopErrorEntry } from '../../types.js';
import type { BatchRecord } from '../../storage/index.js';

export type MemoryRow = { readonly address: string; readonly amount: string | null };

export function createMemoryAddresses(): {
  append: (rows: readonly MemoryRow[]) => Promise<void>;
  readFrom: (offset: number) => AsyncIterable<MemoryRow>;
  count: () => Promise<number>;
} {
  const data: MemoryRow[] = [];
  return {
    async append(rows) {
      data.push(...rows);
    },
    async count() {
      return data.length;
    },
    readFrom(offset) {
      async function* gen() {
        for (let i = offset; i < data.length; i++) yield data[i];
      }
      return gen();
    },
  };
}

export function createMemoryCursor(initial?: PipelineCursor) {
  let current: PipelineCursor = initial ?? {
    scan: { lastBlock: 0n, addressCount: 0 },
    filter: { watermark: 0, qualifiedCount: 0 },
    distribute: { watermark: 0, confirmedCount: 0 },
  };
  return {
    async read() {
      return current;
    },
    async update(patch: Partial<PipelineCursor>) {
      current = {
        scan: { ...current.scan, ...(patch.scan ?? {}) },
        filter: { ...current.filter, ...(patch.filter ?? {}) },
        distribute: { ...current.distribute, ...(patch.distribute ?? {}) },
      };
    },
  };
}

export function createMemoryBatches() {
  const data: BatchRecord[] = [];
  return {
    async append(records: readonly BatchRecord[]) {
      data.push(...records);
    },
    async readAll(): Promise<readonly BatchRecord[]> {
      return data;
    },
    async count() {
      return data.length;
    },
  };
}

export function createMemoryErrors() {
  const data: LoopErrorEntry[] = [];
  return {
    async append(entry: LoopErrorEntry) {
      data.push(entry);
    },
    async readAll(): Promise<readonly LoopErrorEntry[]> {
      return data;
    },
  };
}
