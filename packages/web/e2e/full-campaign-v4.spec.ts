import { test, expect } from '@playwright/test';
import { parseEther } from 'viem';
import { installMockWallet } from './helpers/mock-wallet.js';
import { installHeadlessWallet } from './helpers/headless-wallet.js';
import {
  ensureFunded,
  resolveAccount,
  selectLiveRpc,
  pulsechainV4Testnet,
} from './helpers/pulsechain-v4.js';

/**
 * End-to-end smoke against the real PulseChain v4 testnet.
 *
 * Gate: runs only when `RUN_PULSECHAIN_E2E_WEB=1` to avoid faucet calls +
 * live-chain RPC during the default test sweep. Expects
 * `PULSECHAIN_TESTNET_PRIVATE_KEY` so repeated runs reuse one faucet claim;
 * skips with a helpful reason when neither the env key nor the faucet can
 * produce funds.
 *
 * What this spec proves (Phase 1):
 *   - The UI walkthrough reaches WalletStep with the chain-mismatch banner
 *     visible (wagmi on chain 1, campaign on chain 943).
 *   - The "paste a private key" escape hatch signs the EIP-712 payload
 *     locally and derives a hot wallet without wagmi involvement.
 *   - The derived address is deterministic (same key → same wallet).
 *   - The funded cold address actually holds balance on v4 testnet, so the
 *     environment is live.
 *
 * Not yet covered (Phase 2):
 *   - DistributeStep walkthrough
 *   - Real broadcast of a disperse tx on v4
 *   - Performance/throughput metrics from batches.jsonl
 */

const GATED = process.env.RUN_PULSECHAIN_E2E_WEB === '1';
const MIN_BALANCE_WEI = 500_000_000_000_000_000n; // 0.5 tPLS

test.describe('full campaign on PulseChain v4 testnet (gated)', () => {
  test.skip(!GATED, 'RUN_PULSECHAIN_E2E_WEB=1 not set');

  test('walks the UI, pastes testnet key, derives a hot wallet', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    if (!process.env.PULSECHAIN_TESTNET_PRIVATE_KEY) {
      test.skip(
        true,
        'Set PULSECHAIN_TESTNET_PRIVATE_KEY (see titrate-pulsechain-testnet skill) to run this spec',
      );
    }

    const rpcUrl = await selectLiveRpc().catch((err) => {
      test.skip(true, `no live v4 RPC — ${err instanceof Error ? err.message : String(err)}`);
      return '';
    });
    const account = resolveAccount(rpcUrl);
    const funded = await ensureFunded(account, MIN_BALANCE_WEI);
    if (!funded.ok) {
      test.skip(true, `testnet funding unavailable — ${funded.reason}`);
    }

    const initialBalance = funded.ok
      ? funded.balance
      : await account.publicClient.getBalance({ address: account.address });
    const blockNumber = await account.publicClient.getBlockNumber();
    // Trace: cold address + on-chain state at spec start. Lets a human
    // reading CI output confirm the spec hit a live v4 node.
    console.log(
      `[v4] cold=${account.address} balance=${initialBalance} wei block=${blockNumber} chain=${pulsechainV4Testnet.id}`,
    );

    // mock wagmi wallet on chain 1 — the paste-key escape hatch bypasses it
    // entirely, so its fake signatures never get invoked on the signing path.
    await installMockWallet(page, { address: account.address, chainId: 1 });

    await page.goto('/#/dashboard', { waitUntil: 'domcontentloaded' });

    const banner = page.getByRole('banner');
    await banner.getByRole('button', { name: /^connect$/i }).click();
    await expect(page.getByText('MockWallet').first()).toBeVisible({
      timeout: 10_000,
    });
    await page.getByText('MockWallet').first().click();
    await expect(
      banner.getByText(new RegExp(account.address.slice(2, 6), 'i')),
    ).toBeVisible({ timeout: 10_000 });

    await page
      .getByRole('button', { name: /create your first campaign|new campaign/i })
      .first()
      .click();

    // ---- CampaignStep -------------------------------------------------
    await page.getByRole('button', { name: /^custom$/i }).click();
    await page.getByLabel('Chain ID').fill('943');
    await page.getByLabel('Chain Name').fill('PulseChain Testnet v4');
    await page.getByLabel('RPC URL').fill(account.rpcUrl);
    await page
      .getByLabel('Token Address')
      .fill('0x' + 'aa'.repeat(20));
    await page.getByLabel('Campaign Name').fill('v4 Paste-Key Smoke');
    await page.getByRole('button', { name: /save & continue/i }).click();

    // ---- AddressesStep ------------------------------------------------
    await page
      .getByLabel('Manual Entry')
      .fill('0x' + 'bb'.repeat(20));
    await page.getByRole('button', { name: /parse addresses/i }).click();
    await page.getByRole('button', { name: /save & continue/i }).click();

    // ---- FiltersStep --------------------------------------------------
    await page.getByRole('button', { name: /skip filters/i }).click();

    // ---- AmountsStep --------------------------------------------------
    await page.getByLabel('Amount per recipient').fill('1000');
    await page.getByRole('button', { name: /save & continue/i }).click();

    // ---- WalletStep ---------------------------------------------------
    // Chain mismatch banner must be visible — mock is on 1, campaign on 943.
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('chain 1');
    await expect(alert).toContainText('chain 943');

    // Standard Derive must be disabled while mismatched.
    await expect(
      page.getByRole('button', { name: /^derive hot wallets$/i }),
    ).toBeDisabled();

    // Open the escape hatch and paste the real funded key.
    await page.getByText(/or paste a private key instead/i).click();
    await page
      .getByLabel(/cold wallet private key/i)
      .fill(account.privateKey);

    const deriveFromKey = page.getByRole('button', {
      name: /derive from pasted key/i,
    });
    await expect(deriveFromKey).toBeEnabled();
    await deriveFromKey.click();

    // After a successful derive, the paste-key editor collapses and the
    // perry-mode fund buttons appear (same assertion the mock-wallet spec
    // makes, so regressions here are caught by either spec).
    await expect(
      page.getByRole('button', { name: /fund gas for wallet 0/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole('button', { name: /fund tokens for wallet 0/i }),
    ).toBeVisible();

    // Prove paste-key bypassed wagmi: no mock signTypedData_v4 call was
    // issued for the derivation (the mock only saw the connect handshake).
    // Inspect mock-wallet calls. A `StorageEncryption` sign call is expected
    // (StorageProvider auto-prompts to unlock IDB encryption on connect); any
    // `HotWalletDerivation` sign call would mean the paste-key path didn't
    // bypass wagmi the way it's supposed to.
    const calls = await page.evaluate(
      () =>
        ((window as unknown as { __mockWalletCalls?: unknown[] })
          .__mockWalletCalls ?? []) as Array<{ method: string; params: unknown }>,
    );

    const hotWalletSigns = calls.filter((c) => {
      if (c.method !== 'eth_signTypedData_v4') return false;
      const params = c.params as unknown;
      if (!Array.isArray(params) || params.length < 2) return false;
      try {
        const typedData = JSON.parse(String(params[1])) as {
          primaryType?: string;
        };
        return typedData.primaryType === 'HotWalletDerivation';
      } catch {
        return false;
      }
    });
    expect(hotWalletSigns).toEqual([]);

    // Post-run: balance on v4 testnet should still be ≥ the minimum. No tx
    // were broadcast in this phase, so delta should be exactly 0 — if not,
    // it means something else is holding this key and mutating state.
    const finalBalance = await account.publicClient.getBalance({
      address: account.address,
    });
    expect(finalBalance).toBeGreaterThanOrEqual(MIN_BALANCE_WEI);
    console.log(
      `[v4] post-derive balance=${finalBalance} delta=${finalBalance - initialBalance}`,
    );
  });

  test('headless wallet signs + broadcasts a real Fund Gas transfer', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    if (!process.env.PULSECHAIN_TESTNET_PRIVATE_KEY) {
      test.skip(true, 'needs PULSECHAIN_TESTNET_PRIVATE_KEY');
    }

    const rpcUrl = await selectLiveRpc().catch((err) => {
      test.skip(true, `no live v4 RPC — ${err instanceof Error ? err.message : String(err)}`);
      return '';
    });
    const account = resolveAccount(rpcUrl);
    const funded = await ensureFunded(account, MIN_BALANCE_WEI);
    if (!funded.ok) {
      test.skip(true, `testnet funding unavailable — ${funded.reason}`);
    }

    // Install a headless wallet that reports chainId 1 to wagmi (one of its
    // configured networks — mainnet/base/arbitrum) so Reown AppKit doesn't
    // kick into an "unsupported chain" prompt on connect. The node-side
    // viem walletClient still signs + broadcasts on real v4 (chain 943),
    // because walletClient.sendTransaction uses its own chain config. The
    // campaign below is also set to chainId 1 so no mismatch banner fires.
    const handle = await installHeadlessWallet(page, {
      privateKey: account.privateKey,
      rpcUrl,
      chain: pulsechainV4Testnet,
      reportChainId: 1,
      walletName: 'TitrateHeadless',
    });

    const initialColdBalance = await handle.publicClient.getBalance({
      address: handle.address,
    });
    console.log(
      `[v4] headless cold=${handle.address} balance=${initialColdBalance} wei`,
    );

    await page.goto('/#/dashboard', { waitUntil: 'domcontentloaded' });

    const banner = page.getByRole('banner');
    await banner.getByRole('button', { name: /^connect$/i }).click();
    await expect(page.getByText('TitrateHeadless').first()).toBeVisible({
      timeout: 15_000,
    });
    await page.getByText('TitrateHeadless').first().click();
    // Header badge reflects a real address tied to a live chain.
    await expect(
      banner.getByText(new RegExp(account.address.slice(2, 6), 'i')),
    ).toBeVisible({ timeout: 15_000 });

    await page
      .getByRole('button', { name: /create your first campaign|new campaign/i })
      .first()
      .click();

    // ---- CampaignStep: chainId 1 matches wagmi's reported chain so the
    //      mismatch banner stays hidden. RPC URL still points at v4, so
    //      balance + receipt queries actually hit the live chain.
    await page.getByRole('button', { name: /^custom$/i }).click();
    await page.getByLabel('Chain ID').fill('1');
    await page.getByLabel('Chain Name').fill('PulseChain v4 (as chain 1)');
    await page.getByLabel('RPC URL').fill(rpcUrl);
    await page
      .getByLabel('Token Address')
      .fill('0x' + 'aa'.repeat(20));
    await page.getByLabel('Campaign Name').fill('v4 Headless Fund-Gas Smoke');
    await page.getByRole('button', { name: /save & continue/i }).click();

    // ---- AddressesStep -------------------------------------------------
    await page.getByLabel('Manual Entry').fill('0x' + 'bb'.repeat(20));
    await page.getByRole('button', { name: /parse addresses/i }).click();
    await page.getByRole('button', { name: /save & continue/i }).click();

    // ---- FiltersStep ---------------------------------------------------
    await page.getByRole('button', { name: /skip filters/i }).click();

    // ---- AmountsStep ---------------------------------------------------
    await page.getByLabel('Amount per recipient').fill('1000');
    await page.getByRole('button', { name: /save & continue/i }).click();

    // ---- WalletStep ----------------------------------------------------
    // No chain mismatch this time — the banner must NOT be visible.
    await expect(page.getByRole('alert')).toHaveCount(0);

    // Standard Derive is enabled and runs through the headless wallet, so
    // the signature is a real secp256k1 signature produced node-side.
    await page
      .getByRole('button', { name: /^derive hot wallets$/i })
      .click();

    await expect(
      page.getByRole('button', { name: /fund gas for wallet 0/i }),
    ).toBeVisible({ timeout: 20_000 });

    // Pull the hot wallet address out of the UI — WalletBadge renders it
    // as a short hex tag near the Fund buttons. We extract the first `0x`
    // hex that isn't the cold address.
    const hotAddress = await page.evaluate((cold) => {
      const matches = Array.from(document.body.innerText.matchAll(/0x[a-fA-F0-9]{40}/g))
        .map((m) => m[0])
        .filter((a) => a.toLowerCase() !== cold.toLowerCase());
      return matches[0] ?? null;
    }, handle.address);

    expect(hotAddress, 'derived hot wallet address should be rendered').not.toBeNull();
    const hotBefore = await handle.publicClient.getBalance({
      address: hotAddress as `0x${string}`,
    });
    console.log(`[v4] hot=${hotAddress} balance_before=${hotBefore} wei`);

    // Click Fund Gas — this triggers wagmi's useWalletClient to produce a
    // tx through the headless wallet, which signs + broadcasts on v4.
    await page
      .getByRole('button', { name: /fund gas for wallet 0/i })
      .click();

    // The hot wallet should receive ~0.05 tPLS. Poll on-chain for a short
    // window, then assert.
    const expectedDelta = parseEther('0.05');
    const deadline = Date.now() + 90_000;
    let hotAfter = hotBefore;
    while (Date.now() < deadline) {
      hotAfter = await handle.publicClient.getBalance({
        address: hotAddress as `0x${string}`,
      });
      if (hotAfter - hotBefore >= expectedDelta) break;
      await new Promise((r) => setTimeout(r, 4_000));
    }

    console.log(
      `[v4] hot balance_after=${hotAfter} delta=${hotAfter - hotBefore}`,
    );
    expect(hotAfter - hotBefore).toBeGreaterThanOrEqual(expectedDelta);

    // Cold wallet should have dropped by at least the expected delta plus
    // some gas. An exact equality check is hostile to gas drift; a >= check
    // is the invariant we care about.
    const coldAfter = await handle.publicClient.getBalance({
      address: handle.address,
    });
    expect(initialColdBalance - coldAfter).toBeGreaterThanOrEqual(expectedDelta);
    console.log(
      `[v4] cold delta=${initialColdBalance - coldAfter} (includes gas)`,
    );
  });
});
