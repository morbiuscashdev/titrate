import type { WalletStore, PipelineConfigStore, StoredWallet, PipelineConfig } from '@titrate/sdk';
import type { TitrateDB } from './db.js';

/**
 * Creates a WalletStore backed by the 'wallets' object store in IDB.
 * Keyed by wallet id; lookup by campaignId uses the 'byCampaign' index.
 *
 * @param db - Open TitrateDB handle
 * @returns WalletStore implementation
 */
export function createWalletStore(db: TitrateDB): WalletStore {
  async function get(campaignId: string): Promise<StoredWallet | null> {
    const all = await db.getAllFromIndex('wallets', 'byCampaign', campaignId);
    const first = all[0];
    return first ? (first as unknown as StoredWallet) : null;
  }

  async function put(wallet: StoredWallet): Promise<void> {
    await db.put('wallets', wallet as unknown as Record<string, unknown>);
  }

  return { get, put };
}

/**
 * Creates a PipelineConfigStore backed by the 'pipelineConfigs' object store
 * in IDB. Keyed by campaignId.
 *
 * @param db - Open TitrateDB handle
 * @returns PipelineConfigStore implementation
 */
export function createPipelineConfigStore(db: TitrateDB): PipelineConfigStore {
  async function get(campaignId: string): Promise<PipelineConfig | null> {
    const data = await db.get('pipelineConfigs', campaignId);
    return data ? (data as unknown as PipelineConfig) : null;
  }

  async function put(campaignId: string, config: PipelineConfig): Promise<void> {
    await db.put('pipelineConfigs', { ...config, campaignId } as unknown as Record<string, unknown>);
  }

  return { get, put };
}
