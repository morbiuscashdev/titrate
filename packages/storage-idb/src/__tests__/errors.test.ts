import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { createIDBStorage } from '../index.js';
import type { LoopErrorEntry } from '@titrate/sdk';

describe('IDB errors', () => {
  it('appends and reads errors scoped by campaignId', async () => {
    const storage = await createIDBStorage(`test-errors-${Math.random()}`);
    const e: LoopErrorEntry = { timestamp: 1, loop: 'scanner', phase: 'p', message: 'm' };

    await storage.errors.append('camp', e);
    expect(await storage.errors.readAll('camp')).toEqual([e]);
  });
});
