import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PipelineConfig } from '@titrate/sdk';
import { createPipelineStore } from '../src/pipeline-store.js';

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'titrate-pl-'));
  path = join(dir, 'pipeline.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('PipelineStore', () => {
  it('write+read round-trips', async () => {
    const s = createPipelineStore(path);
    const pipeline: PipelineConfig = {
      steps: [
        { type: 'source', sourceType: 'csv', params: { path: 'addrs.csv' } },
        { type: 'filter', filterType: 'contract-check', params: {} },
      ],
    };
    await s.write(pipeline);
    const r = await s.read();
    expect(r).toEqual(pipeline);
  });

  it('read returns an empty pipeline when file missing', async () => {
    const s = createPipelineStore(path);
    const r = await s.read();
    expect(r.steps).toEqual([]);
  });
});
