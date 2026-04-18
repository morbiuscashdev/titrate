import { createReadStream } from 'node:fs';
import { open, rename, stat, unlink } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import type { Address } from 'viem';

export type RetroactiveInput = {
  readonly filteredPath: string;
  readonly predicate: (addr: Address) => Promise<boolean>;
};

export type RetroactiveResult = {
  readonly survivorsCount: number;
  readonly droppedCount: number;
};

export async function retroactiveReapply(input: RetroactiveInput): Promise<RetroactiveResult> {
  const { filteredPath, predicate } = input;
  const tmpPath = `${filteredPath}.tmp`;

  const s = await stat(filteredPath).catch((err) => {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  });
  if (s === null || s.size === 0) {
    await unlink(tmpPath).catch(() => {});
    return { survivorsCount: 0, droppedCount: 0 };
  }

  const handle = await open(tmpPath, 'w');
  let survivors = 0;
  let dropped = 0;
  try {
    const stream = createReadStream(filteredPath, { encoding: 'utf8' });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
      if (line.length === 0) continue;
      const commaIdx = line.indexOf(',');
      const addr = (commaIdx === -1 ? line : line.slice(0, commaIdx)) as Address;
      const keep = await predicate(addr);
      if (keep) {
        await handle.write(`${line}\n`);
        survivors++;
      } else {
        dropped++;
      }
    }
    await handle.sync();
  } finally {
    await handle.close();
  }

  await rename(tmpPath, filteredPath);
  return { survivorsCount: survivors, droppedCount: dropped };
}
