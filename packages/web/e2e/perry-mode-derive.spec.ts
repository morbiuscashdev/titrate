import { test, expect } from '@playwright/test';
import { installMockWallet, getMockWalletCalls } from './helpers/mock-wallet.js';
import { seedCampaign } from './helpers/seed-campaign.js';

/**
 * Perry-mode derive flow end-to-end against the built bundle.
 *
 * This test seeds a complete campaign + one source address set directly into
 * IndexedDB (so every step up to Wallet is intrinsically complete) and then
 * drives the UI through: connect mock wallet → skip Filters → land on
 * Wallet step → click Derive Hot Wallets → EIP-712 sign round-trip →
 * hot wallet displayed.
 *
 * Guards against regressions in:
 *   - WalletProvider.deriveHotWallet → wagmi useSignTypedData wiring
 *   - EIP-6963 round-trip of `eth_signTypedData_v4` through the mock provider
 *   - SDK deriveMultipleWallets signature-to-address derivation
 *   - WalletStep perry-mode rendering (WalletBadge + Fund Gas / Fund Tokens)
 */

const MOCK_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678' as const;

test.describe('perry mode derive (seeded campaign)', () => {
  test('connects, skips filters, derives a single hot wallet via EIP-712', async ({
    page,
  }) => {
    await installMockWallet(page, { address: MOCK_ADDRESS, chainId: 1 });

    // Visit the dashboard so the app mounts StorageProvider and opens the
    // 'titrate' IDB with the correct schema before we seed.
    await page.goto('/#/dashboard');
    // On a fresh profile, HomePage shows the WelcomeCard ("Create Your First
    // Campaign"); if any campaigns already exist it shows "New Campaign".
    // Either signal means StorageProvider has finished opening the IDB.
    await expect(
      page.getByRole('button', {
        name: /new campaign|create your first campaign/i,
      }),
    ).toBeVisible({ timeout: 15_000 });

    const now = Date.now();
    const campaignId = 'perry-mode-seeded-campaign';
    await seedCampaign(
      page,
      {
        id: campaignId,
        funder: MOCK_ADDRESS,
        name: 'Perry Mode Test',
        version: 1,
        chainId: 1,
        rpcUrl: 'http://localhost:8545',
        tokenAddress: '0x' + 'aa'.repeat(20),
        tokenDecimals: 18,
        contractAddress: null,
        contractVariant: 'simple',
        contractName: 'TokenAirdrop',
        amountMode: 'uniform',
        amountFormat: 'integer',
        uniformAmount: '1000',
        batchSize: 100,
        campaignId: null,
        pinnedBlock: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'perry-mode-seeded-source-set',
        campaignId,
        name: 'Seeded source set',
        type: 'source',
        addressCount: 1,
        createdAt: now,
      },
    );

    // Enter the step flow for the seeded campaign. CampaignProvider's
    // setActiveCampaign effect re-fetches from IDB on route change, so the
    // seeded data is picked up even though the dashboard render happened
    // before the seed.
    await page.goto(`/#/campaign/${campaignId}`);

    // Connect the mock wallet via the header Connect button.
    const banner = page.getByRole('banner');
    await banner.getByRole('button', { name: /^connect$/i }).click();
    await expect(page.getByText('MockWallet').first()).toBeVisible({
      timeout: 10_000,
    });
    await page.getByText('MockWallet').first().click();
    await expect(banner.getByText(/0x1234.*5678/)).toBeVisible({
      timeout: 10_000,
    });

    // Active step is Filters (lacks an intrinsic data check). Skip it —
    // which also explicitly setActiveStep('amounts'), so we land on the
    // Amounts form even though uniformAmount is already seeded.
    await page.getByRole('button', { name: /skip filters/i }).click();

    // Amounts step: uniformAmount='1000' was hydrated from the seeded
    // campaign, so Save & Continue is immediately enabled; clicking it
    // advances to the Wallet step.
    await page.getByRole('button', { name: /save & continue/i }).click();

    // Wallet step is now active. Click Derive Hot Wallets.
    await page
      .getByRole('button', { name: /derive hot wallets/i })
      .click();

    // Race: either derive resolves (Clear Perry Mode appears) or it throws
    // (an error banner appears). Wait for either and report the error body
    // if the sad path wins.
    const successLocator = page.getByRole('button', {
      name: /clear perry mode/i,
    });
    const errorLocator = page.locator(
      'div.font-mono.text-sm.text-\\[color\\:var\\(--color-err\\)\\]',
    );
    await Promise.race([
      successLocator.waitFor({ state: 'visible', timeout: 10_000 }),
      errorLocator.waitFor({ state: 'visible', timeout: 10_000 }),
    ]);

    if (await errorLocator.isVisible()) {
      const errText = await errorLocator.textContent();
      throw new Error(`derive failed: ${errText}`);
    }

    // Sanity: the mock wallet received the EIP-712 sign request.
    const calls = await getMockWalletCalls(page);
    const methods = calls.map((c) => c.method);
    expect(methods).toContain('eth_signTypedData_v4');

    // The rendered perry-mode view exposes per-wallet Fund actions. Their
    // aria-labels include 'Wallet 0' because walletCount=1, offset=0 renders
    // the single-wallet branch of WalletStep.
    await expect(
      page.getByRole('button', { name: /fund gas for wallet 0/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /fund tokens for wallet 0/i }),
    ).toBeVisible();
  });
});

test.describe('perry mode derive (full UI walkthrough)', () => {
  test('creates a campaign via the UI, walks every step, derives a hot wallet', async ({
    page,
  }) => {
    await installMockWallet(page, { address: MOCK_ADDRESS, chainId: 1 });

    // Fresh IDB → HomePage renders the WelcomeCard with a single "Create
    // Your First Campaign" CTA. Clicking it creates a campaign with
    // defaults and navigates to the campaign editor.
    await page.goto('/#/dashboard');

    // Connect the mock wallet BEFORE clicking through the step flow. The
    // wagmi connect handshake causes a provider re-render that bounces
    // CampaignProvider's setActiveCampaign effect — which resets the
    // completedSteps React state. Any Skip-Filters / step-override we set
    // before connecting would be undone. Connect first to avoid this.
    const banner = page.getByRole('banner');
    await banner.getByRole('button', { name: /^connect$/i }).click();
    await expect(page.getByText('MockWallet').first()).toBeVisible({
      timeout: 10_000,
    });
    await page.getByText('MockWallet').first().click();
    await expect(banner.getByText(/0x1234.*5678/)).toBeVisible({
      timeout: 10_000,
    });

    await page
      .getByRole('button', { name: /create your first campaign/i })
      .click();

    // ---- CampaignStep --------------------------------------------------
    // Use the Custom chain path to avoid listing specific chain buttons.
    await page.getByRole('button', { name: /^custom$/i }).click();
    await page.getByLabel('Chain ID').fill('1');
    await page.getByLabel('Chain Name').fill('Test Chain');
    // Intentionally-broken RPC: the probe won't fire until the campaign is
    // saved (publicClient is null while activeCampaign.chainId === 0), and
    // by the time it could fire the step has already unmounted.
    await page.getByLabel('RPC URL').fill('http://localhost:9');
    await page
      .getByLabel('Token Address')
      .fill('0x' + 'aa'.repeat(20));
    await page.getByLabel('Campaign Name').fill('E2E Perry Campaign');
    await page.getByRole('button', { name: /save & continue/i }).click();

    // ---- AddressesStep -------------------------------------------------
    // Paste one valid address, parse it, save.
    await page
      .getByLabel('Manual Entry')
      .fill('0x' + 'bb'.repeat(20));
    await page.getByRole('button', { name: /parse addresses/i }).click();
    await page.getByRole('button', { name: /save & continue/i }).click();

    // ---- FiltersStep ---------------------------------------------------
    await page.getByRole('button', { name: /skip filters/i }).click();

    // ---- AmountsStep ---------------------------------------------------
    await page.getByLabel('Amount per recipient').fill('1000');
    await page.getByRole('button', { name: /save & continue/i }).click();

    // ---- WalletStep ---------------------------------------------------
    // Wallet is already connected (connected up front). Derive now.
    await page
      .getByRole('button', { name: /derive hot wallets/i })
      .click();

    await expect(
      page.getByRole('button', { name: /clear perry mode/i }),
    ).toBeVisible({ timeout: 10_000 });

    const calls = await getMockWalletCalls(page);
    const methods = calls.map((c) => c.method);
    expect(methods).toContain('eth_signTypedData_v4');

    await expect(
      page.getByRole('button', { name: /fund gas for wallet 0/i }),
    ).toBeVisible();
  });
});
