import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createIDBStorage } from '../index.js';
import type { Storage } from '@titrate/sdk';

describe('AppSettingsStore', () => {
  let storage: Storage;

  beforeEach(async () => {
    storage = await createIDBStorage(`test-${Math.random()}`);
  });

  it('put and get roundtrip', async () => {
    await storage.appSettings.put('theme', 'dark');
    expect(await storage.appSettings.get('theme')).toBe('dark');
  });

  it('returns null for missing key', async () => {
    expect(await storage.appSettings.get('missing')).toBeNull();
  });

  it('delete removes setting', async () => {
    await storage.appSettings.put('theme', 'dark');
    await storage.appSettings.delete('theme');
    expect(await storage.appSettings.get('theme')).toBeNull();
  });

  it('overwrites existing value', async () => {
    await storage.appSettings.put('theme', 'dark');
    await storage.appSettings.put('theme', 'light');
    expect(await storage.appSettings.get('theme')).toBe('light');
  });
});
