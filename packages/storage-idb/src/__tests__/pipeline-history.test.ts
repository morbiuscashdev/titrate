import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { createIDBStorage } from '../index.js';
import type { PipelineHistoryEntry } from '@titrate/sdk';

describe('IDB pipeline-history', () => {
  it('appends and reads entries in insertion order', async () => {
    const storage = await createIDBStorage(`test-history-${Math.random()}`);
    const e1: PipelineHistoryEntry = {
      timestamp: 1, kind: 'initial', prior: null, next: [],
      watermarkBefore: 0, watermarkAfter: 0,
      qualifiedCountBefore: 0, qualifiedCountAfter: 0,
      source: 'ui',
    };
    const e2: PipelineHistoryEntry = { ...e1, timestamp: 2, kind: 'add' };

    await storage.pipelineHistory.append('camp-1', e1);
    await storage.pipelineHistory.append('camp-1', e2);

    const all = await storage.pipelineHistory.readAll('camp-1');
    expect(all.length).toBe(2);
    expect(all[0].kind).toBe('initial');
    expect(all[1].kind).toBe('add');
  });

  it('scopes entries by campaignId', async () => {
    const storage = await createIDBStorage(`test-history-${Math.random()}`);
    const e: PipelineHistoryEntry = {
      timestamp: 1, kind: 'initial', prior: null, next: [],
      watermarkBefore: 0, watermarkAfter: 0,
      qualifiedCountBefore: 0, qualifiedCountAfter: 0,
      source: 'ui',
    };
    await storage.pipelineHistory.append('a', e);
    await storage.pipelineHistory.append('b', { ...e, timestamp: 99 });

    const a = await storage.pipelineHistory.readAll('a');
    expect(a).toHaveLength(1);
    expect(a[0].timestamp).toBe(1);
  });
});
