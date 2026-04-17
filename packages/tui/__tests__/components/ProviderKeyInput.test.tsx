import { test, expect } from 'bun:test';
import { createTestRenderer } from '@opentui/core/testing';
import { createRoot } from '@opentui/react';
import { ProviderKeyInput } from '../../src/interactive/components/ProviderKeyInput.tsx';

test('renders valve template prefix for PulseChain', async () => {
  const { renderer, captureCharFrame } = await createTestRenderer({ width: 60, height: 5 });
  createRoot(renderer).render(
    <ProviderKeyInput providerId="valve" chainId={369} focused onChange={() => {}} />,
  );
  await new Promise((r) => setTimeout(r, 10));
  expect(captureCharFrame()).toContain('https://evm369.rpc.valve.city/v1/');
});

test('renders alchemy prefix for Ethereum', async () => {
  const { renderer, captureCharFrame } = await createTestRenderer({ width: 80, height: 5 });
  createRoot(renderer).render(
    <ProviderKeyInput providerId="alchemy" chainId={1} focused onChange={() => {}} />,
  );
  await new Promise((r) => setTimeout(r, 10));
  expect(captureCharFrame()).toContain('eth-mainnet.g.alchemy.com/v2/');
});
