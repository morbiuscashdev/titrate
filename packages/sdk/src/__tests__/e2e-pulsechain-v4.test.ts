import { describe, it, expect } from 'vitest';
import { parseEther } from 'viem';
import { deployDistributor } from '../distributor/deploy.js';
import { verifyContract } from '../distributor/verify.js';
import {
  claimFromFaucet,
  createTestnetContext,
  waitForBalance,
} from './helpers/pulsechain-testnet.js';

/**
 * End-to-end tests against the live PulseChain v4 testnet.
 *
 * Gated behind `RUN_PULSECHAIN_E2E=1` because:
 *   - They require network access to a public testnet + faucet.
 *   - The faucet has a per-address cooldown, so running them repeatedly
 *     will start failing until the cooldown resets.
 *   - Tests deploy a real contract and consume real testnet gas.
 *
 * Run: `RUN_PULSECHAIN_E2E=1 npx vitest run src/__tests__/e2e-pulsechain-v4`
 *
 * Optional env:
 *   - `PULSECHAIN_TESTNET_PRIVATE_KEY` — reuse a funded key across runs so
 *     only the first invocation has to hit the faucet. Without it a fresh
 *     random key is generated per invocation (always needs faucet claim).
 */
const E2E_ENABLED = process.env.RUN_PULSECHAIN_E2E === '1';

describe.runIf(E2E_ENABLED)('PulseChain v4 testnet E2E', () => {
  // Deploy + faucet RTTs + PulseScan verify polling (up to 30s inside
  // verifyContract) can total a minute or two on a slow testnet.
  const testTimeout = 240_000;

  it('deploys TitrateSimple after claiming tPLS from the faucet', async () => {
    const ctx = createTestnetContext();

    // Minimum needed for a Simple contract deploy is well under 1 tPLS on
    // PulseChain. Faucet pays 10 tPLS per claim, so one claim covers many
    // deploys — but we only need to ensure *some* funds before deploying.
    const existing = await ctx.publicClient.getBalance({ address: ctx.account.address });
    if (existing < parseEther('0.5')) {
      const faucetTx = await claimFromFaucet(ctx.account.address);
      expect(faucetTx).toMatch(/^0x[0-9a-f]{64}$/i);
      await waitForBalance(ctx.publicClient, ctx.account.address, {
        minBalance: parseEther('0.5'),
      });
    }

    const result = await deployDistributor({
      variant: 'simple',
      name: 'TokenAirdrop',
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
    });

    expect(result.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(result.txHash).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(result.variant).toBe('simple');
    expect(result.name).toBe('TokenAirdrop');

    // Sanity: the deployed bytecode at that address is non-empty.
    const code = await ctx.publicClient.getCode({ address: result.address });
    expect(code && code.length).toBeGreaterThan(2);
  }, testTimeout);

  it('verifies the deployed contract on PulseScan', async () => {
    const ctx = createTestnetContext();

    // Top-up check so this test can run standalone on a funded account.
    const existing = await ctx.publicClient.getBalance({ address: ctx.account.address });
    if (existing < parseEther('0.5')) {
      await claimFromFaucet(ctx.account.address);
      await waitForBalance(ctx.publicClient, ctx.account.address, {
        minBalance: parseEther('0.5'),
      });
    }

    const deploy = await deployDistributor({
      variant: 'simple',
      name: 'TokenAirdrop',
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
    });

    const verify = await verifyContract({
      address: deploy.address,
      name: 'TokenAirdrop',
      variant: 'simple',
      chainId: 943,
    });

    // The chain must be resolved to a PulseScan API URL and the verify URL
    // must point at the address we just deployed.
    expect(verify.explorerUrl).toContain(deploy.address);

    // Any message mentioning a network failure or missing API URL is a
    // configuration regression, not a PulseScan-pending quirk — fail hard.
    const msg = verify.message.toLowerCase();
    expect(msg).not.toContain('no explorer api url');
    expect(msg).not.toContain('request failed');

    // Strict: the submission must be accepted and verification confirmed.
    // If PulseScan is slow enough to poll-timeout (10 × 3s = 30s), we treat
    // that as a flaky-infra failure and surface the message so the next
    // session can decide whether to widen the poll window or relax.
    expect(verify.success, `verify failed: ${verify.message}`).toBe(true);
  }, testTimeout);
});
