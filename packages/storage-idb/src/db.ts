import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'titrate';
const DB_VERSION = 1;

export type TitrateDB = IDBPDatabase<TitrateSchema>;

export interface TitrateSchema {
  campaigns: { key: string; value: Record<string, unknown> };
  addressSets: { key: string; value: Record<string, unknown>; indexes: { byCampaign: string } };
  addresses: { key: string; value: Record<string, unknown>; indexes: { bySet: string } };
  batches: { key: string; value: Record<string, unknown>; indexes: { byCampaign: string } };
  wallets: { key: string; value: Record<string, unknown>; indexes: { byCampaign: string } };
  pipelineConfigs: { key: string; value: Record<string, unknown> };
}

/**
 * Opens (or creates) the Titrate IndexedDB database at version 1.
 * Creates all object stores and indexes on first open.
 *
 * @returns A typed IDBPDatabase handle
 */
export async function openTitrateDB(): Promise<TitrateDB> {
  return openDB<TitrateSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Campaigns
      db.createObjectStore('campaigns', { keyPath: 'id' });

      // Address Sets
      const setStore = db.createObjectStore('addressSets', { keyPath: 'id' });
      setStore.createIndex('byCampaign', 'campaignId');

      // Addresses (no natural key — autoIncrement)
      const addrStore = db.createObjectStore('addresses', { autoIncrement: true });
      addrStore.createIndex('bySet', 'setId');

      // Batches
      const batchStore = db.createObjectStore('batches', { keyPath: 'id' });
      batchStore.createIndex('byCampaign', 'campaignId');

      // Wallets
      const walletStore = db.createObjectStore('wallets', { keyPath: 'id' });
      walletStore.createIndex('byCampaign', 'campaignId');

      // Pipeline Configs
      db.createObjectStore('pipelineConfigs', { keyPath: 'campaignId' });
    },
  });
}
