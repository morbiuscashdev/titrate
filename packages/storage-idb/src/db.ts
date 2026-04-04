import { openDB, type IDBPDatabase } from 'idb';

const DEFAULT_DB_NAME = 'titrate';
const DB_VERSION = 2;

export type TitrateDB = IDBPDatabase<TitrateSchema>;

export interface TitrateSchema {
  campaigns: { key: string; value: Record<string, unknown> };
  addressSets: { key: string; value: Record<string, unknown>; indexes: { byCampaign: string } };
  addresses: { key: string; value: Record<string, unknown>; indexes: { bySet: string } };
  batches: { key: string; value: Record<string, unknown>; indexes: { byCampaign: string } };
  wallets: { key: string; value: Record<string, unknown>; indexes: { byCampaign: string } };
  pipelineConfigs: { key: string; value: Record<string, unknown> };
  chainConfigs: { key: string; value: Record<string, unknown> };
  appSettings: { key: string; value: Record<string, unknown> };
}

/**
 * Opens (or creates) the Titrate IndexedDB database.
 * Creates all object stores and indexes on first open.
 *
 * @param dbName - Optional database name for test isolation (defaults to 'titrate')
 * @returns A typed IDBPDatabase handle
 */
export async function openTitrateDB(dbName = DEFAULT_DB_NAME): Promise<TitrateDB> {
  return openDB<TitrateSchema>(dbName, DB_VERSION, {
    upgrade(db) {
      // Campaigns
      if (!db.objectStoreNames.contains('campaigns')) {
        db.createObjectStore('campaigns', { keyPath: 'id' });
      }

      // Address Sets
      if (!db.objectStoreNames.contains('addressSets')) {
        const setStore = db.createObjectStore('addressSets', { keyPath: 'id' });
        setStore.createIndex('byCampaign', 'campaignId');
      }

      // Addresses (no natural key — autoIncrement)
      if (!db.objectStoreNames.contains('addresses')) {
        const addrStore = db.createObjectStore('addresses', { autoIncrement: true });
        addrStore.createIndex('bySet', 'setId');
      }

      // Batches
      if (!db.objectStoreNames.contains('batches')) {
        const batchStore = db.createObjectStore('batches', { keyPath: 'id' });
        batchStore.createIndex('byCampaign', 'campaignId');
      }

      // Wallets
      if (!db.objectStoreNames.contains('wallets')) {
        const walletStore = db.createObjectStore('wallets', { keyPath: 'id' });
        walletStore.createIndex('byCampaign', 'campaignId');
      }

      // Pipeline Configs
      if (!db.objectStoreNames.contains('pipelineConfigs')) {
        db.createObjectStore('pipelineConfigs', { keyPath: 'campaignId' });
      }

      // Chain Configs (v2)
      if (!db.objectStoreNames.contains('chainConfigs')) {
        db.createObjectStore('chainConfigs', { keyPath: 'id' });
      }

      // App Settings (v2)
      if (!db.objectStoreNames.contains('appSettings')) {
        db.createObjectStore('appSettings', { keyPath: 'key' });
      }
    },
  });
}
