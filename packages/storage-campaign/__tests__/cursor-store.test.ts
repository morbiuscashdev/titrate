import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PipelineCursor } from '@titrate/sdk';
import { createCursorStore } from '../src/cursor-store.js';

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'titrate-cur-'));
  path = join(dir, 'cursor.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('CursorStore', () => {
  it('serializes bigints as decimal strings on disk', async () => {
    const s = createCursorStore(path);
    const cursor: PipelineCursor = {
      scan: { lastBlock: 99999999999999n, addressCount: 0 },
      filter: { watermark: 0, qualifiedCount: 0 },
      distribute: { watermark: 0, confirmedCount: 0 },
    };
    await s.write(cursor);
    const raw = await readFile(path, 'utf8');
    expect(raw).toContain('"lastBlock": "99999999999999"');
  });

  it('deserializes bigints back to bigint', async () => {
    const s = createCursorStore(path);
    const cursor: PipelineCursor = {
      scan: { lastBlock: 12345n, addressCount: 5 },
      filter: { watermark: 10, qualifiedCount: 3 },
      distribute: { watermark: 0, confirmedCount: 0 },
    };
    await s.write(cursor);
    const r = await s.read();
    expect(r.scan.lastBlock).toBe(12345n);
    expect(typeof r.scan.lastBlock).toBe('bigint');
  });

  it('read() returns a zero cursor when file missing', async () => {
    const s = createCursorStore(path);
    const r = await s.read();
    expect(r.scan.lastBlock).toBe(0n);
    expect(r.filter.watermark).toBe(0);
  });
});

describe('cursor-store migration', () => {
  it('reads a legacy file that still contains scan.endBlock and strips it', async () => {
    const legacy = {
      scan: { lastBlock: '100', endBlock: '200', addressCount: 50 },
      filter: { watermark: 10, qualifiedCount: 5 },
      distribute: { watermark: 2, confirmedCount: 2 },
    };
    await writeFile(path, JSON.stringify(legacy), 'utf8');

    const store = createCursorStore(path);
    const cursor = await store.read();

    expect(cursor.scan).toEqual({ lastBlock: 100n, addressCount: 50 });
    // @ts-expect-error — endBlock is no longer part of the type
    expect(cursor.scan.endBlock).toBeUndefined();
  });

  it('round-trips a new-format cursor without endBlock', async () => {
    const store = createCursorStore(path);
    await store.write({
      scan: { lastBlock: 42n, addressCount: 10 },
      filter: { watermark: 0, qualifiedCount: 0 },
      distribute: { watermark: 0, confirmedCount: 0 },
    });
    const back = await store.read();
    expect(back.scan.lastBlock).toBe(42n);
    expect(back.scan.addressCount).toBe(10);
  });
});
