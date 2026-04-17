import { describe, it, expect } from 'vitest';
import type {
  CampaignManifest,
  CampaignStatus,
  WalletProvisioning,
  PipelineCursor,
} from '../types.js';
import type { Address } from 'viem';

describe('CampaignStatus', () => {
  it('accepts all lifecycle states', () => {
    const states: readonly CampaignStatus[] = [
      'configuring', 'ready', 'running', 'paused', 'completed', 'swept',
    ];
    expect(states).toHaveLength(6);
  });
});

describe('WalletProvisioning', () => {
  it('derived branch carries cold address + count + offset', () => {
    const p: WalletProvisioning = {
      mode: 'derived',
      coldAddress: '0x0000000000000000000000000000000000000001' as Address,
      walletCount: 3,
      walletOffset: 0,
    };
    expect(p.mode).toBe('derived');
    if (p.mode === 'derived') expect(p.walletCount).toBe(3);
  });

  it('imported branch carries only count', () => {
    const p: WalletProvisioning = { mode: 'imported', count: 2 };
    expect(p.mode).toBe('imported');
    if (p.mode === 'imported') expect(p.count).toBe(2);
  });
});

describe('CampaignManifest', () => {
  it('extends CampaignConfig with lifecycle fields', () => {
    const manifest: CampaignManifest = {
      funder: '0x0000000000000000000000000000000000000001' as Address,
      name: 'test',
      version: 1,
      chainId: 1,
      rpcUrl: 'https://rpc.example.com',
      tokenAddress: '0x0000000000000000000000000000000000000002' as Address,
      tokenDecimals: 18,
      contractAddress: null,
      contractVariant: 'simple',
      contractName: 'Test',
      amountMode: 'uniform',
      amountFormat: 'integer',
      uniformAmount: '1000000',
      batchSize: 200,
      campaignId: null,
      pinnedBlock: null,
      id: 'test-campaign',
      status: 'configuring',
      wallets: { mode: 'imported', count: 0 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    expect(manifest.status).toBe('configuring');
    expect(manifest.wallets.mode).toBe('imported');
  });
});

describe('PipelineCursor', () => {
  it('tracks watermarks for all three stages', () => {
    const cursor: PipelineCursor = {
      scan: { lastBlock: 18_000_000n, endBlock: null, addressCount: 0 },
      filter: { watermark: 0, qualifiedCount: 0 },
      distribute: { watermark: 0, confirmedCount: 0 },
    };
    expect(cursor.scan.endBlock).toBeNull();
    expect(typeof cursor.scan.lastBlock).toBe('bigint');
  });
});
