import { readFile, writeFile, unlink, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { CacheStore, CacheEntry } from '@titrate/sdk';

/**
 * Creates a filesystem-backed CacheStore.
 * Each entry is stored as a JSON file named `{key}.json` in the cache directory.
 *
 * @param cacheDir - Directory where cache files will be stored
 * @returns A CacheStore implementation backed by the filesystem
 */
export function createFileCacheStore(cacheDir: string): CacheStore {
  async function ensureDir(): Promise<void> {
    if (!existsSync(cacheDir)) {
      await mkdir(cacheDir, { recursive: true });
    }
  }

  function filePath(key: string): string {
    return join(cacheDir, `${key}.json`);
  }

  return {
    async get<T>(key: string): Promise<CacheEntry<T> | null> {
      const path = filePath(key);
      if (!existsSync(path)) return null;
      const raw = await readFile(path, 'utf8');
      return JSON.parse(raw) as CacheEntry<T>;
    },

    async put<T>(entry: CacheEntry<T>): Promise<void> {
      await ensureDir();
      await writeFile(filePath(entry.key), JSON.stringify(entry), 'utf8');
    },

    async delete(key: string): Promise<void> {
      const path = filePath(key);
      if (existsSync(path)) await unlink(path);
    },

    async clear(): Promise<void> {
      if (!existsSync(cacheDir)) return;
      const files = await readdir(cacheDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          await unlink(join(cacheDir, file));
        }
      }
    },
  };
}
