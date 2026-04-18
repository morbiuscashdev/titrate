import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Address } from 'viem';
import { retroactiveReapply } from '../../pipeline/loops/retroactive.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'titrate-retro-'));
});

describe('retroactiveReapply', () => {
  it('writes the new filtered.csv atomically, keeping only rows that pass the new filter', async () => {
    const path = join(dir, 'filtered.csv');
    await writeFile(path, ['0x1,', '0x2,', '0x3,', '0x4,'].join('\n') + '\n', 'utf8');

    const allow = new Set<Address>(['0x2', '0x4'] as Address[]);
    const result = await retroactiveReapply({
      filteredPath: path,
      predicate: (addr) => Promise.resolve(allow.has(addr)),
    });

    expect(result.survivorsCount).toBe(2);
    expect(result.droppedCount).toBe(2);

    const content = await readFile(path, 'utf8');
    expect(content).toBe('0x2,\n0x4,\n');
    await rm(dir, { recursive: true });
  });

  it('writes to .tmp and renames — the real file is never partially written', async () => {
    const path = join(dir, 'filtered.csv');
    const tmp = `${path}.tmp`;
    await writeFile(path, '0x1,\n', 'utf8');

    await retroactiveReapply({
      filteredPath: path,
      predicate: async (addr) => {
        await new Promise((r) => setTimeout(r, 2));
        return addr === '0x1';
      },
    });

    await expect(readFile(tmp, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(path, 'utf8')).toBe('0x1,\n');
    await rm(dir, { recursive: true });
  });

  it('no-ops cleanly on an empty filtered.csv', async () => {
    const path = join(dir, 'filtered.csv');
    await writeFile(path, '', 'utf8');

    const result = await retroactiveReapply({
      filteredPath: path,
      predicate: () => Promise.resolve(true),
    });

    expect(result.survivorsCount).toBe(0);
    expect(result.droppedCount).toBe(0);
    await rm(dir, { recursive: true });
  });
});
