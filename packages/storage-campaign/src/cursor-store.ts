import { readFile, writeFile } from 'node:fs/promises';
import type { PipelineCursor } from '@titrate/sdk';

export type CursorStore = {
  readonly read: () => Promise<PipelineCursor>;
  readonly write: (cursor: PipelineCursor) => Promise<void>;
  readonly update: (patch: Partial<PipelineCursor>) => Promise<void>;
};

type CursorOnDisk = {
  readonly scan: {
    readonly lastBlock: string;
    readonly endBlock: string | null;
    readonly addressCount: number;
  };
  readonly filter: { readonly watermark: number; readonly qualifiedCount: number };
  readonly distribute: { readonly watermark: number; readonly confirmedCount: number };
};

const ZERO_CURSOR: PipelineCursor = {
  scan: { lastBlock: 0n, endBlock: null, addressCount: 0 },
  filter: { watermark: 0, qualifiedCount: 0 },
  distribute: { watermark: 0, confirmedCount: 0 },
};

function toDisk(c: PipelineCursor): CursorOnDisk {
  return {
    scan: {
      lastBlock: c.scan.lastBlock.toString(),
      endBlock: c.scan.endBlock === null ? null : c.scan.endBlock.toString(),
      addressCount: c.scan.addressCount,
    },
    filter: c.filter,
    distribute: c.distribute,
  };
}

function fromDisk(d: CursorOnDisk): PipelineCursor {
  return {
    scan: {
      lastBlock: BigInt(d.scan.lastBlock),
      endBlock: d.scan.endBlock === null ? null : BigInt(d.scan.endBlock),
      addressCount: d.scan.addressCount,
    },
    filter: d.filter,
    distribute: d.distribute,
  };
}

export function createCursorStore(path: string): CursorStore {
  return {
    async read() {
      try {
        const raw = await readFile(path, 'utf8');
        return fromDisk(JSON.parse(raw) as CursorOnDisk);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return ZERO_CURSOR;
        throw err;
      }
    },

    async write(cursor) {
      await writeFile(path, JSON.stringify(toDisk(cursor), null, 2), 'utf8');
    },

    async update(patch) {
      const current = await this.read();
      const next: PipelineCursor = {
        scan: { ...current.scan, ...(patch.scan ?? {}) },
        filter: { ...current.filter, ...(patch.filter ?? {}) },
        distribute: { ...current.distribute, ...(patch.distribute ?? {}) },
      };
      await this.write(next);
    },
  };
}
