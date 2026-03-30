import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { createIDBStorage } from '../src/index.js';
import type { Storage, StoredCampaign, StoredBatch, StoredWallet } from '@titrate/sdk';

describe('IDBStorage', () => {
  let storage: Storage;

  beforeEach(async () => {
    // Each test gets a fresh storage instance (fake-indexeddb resets between module imports,
    // but we rely on a new DB name via the auto import resetting state in vitest's isolate mode)
    storage = await createIDBStorage();
  });

  describe('campaigns', () => {
    const campaign: StoredCampaign = {
      id: 'test-1',
      funder: '0x1234567890abcdef1234567890abcdef12345678',
      name: 'Test Campaign',
      version: 1,
      chainId: 1,
      rpcUrl: 'https://eth.llamarpc.com',
      tokenAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      tokenDecimals: 8,
      contractAddress: null,
      contractVariant: 'simple',
      contractName: 'TestDrop',
      amountMode: 'uniform',
      amountFormat: 'integer',
      uniformAmount: '100',
      batchSize: 200,
      campaignId: null,
      pinnedBlock: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    it('puts and gets a campaign', async () => {
      await storage.campaigns.put(campaign);
      const got = await storage.campaigns.get('test-1');
      expect(got).toBeTruthy();
      expect(got!.name).toBe('Test Campaign');
    });

    it('finds by identity', async () => {
      await storage.campaigns.put(campaign);
      const got = await storage.campaigns.getByIdentity(
        campaign.funder,
        campaign.name,
        campaign.version,
      );
      expect(got).toBeTruthy();
      expect(got!.id).toBe('test-1');
    });

    it('returns null for missing campaign', async () => {
      expect(await storage.campaigns.get('nonexistent')).toBeNull();
    });

    it('lists all campaigns', async () => {
      await storage.campaigns.put(campaign);
      await storage.campaigns.put({ ...campaign, id: 'test-2', name: 'Second' });
      const list = await storage.campaigns.list();
      expect(list).toHaveLength(2);
    });
  });

  describe('addressSets', () => {
    it('puts and gets by campaign', async () => {
      await storage.addressSets.put({
        id: 'set-1',
        campaignId: 'test-1',
        name: 'source',
        type: 'source',
        addressCount: 100,
        createdAt: Date.now(),
      });
      const sets = await storage.addressSets.getByCampaign('test-1');
      expect(sets).toHaveLength(1);
      expect(sets[0].name).toBe('source');
    });
  });

  describe('addresses', () => {
    it('puts batch and reads back', async () => {
      await storage.addresses.putBatch([
        { setId: 'set-1', address: '0x1111111111111111111111111111111111111111', amount: '100' },
        { setId: 'set-1', address: '0x2222222222222222222222222222222222222222', amount: '200' },
      ]);
      const addresses = await storage.addresses.getBySet('set-1');
      expect(addresses).toHaveLength(2);
      expect(await storage.addresses.countBySet('set-1')).toBe(2);
    });
  });

  describe('batches', () => {
    it('puts and retrieves by campaign', async () => {
      const batch: StoredBatch = {
        id: 'batch-1',
        campaignId: 'test-1',
        batchIndex: 0,
        recipients: ['0x1111111111111111111111111111111111111111'],
        amounts: ['100'],
        status: 'confirmed',
        attempts: [],
        confirmedTxHash: '0xabcd',
        confirmedBlock: 42n,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await storage.batches.put(batch);
      const batches = await storage.batches.getByCampaign('test-1');
      expect(batches).toHaveLength(1);
      const last = await storage.batches.getLastCompleted('test-1');
      expect(last).toBeTruthy();
      expect(last!.batchIndex).toBe(0);
    });
  });

  describe('wallets', () => {
    it('puts and gets by campaign', async () => {
      const wallet: StoredWallet = {
        id: 'w-1',
        campaignId: 'test-1',
        hotAddress: '0x1111111111111111111111111111111111111111',
        coldAddress: '0x2222222222222222222222222222222222222222',
        createdAt: Date.now(),
      };
      await storage.wallets.put(wallet);
      const got = await storage.wallets.get('test-1');
      expect(got).toBeTruthy();
      expect(got!.hotAddress).toBe('0x1111111111111111111111111111111111111111');
    });
  });
});
