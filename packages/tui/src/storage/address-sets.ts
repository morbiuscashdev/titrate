import { readFile, writeFile, readdir, mkdir, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AddressSetStore, AddressStore, StoredAddressSet, StoredAddress } from '@titrate/sdk';
import type { Address } from 'viem';

/**
 * Creates an AddressSetStore that persists set metadata as JSON files under
 * `{baseDir}/sets/{id}.meta.json`.
 */
export function createAddressSetStore(baseDir: string): AddressSetStore {
  const dir = join(baseDir, 'sets');

  async function ensureDir(): Promise<void> {
    await mkdir(dir, { recursive: true });
  }

  async function get(id: string): Promise<StoredAddressSet | null> {
    await ensureDir();
    try {
      const raw = await readFile(join(dir, `${id}.meta.json`), 'utf8');
      return JSON.parse(raw) as StoredAddressSet;
    } catch {
      return null;
    }
  }

  async function getByCampaign(campaignId: string): Promise<readonly StoredAddressSet[]> {
    await ensureDir();
    const files = await readdir(dir);
    const sets = await Promise.all(
      files
        .filter((f) => f.endsWith('.meta.json'))
        .map(async (f) => {
          const raw = await readFile(join(dir, f), 'utf8');
          return JSON.parse(raw) as StoredAddressSet;
        }),
    );
    return sets.filter((s) => s.campaignId === campaignId);
  }

  async function put(addressSet: StoredAddressSet): Promise<void> {
    await ensureDir();
    const data = JSON.stringify(addressSet, null, 2);
    await writeFile(join(dir, `${addressSet.id}.meta.json`), data, 'utf8');
  }

  return { get, getByCampaign, put };
}

/**
 * Creates an AddressStore that persists addresses as CSV files under
 * `{baseDir}/sets/{setId}.csv`. Each line: `address,amount` or just `address`.
 * Writes are append-only for efficiency.
 */
export function createAddressStore(baseDir: string): AddressStore {
  const dir = join(baseDir, 'sets');

  async function ensureDir(): Promise<void> {
    await mkdir(dir, { recursive: true });
  }

  function csvPath(setId: string): string {
    return join(dir, `${setId}.csv`);
  }

  async function getBySet(setId: string): Promise<readonly StoredAddress[]> {
    await ensureDir();
    try {
      const raw = await readFile(csvPath(setId), 'utf8');
      return raw
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => {
          const [address, amount] = line.split(',');
          return {
            setId,
            address: address.trim() as Address,
            amount: amount?.trim() ?? null,
          };
        });
    } catch {
      return [];
    }
  }

  async function putBatch(addresses: readonly StoredAddress[]): Promise<void> {
    await ensureDir();
    if (addresses.length === 0) return;

    // Group by setId for efficiency
    const bySet = new Map<string, readonly StoredAddress[]>();
    for (const addr of addresses) {
      const existing = bySet.get(addr.setId) ?? [];
      bySet.set(addr.setId, [...existing, addr]);
    }

    await Promise.all(
      [...bySet.entries()].map(async ([setId, addrs]) => {
        const lines = addrs
          .map((a) => (a.amount !== null ? `${a.address},${a.amount}` : a.address))
          .join('\n');
        await appendFile(csvPath(setId), lines + '\n', 'utf8');
      }),
    );
  }

  async function countBySet(setId: string): Promise<number> {
    const addresses = await getBySet(setId);
    return addresses.length;
  }

  return { getBySet, putBatch, countBySet };
}
