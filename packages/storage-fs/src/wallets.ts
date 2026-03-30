import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { WalletStore, PipelineConfigStore, StoredWallet } from '@titrate/sdk';
import type { PipelineConfig } from '@titrate/sdk';

/**
 * Creates a WalletStore that persists all wallets in a single JSON file at
 * `{baseDir}/wallets.json` keyed by campaignId.
 */
export function createWalletStore(baseDir: string): WalletStore {
  const filePath = join(baseDir, 'wallets.json');

  async function readAll(): Promise<Record<string, StoredWallet>> {
    try {
      const raw = await readFile(filePath, 'utf8');
      return JSON.parse(raw) as Record<string, StoredWallet>;
    } catch {
      return {};
    }
  }

  async function writeAll(wallets: Record<string, StoredWallet>): Promise<void> {
    await mkdir(baseDir, { recursive: true });
    await writeFile(filePath, JSON.stringify(wallets, null, 2), 'utf8');
  }

  async function get(campaignId: string): Promise<StoredWallet | null> {
    const all = await readAll();
    return all[campaignId] ?? null;
  }

  async function put(wallet: StoredWallet): Promise<void> {
    const all = await readAll();
    await writeAll({ ...all, [wallet.campaignId]: wallet });
  }

  return { get, put };
}

/**
 * Creates a PipelineConfigStore that persists configs as JSON files under
 * `{baseDir}/pipelines/{campaignId}.json`.
 */
export function createPipelineConfigStore(baseDir: string): PipelineConfigStore {
  const dir = join(baseDir, 'pipelines');

  async function ensureDir(): Promise<void> {
    await mkdir(dir, { recursive: true });
  }

  async function get(campaignId: string): Promise<PipelineConfig | null> {
    await ensureDir();
    try {
      const raw = await readFile(join(dir, `${campaignId}.json`), 'utf8');
      return JSON.parse(raw) as PipelineConfig;
    } catch {
      return null;
    }
  }

  async function put(campaignId: string, config: PipelineConfig): Promise<void> {
    await ensureDir();
    await writeFile(join(dir, `${campaignId}.json`), JSON.stringify(config, null, 2), 'utf8');
  }

  return { get, put };
}
