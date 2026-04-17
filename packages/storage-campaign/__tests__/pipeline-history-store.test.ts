import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPipelineHistoryStore } from '../src/pipeline-history-store.js';
import type { PipelineHistoryEntry } from '@titrate/sdk';

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'titrate-history-'));
  path = join(dir, 'pipeline-history.jsonl');
});

const entry: PipelineHistoryEntry = {
  timestamp: 1,
  kind: 'initial',
  prior: null,
  next: [],
  watermarkBefore: 0,
  watermarkAfter: 0,
  qualifiedCountBefore: 0,
  qualifiedCountAfter: 0,
  source: 'ui',
};

describe('pipeline-history-store', () => {
  it('appends a single entry and reads it back via readAll', async () => {
    const s = createPipelineHistoryStore(path);
    await s.append(entry);
    const all = await s.readAll();
    expect(all).toEqual([entry]);
    await rm(dir, { recursive: true });
  });

  it('appends multiple entries preserving order', async () => {
    const s = createPipelineHistoryStore(path);
    await s.append(entry);
    await s.append({ ...entry, timestamp: 2, kind: 'add' });
    const all = await s.readAll();
    expect(all.length).toBe(2);
    expect(all[1].kind).toBe('add');
    await rm(dir, { recursive: true });
  });

  it('count returns 0 on missing file', async () => {
    const s = createPipelineHistoryStore(path);
    expect(await s.count()).toBe(0);
    await rm(dir, { recursive: true });
  });
});
