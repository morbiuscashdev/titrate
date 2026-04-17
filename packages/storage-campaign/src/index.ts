import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { WalletRecord, BatchRecord, SweepRecord } from '@titrate/sdk';
import { createAppendableCSV, type AppendableCSV } from './appendable-csv.js';
import { createAppendableJSONL, type AppendableJSONL } from './appendable-jsonl.js';
import { createManifestStore, type ManifestStore } from './manifest-store.js';
import { createCursorStore, type CursorStore } from './cursor-store.js';
import { createPipelineStore, type PipelineStore } from './pipeline-store.js';

export type CampaignStorage = {
  readonly dir: string;
  readonly manifest: ManifestStore;
  readonly pipeline: PipelineStore;
  readonly cursor: CursorStore;
  readonly addresses: AppendableCSV;
  readonly filtered: AppendableCSV;
  readonly amounts: AppendableCSV;
  readonly batches: AppendableJSONL<BatchRecord>;
  readonly wallets: AppendableJSONL<WalletRecord>;
  readonly sweeps: AppendableJSONL<SweepRecord>;
  readonly ensureDir: () => Promise<void>;
};

/**
 * Create a CampaignStorage rooted at `dir`. The directory is NOT created
 * eagerly — callers should call ensureDir() before first write.
 * mkdir is idempotent.
 */
export function createCampaignStorage(dir: string): CampaignStorage {
  return {
    dir,
    manifest: createManifestStore(join(dir, 'campaign.json')),
    pipeline: createPipelineStore(join(dir, 'pipeline.json')),
    cursor: createCursorStore(join(dir, 'cursor.json')),
    addresses: createAppendableCSV(join(dir, 'addresses.csv')),
    filtered: createAppendableCSV(join(dir, 'filtered.csv')),
    amounts: createAppendableCSV(join(dir, 'amounts.csv')),
    batches: createAppendableJSONL<BatchRecord>(join(dir, 'batches.jsonl')),
    wallets: createAppendableJSONL<WalletRecord>(join(dir, 'wallets.jsonl')),
    sweeps: createAppendableJSONL<SweepRecord>(join(dir, 'sweep.jsonl')),
    async ensureDir() {
      await mkdir(dir, { recursive: true });
    },
  };
}

export {
  createAppendableCSV,
  createAppendableJSONL,
  createManifestStore,
  createCursorStore,
  createPipelineStore,
};
export type { AppendableCSV, AppendableJSONL, ManifestStore, CursorStore, PipelineStore };
export type { CSVRow } from './appendable-csv.js';

export { createSharedStorage } from './shared-storage.js';
export type { SharedStorage, AppSettingsStore, ChainConfigStore } from './shared-storage.js';
