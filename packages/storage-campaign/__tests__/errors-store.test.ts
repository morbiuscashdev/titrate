import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createErrorsStore } from '../src/errors-store.js';
import type { LoopErrorEntry } from '@titrate/sdk';

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'titrate-errors-'));
  path = join(dir, 'errors.jsonl');
});

describe('errors-store', () => {
  it('appends a LoopErrorEntry and reads it back', async () => {
    const store = createErrorsStore(path);
    const entry: LoopErrorEntry = {
      timestamp: 1, loop: 'scanner', phase: 'fetch-block', message: 'boom',
    };
    await store.append(entry);
    expect(await store.readAll()).toEqual([entry]);
    await rm(dir, { recursive: true });
  });

  it('stores stack + context when provided', async () => {
    const store = createErrorsStore(path);
    const entry: LoopErrorEntry = {
      timestamp: 1, loop: 'filter', phase: 'apply', message: 'x',
      stack: 'Error: x\n  at foo',
      context: { block: 123, attempt: 2 },
    };
    await store.append(entry);
    const [read] = await store.readAll();
    expect(read.stack).toBe(entry.stack);
    expect(read.context).toEqual(entry.context);
    await rm(dir, { recursive: true });
  });
});
