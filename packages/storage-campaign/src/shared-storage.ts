import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppSettings, ChainConfig } from '@titrate/sdk';

export type AppSettingsStore = {
  readonly read: () => Promise<AppSettings>;
  readonly write: (settings: AppSettings) => Promise<void>;
  readonly update: (patch: Partial<AppSettings>) => Promise<void>;
};

export type ChainConfigStore = {
  readonly read: () => Promise<readonly ChainConfig[]>;
  readonly write: (chains: readonly ChainConfig[]) => Promise<void>;
};

export type SharedStorage = {
  readonly chains: ChainConfigStore;
  readonly settings: AppSettingsStore;
};

const EMPTY_SETTINGS: AppSettings = { providerKeys: {} };

export function createSharedStorage(campaignRoot: string): SharedStorage {
  const sharedDir = join(campaignRoot, '_shared');
  const chainsPath = join(sharedDir, 'chains.json');
  const settingsPath = join(sharedDir, 'settings.json');

  async function ensureDir(): Promise<void> {
    await mkdir(sharedDir, { recursive: true });
  }

  return {
    chains: {
      async read() {
        try {
          const raw = await readFile(chainsPath, 'utf8');
          return JSON.parse(raw) as readonly ChainConfig[];
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
          throw err;
        }
      },
      async write(chains) {
        await ensureDir();
        await writeFile(chainsPath, JSON.stringify(chains, null, 2), 'utf8');
      },
    },
    settings: {
      async read() {
        try {
          const raw = await readFile(settingsPath, 'utf8');
          return JSON.parse(raw) as AppSettings;
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') return EMPTY_SETTINGS;
          throw err;
        }
      },
      async write(settings) {
        await ensureDir();
        await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
      },
      async update(patch) {
        const current = await this.read();
        const merged: AppSettings = {
          ...current,
          providerKeys: { ...current.providerKeys, ...patch.providerKeys },
        };
        await this.write(merged);
      },
    },
  };
}
