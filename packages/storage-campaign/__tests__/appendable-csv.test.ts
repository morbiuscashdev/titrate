import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppendableCSV, type CSVRow } from '../src/appendable-csv.js';

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'titrate-csv-'));
  path = join(dir, 'addresses.csv');
});

describe('AppendableCSV', () => {
  it('appends rows and persists them with a newline per row', async () => {
    const csv = createAppendableCSV(path);
    await csv.append([
      { address: '0x1', amount: '100' },
      { address: '0x2', amount: null },
    ]);
    const raw = await readFile(path, 'utf8');
    expect(raw).toBe('0x1,100\n0x2,\n');
    await rm(dir, { recursive: true });
  });

  it('count() returns total line count', async () => {
    const csv = createAppendableCSV(path);
    await csv.append([
      { address: '0x1', amount: null },
      { address: '0x2', amount: null },
      { address: '0x3', amount: null },
    ]);
    expect(await csv.count()).toBe(3);
    await rm(dir, { recursive: true });
  });

  it('count() returns 0 for a missing file', async () => {
    const csv = createAppendableCSV(path);
    expect(await csv.count()).toBe(0);
    await rm(dir, { recursive: true });
  });

  it('readFrom(offset) streams rows starting at the given line number', async () => {
    const csv = createAppendableCSV(path);
    await csv.append([
      { address: '0xa', amount: null },
      { address: '0xb', amount: null },
      { address: '0xc', amount: null },
    ]);
    const rows: CSVRow[] = [];
    for await (const row of csv.readFrom(1)) rows.push(row);
    expect(rows.map((r) => r.address)).toEqual(['0xb', '0xc']);
    await rm(dir, { recursive: true });
  });

  it('handles empty-amount rows correctly on readFrom', async () => {
    const csv = createAppendableCSV(path);
    await csv.append([{ address: '0xa', amount: null }]);
    const rows: CSVRow[] = [];
    for await (const row of csv.readFrom(0)) rows.push(row);
    expect(rows[0]).toEqual({ address: '0xa', amount: null });
    await rm(dir, { recursive: true });
  });

  it('append with zero rows is a no-op', async () => {
    const csv = createAppendableCSV(path);
    await csv.append([]);
    expect(await csv.count()).toBe(0);
    await rm(dir, { recursive: true });
  });

  it('handles a large batch (10k rows) without truncation', async () => {
    const csv = createAppendableCSV(path);
    const rows: CSVRow[] = Array.from({ length: 10_000 }, (_, i) => ({
      address: `0x${i.toString(16).padStart(40, '0')}`,
      amount: null,
    }));
    await csv.append(rows);
    expect(await csv.count()).toBe(10_000);
    await rm(dir, { recursive: true });
  });
});
