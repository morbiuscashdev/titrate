import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppendableJSONL } from '../src/appendable-jsonl.js';

type Record = { readonly a: number; readonly b: string };

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'titrate-jsonl-'));
  path = join(dir, 'records.jsonl');
});

describe('AppendableJSONL', () => {
  it('appends records as one JSON per line', async () => {
    const jsonl = createAppendableJSONL<Record>(path);
    await jsonl.append([
      { a: 1, b: 'one' },
      { a: 2, b: 'two' },
    ]);
    const raw = await readFile(path, 'utf8');
    expect(raw).toBe('{"a":1,"b":"one"}\n{"a":2,"b":"two"}\n');
    await rm(dir, { recursive: true });
  });

  it('readAll returns all records', async () => {
    const jsonl = createAppendableJSONL<Record>(path);
    await jsonl.append([{ a: 1, b: 'one' }, { a: 2, b: 'two' }]);
    const all = await jsonl.readAll();
    expect(all).toEqual([
      { a: 1, b: 'one' },
      { a: 2, b: 'two' },
    ]);
    await rm(dir, { recursive: true });
  });

  it('readFrom(offset) skips the first N records', async () => {
    const jsonl = createAppendableJSONL<Record>(path);
    await jsonl.append([
      { a: 1, b: 'one' },
      { a: 2, b: 'two' },
      { a: 3, b: 'three' },
    ]);
    const rows: Record[] = [];
    for await (const r of jsonl.readFrom(1)) rows.push(r);
    expect(rows).toEqual([
      { a: 2, b: 'two' },
      { a: 3, b: 'three' },
    ]);
    await rm(dir, { recursive: true });
  });

  it('count() returns 0 when file missing', async () => {
    const jsonl = createAppendableJSONL<Record>(path);
    expect(await jsonl.count()).toBe(0);
    await rm(dir, { recursive: true });
  });

  it('count() returns number of records', async () => {
    const jsonl = createAppendableJSONL<Record>(path);
    await jsonl.append([{ a: 1, b: 'x' }, { a: 2, b: 'y' }]);
    expect(await jsonl.count()).toBe(2);
    await rm(dir, { recursive: true });
  });
});
