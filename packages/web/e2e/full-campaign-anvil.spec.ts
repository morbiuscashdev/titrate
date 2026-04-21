import { test, expect } from '@playwright/test';
import { parseEther } from 'viem';
import { installHeadlessWallet } from './helpers/headless-wallet.js';
import {
  anvilInstalled,
  deployMockErc20,
  startAnvil,
  type AnvilHandle,
  type MockErc20,
} from './helpers/anvil.js';
import { foundry } from 'viem/chains';

/**
 * Full campaign walkthrough against a locally-spawned Anvil.
 *
 * Faster + more deterministic than the v4 testnet equivalent:
 *   - No faucet, no external RPC, no cooldowns.
 *   - MockERC20 is deployed inline per-spec, so we can also exercise
 *     Fund Tokens (real on-chain ERC-20 transfer) — something the v4
 *     spec can't do without a pre-deployed token.
 *   - Auto-skips when `anvil` isn't on PATH (Foundry not installed).
 *
 * The headless wallet reports chainId 1 to wagmi (one of its configured
 * networks) while the node-side viem client signs + broadcasts on
 * Foundry's chain (31337). Matches the v4 spec's dance so the UI flow
 * is chain-agnostic.
 */

test.describe('full campaign on local Anvil', () => {
  let anvil: AnvilHandle;
  let token: MockErc20;
  let available = true;

  test.beforeAll(async () => {
    if (!(await anvilInstalled())) {
      available = false;
      return;
    }
    anvil = await startAnvil({ port: 8559 });
    token = await deployMockErc20(anvil);
  });

  test.afterAll(async () => {
    if (anvil) await anvil.shutdown();
  });

  test('walks the full wizard, funds gas + tokens for a derived hot wallet', async ({
    page,
  }) => {
    test.skip(!available, 'anvil binary not on PATH (install Foundry)');
    test.setTimeout(60_000);

    const handle = await installHeadlessWallet(page, {
      privateKey: anvil.privateKey,
      rpcUrl: anvil.rpcUrl,
      chain: foundry,
      reportChainId: 1,
      walletName: 'AnvilHeadless',
    });

    const initialColdNative = await handle.publicClient.getBalance({
      address: handle.address,
    });
    const initialColdToken = (await handle.publicClient.readContract({
      address: token.address,
      abi: token.abi,
      functionName: 'balanceOf',
      args: [handle.address],
    })) as bigint;
    console.log(
      `[anvil] cold=${handle.address} tPLS=${initialColdNative} token=${initialColdToken}`,
    );

    await page.goto('/#/dashboard', { waitUntil: 'domcontentloaded' });

    // Connect through the Reown modal.
    const banner = page.getByRole('banner');
    await banner.getByRole('button', { name: /^connect$/i }).click();
    await expect(page.getByText('AnvilHeadless').first()).toBeVisible({
      timeout: 15_000,
    });
    await page.getByText('AnvilHeadless').first().click();
    await expect(
      banner.getByText(new RegExp(handle.address.slice(2, 6), 'i')),
    ).toBeVisible({ timeout: 15_000 });

    await page
      .getByRole('button', { name: /create your first campaign|new campaign/i })
      .first()
      .click();

    // ---- CampaignStep -------------------------------------------------
    await page.getByRole('button', { name: /^custom$/i }).click();
    await page.getByLabel('Chain ID').fill('1');
    await page.getByLabel('Chain Name').fill('Anvil (as chain 1)');
    await page.getByLabel('RPC URL').fill(anvil.rpcUrl);
    await page.getByLabel('Token Address').fill(token.address);
    await page.getByLabel('Campaign Name').fill('Anvil E2E');
    await page.getByRole('button', { name: /save & continue/i }).click();

    // ---- AddressesStep ------------------------------------------------
    await page.getByLabel('Manual Entry').fill('0x' + 'bb'.repeat(20));
    await page.getByRole('button', { name: /parse addresses/i }).click();
    await page.getByRole('button', { name: /save & continue/i }).click();

    // ---- FiltersStep --------------------------------------------------
    await page.getByRole('button', { name: /skip filters/i }).click();

    // ---- AmountsStep --------------------------------------------------
    // The Fund Tokens button uses BigInt(uniformAmount) directly, so this
    // is the literal wei amount transferred.
    const uniformAmountWei = 500n * 10n ** 18n;
    await page
      .getByLabel('Amount per recipient')
      .fill(uniformAmountWei.toString());
    await page.getByRole('button', { name: /save & continue/i }).click();

    // ---- WalletStep ---------------------------------------------------
    await expect(page.getByRole('alert')).toHaveCount(0);

    await page
      .getByRole('button', { name: /^derive hot wallets$/i })
      .click();

    await expect(
      page.getByRole('button', { name: /fund gas for wallet 0/i }),
    ).toBeVisible({ timeout: 20_000 });

    // Extract the hot wallet address from the rendered perry-mode UI.
    const hotAddress = (await page.evaluate((cold) => {
      const matches = Array.from(document.body.innerText.matchAll(/0x[a-fA-F0-9]{40}/g))
        .map((m) => m[0])
        .filter((a) => a.toLowerCase() !== cold.toLowerCase());
      return matches[0] ?? null;
    }, handle.address)) as `0x${string}` | null;

    expect(hotAddress, 'hot wallet address should render in perry mode').not.toBeNull();
    const hot = hotAddress!;

    // ---- Fund Gas (native transfer) -----------------------------------
    const hotNativeBefore = await handle.publicClient.getBalance({ address: hot });
    await page.getByRole('button', { name: /fund gas for wallet 0/i }).click();

    const expectedNativeDelta = parseEther('0.05');
    const gasDeadline = Date.now() + 20_000;
    let hotNativeAfter = hotNativeBefore;
    while (Date.now() < gasDeadline) {
      hotNativeAfter = await handle.publicClient.getBalance({ address: hot });
      if (hotNativeAfter - hotNativeBefore >= expectedNativeDelta) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(hotNativeAfter - hotNativeBefore).toBe(expectedNativeDelta);
    console.log(`[anvil] fund-gas hot delta=${hotNativeAfter - hotNativeBefore}`);

    // ---- Fund Tokens (ERC-20 transfer) --------------------------------
    const hotTokenBefore = (await handle.publicClient.readContract({
      address: token.address,
      abi: token.abi,
      functionName: 'balanceOf',
      args: [hot],
    })) as bigint;
    await page.getByRole('button', { name: /fund tokens for wallet 0/i }).click();

    const tokenDeadline = Date.now() + 20_000;
    let hotTokenAfter = hotTokenBefore;
    while (Date.now() < tokenDeadline) {
      hotTokenAfter = (await handle.publicClient.readContract({
        address: token.address,
        abi: token.abi,
        functionName: 'balanceOf',
        args: [hot],
      })) as bigint;
      if (hotTokenAfter - hotTokenBefore >= uniformAmountWei) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(hotTokenAfter - hotTokenBefore).toBe(uniformAmountWei);
    console.log(
      `[anvil] fund-tokens hot delta=${hotTokenAfter - hotTokenBefore} (uniformAmount)`,
    );

    // Cold-side invariants: lost at least the transferred amounts (plus
    // gas for the native-transfer case).
    const coldNativeAfter = await handle.publicClient.getBalance({
      address: handle.address,
    });
    expect(initialColdNative - coldNativeAfter).toBeGreaterThanOrEqual(
      expectedNativeDelta,
    );
    const coldTokenAfter = (await handle.publicClient.readContract({
      address: token.address,
      abi: token.abi,
      functionName: 'balanceOf',
      args: [handle.address],
    })) as bigint;
    expect(initialColdToken - coldTokenAfter).toBe(uniformAmountWei);
  });
});
