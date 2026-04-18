import { test, expect } from 'bun:test';
import type { CampaignManifest } from '@titrate/sdk';
import { deriveStepStates, type StepState } from '../src/interactive/step-status.ts';

const baseManifest: CampaignManifest = {
  id: 'x', funder: '0x0000000000000000000000000000000000000001',
  name: 'x', version: 1, chainId: 1, rpcUrl: 'https://x',
  tokenAddress: '0x0000000000000000000000000000000000000002', tokenDecimals: 18,
  contractAddress: null, contractVariant: 'simple', contractName: 'X',
  amountMode: 'uniform', amountFormat: 'integer', uniformAmount: '1',
  batchSize: 200, campaignId: null, pinnedBlock: null,
  status: 'configuring', wallets: { mode: 'imported', count: 0 },
  createdAt: 1, updatedAt: 1,
  startBlock: null, endBlock: null, autoStart: false,
  control: { scan: 'running', filter: 'running', distribute: 'running' },
};

test('configuring campaign with no activity shows most steps as todo/blocked', () => {
  const states = deriveStepStates(baseManifest, {
    addresses: 0, filtered: 0, wallets: 0, batches: 0,
  });
  const map = Object.fromEntries(states.map((s: StepState) => [s.id, s.status]));
  expect(map.campaign).toBe('done');  // manifest exists with chain+token set
  expect(map.addresses).toBe('todo');
  expect(map.distribute).toBe('blocked');
});

test('addresses step becomes done once a non-zero count is recorded', () => {
  const states = deriveStepStates(baseManifest, {
    addresses: 100, filtered: 0, wallets: 0, batches: 0,
  });
  const addr = states.find((s) => s.id === 'addresses')!;
  expect(addr.status).toBe('done');
  expect(addr.summary).toContain('100');
});

test('distribute unblocks when addresses + filters + amounts + wallets are all done', () => {
  const manifest: CampaignManifest = {
    ...baseManifest,
    wallets: { mode: 'imported', count: 3 },
  };
  const states = deriveStepStates(manifest, {
    addresses: 10, filtered: 10, wallets: 3, batches: 0,
  });
  const dist = states.find((s) => s.id === 'distribute')!;
  expect(dist.status).not.toBe('blocked');
});
