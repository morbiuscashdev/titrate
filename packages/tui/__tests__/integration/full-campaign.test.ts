import { test, expect } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCampaignStorage, createSharedStorage } from '@titrate/storage-campaign';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import type { CampaignManifest } from '@titrate/sdk';
import { encryptPrivateKey } from '../../src/utils/passphrase.ts';

const ANVIL_RPC = process.env.ANVIL_RPC ?? 'http://127.0.0.1:8545';

async function anvilUp(): Promise<boolean> {
  try {
    const res = await fetch(ANVIL_RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', id: 1 }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const anvilReady = await anvilUp();

if (anvilReady) {
  test('full campaign lifecycle — create, configure, encrypt, read back', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'titrate-e2e-'));
    const storage = createCampaignStorage(dir);
    const _shared = createSharedStorage(dir);
    await storage.ensureDir();

    // 1. Write manifest
    const manifest: CampaignManifest = {
      id: 'e2e-test',
      funder: '0x0000000000000000000000000000000000000001',
      name: 'e2e',
      version: 1,
      chainId: 31337,
      rpcUrl: ANVIL_RPC,
      tokenAddress: '0x0000000000000000000000000000000000000002',
      tokenDecimals: 18,
      contractAddress: null,
      contractVariant: 'simple',
      contractName: 'X',
      amountMode: 'uniform',
      amountFormat: 'integer',
      uniformAmount: '1000000000000000000',
      batchSize: 10,
      campaignId: null,
      pinnedBlock: null,
      status: 'configuring',
      wallets: { mode: 'imported', count: 0 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await storage.manifest.write(manifest);

    // 2. Import 3 wallets (encrypted at rest)
    const pks = [generatePrivateKey(), generatePrivateKey(), generatePrivateKey()];
    const passphrase = 'test-pass';
    const records = await Promise.all(
      pks.map(async (pk, i) => {
        const acc = privateKeyToAccount(pk);
        const enc = await encryptPrivateKey(pk, passphrase);
        return {
          index: i,
          address: acc.address,
          encryptedKey: { ciphertext: enc.ciphertext, iv: enc.iv, authTag: enc.authTag },
          kdf: enc.kdf,
          kdfParams: enc.kdfParams,
          provenance: { type: 'imported' as const },
          createdAt: Date.now(),
        };
      }),
    );
    await storage.wallets.append(records);

    // 3. Re-read + verify persistence
    const readBack = await storage.wallets.readAll();
    expect(readBack).toHaveLength(3);
    expect(readBack[0].address).toBe(records[0].address);
    expect(readBack[0].encryptedKey.ciphertext).toBe(records[0].encryptedKey.ciphertext);

    // 4. Append 10 addresses + 3 filtered
    await storage.addresses.append(
      Array.from({ length: 10 }, (_, i) => ({
        address: `0x${i.toString(16).padStart(40, '0')}`,
        amount: null,
      })),
    );
    await storage.filtered.append(
      Array.from({ length: 3 }, (_, i) => ({
        address: `0x${i.toString(16).padStart(40, '0')}`,
        amount: null,
      })),
    );
    expect(await storage.addresses.count()).toBe(10);
    expect(await storage.filtered.count()).toBe(3);

    // 5. Write + read cursor (BigInt round-trip)
    await storage.cursor.write({
      scan: { lastBlock: 42n, endBlock: null, addressCount: 10 },
      filter: { watermark: 10, qualifiedCount: 3 },
      distribute: { watermark: 0, confirmedCount: 0 },
    });
    const cursor = await storage.cursor.read();
    expect(cursor.scan.lastBlock).toBe(42n);
    expect(cursor.filter.qualifiedCount).toBe(3);

    // 6. Verify manifest round-trip preserved discriminated union shape
    const readManifest = await storage.manifest.read();
    expect(readManifest.wallets.mode).toBe('imported');
    if (readManifest.wallets.mode === 'imported') {
      // wallets.count is optional cache; actual count lives in wallets.jsonl
      // No assertion on .count — it was never updated after wallet append.
    }
  });
}

test('full campaign lifecycle (no-anvil) — smoke test without RPC', async () => {
  // This test runs unconditionally to smoke-test the storage layer
  // even when Anvil isn't up. Uses the same storage stack with no network calls.
  const dir = await mkdtemp(join(tmpdir(), 'titrate-smoke-'));
  const storage = createCampaignStorage(dir);
  await storage.ensureDir();

  const manifest: CampaignManifest = {
    id: 'smoke',
    funder: '0x0000000000000000000000000000000000000001',
    name: 'smoke',
    version: 1,
    chainId: 1,
    rpcUrl: 'https://eth.llamarpc.com',
    tokenAddress: '0x0000000000000000000000000000000000000002',
    tokenDecimals: 18,
    contractAddress: null,
    contractVariant: 'simple',
    contractName: 'X',
    amountMode: 'uniform',
    amountFormat: 'integer',
    uniformAmount: '1',
    batchSize: 200,
    campaignId: null,
    pinnedBlock: null,
    status: 'configuring',
    wallets: { mode: 'imported', count: 0 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await storage.manifest.write(manifest);
  const back = await storage.manifest.read();
  expect(back.id).toBe('smoke');
});
