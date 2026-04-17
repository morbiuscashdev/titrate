import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
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
      scan: { lastBlock: 99999999999999n, endBlock: null, addressCount: 0 },
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
      scan: { lastBlock: 12345n, endBlock: 67890n, addressCount: 5 },
      filter: { watermark: 10, qualifiedCount: 3 },
      distribute: { watermark: 0, confirmedCount: 0 },
    };
    await s.write(cursor);
    const r = await s.read();
    expect(r.scan.lastBlock).toBe(12345n);
    expect(r.scan.endBlock).toBe(67890n);
    expect(typeof r.scan.lastBlock).toBe('bigint');
  });

  it('read() returns a zero cursor when file missing', async () => {
    const s = createCursorStore(path);
    const r = await s.read();
    expect(r.scan.lastBlock).toBe(0n);
    expect(r.scan.endBlock).toBeNull();
    expect(r.filter.watermark).toBe(0);
  });
});
