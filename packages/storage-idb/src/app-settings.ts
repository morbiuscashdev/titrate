import type { AppSettingsStore } from '@titrate/sdk';
import type { TitrateDB } from './db.js';

const STORE = 'appSettings';

/**
 * Creates an AppSettingsStore backed by the 'appSettings' object store in IDB.
 * Each entry is stored as `{ key, value }` with `key` as the keyPath.
 *
 * @param db - Open TitrateDB handle
 * @returns AppSettingsStore implementation
 */
export function createAppSettingsStore(db: TitrateDB): AppSettingsStore {
  async function get(key: string): Promise<string | null> {
    const result = await db.get(STORE, key);
    return (result as { key: string; value: string } | undefined)?.value ?? null;
  }

  async function put(key: string, value: string): Promise<void> {
    await db.put(STORE, { key, value });
  }

  async function deleteByKey(key: string): Promise<void> {
    await db.delete(STORE, key);
  }

  return { get, put, delete: deleteByKey };
}
