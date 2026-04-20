import type { Page } from '@playwright/test';

type SeedableCampaign = {
  readonly id: string;
  readonly funder: string;
  readonly name: string;
  readonly version: number;
  readonly chainId: number;
  readonly rpcUrl: string;
  readonly tokenAddress: string;
  readonly tokenDecimals: number;
  readonly contractAddress: string | null;
  readonly contractVariant: 'simple' | 'full';
  readonly contractName: string;
  readonly amountMode: 'uniform' | 'variable';
  readonly amountFormat: 'integer' | 'decimal';
  readonly uniformAmount: string | null;
  readonly batchSize: number;
  readonly campaignId: string | null;
  readonly pinnedBlock: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
};

type SeedableAddressSet = {
  readonly id: string;
  readonly campaignId: string;
  readonly name: string;
  readonly type: 'source' | 'derived-filter' | 'external-filter' | 'result';
  readonly addressCount: number;
  readonly createdAt: number;
};

/**
 * Seeds a complete campaign and one source address set directly into
 * IndexedDB. The app must have already opened the 'titrate' DB (i.e. the
 * caller has navigated to a page that mounts StorageProvider) before this
 * runs — otherwise the object stores won't exist yet.
 *
 * After seeding, navigate to `/#/campaign/${campaign.id}` to enter the
 * step flow with every prior-to-Wallet step either auto-complete (campaign,
 * addresses, amounts) or ready to be skipped (filters).
 */
export async function seedCampaign(
  page: Page,
  campaign: SeedableCampaign,
  addressSet: SeedableAddressSet,
): Promise<void> {
  await page.evaluate(
    async ({ campaign, addressSet }) => {
      const openReq = indexedDB.open('titrate', 3);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        openReq.onsuccess = () => resolve(openReq.result);
        openReq.onerror = () => reject(openReq.error);
      });
      const tx = db.transaction(['campaigns', 'addressSets'], 'readwrite');
      tx.objectStore('campaigns').put(campaign);
      tx.objectStore('addressSets').put(addressSet);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { campaign, addressSet },
  );
}
