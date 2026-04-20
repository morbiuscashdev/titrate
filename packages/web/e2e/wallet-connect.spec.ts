import { test, expect } from '@playwright/test';
import { installMockWallet, getMockWalletCalls } from './helpers/mock-wallet.js';

/**
 * Wallet-connect flow against the built bundle with an injected EIP-1193 mock.
 *
 * The mock registers itself via EIP-6963 so Reown's AppKit surfaces it in the
 * connector list. Clicking "Connect" opens the AppKit modal; we select
 * "MockWallet" and expect the header to switch from the Connect button to a
 * truncated-address badge.
 *
 * Guards against regressions in:
 *   - Reown AppKit EIP-6963 integration (breaks if the adapter drops support)
 *   - Header badge swap logic (HeaderWalletBadge in App.tsx)
 *   - wagmi connector wiring through WalletProvider
 */

const MOCK_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678' as const;

test.describe('wallet connect (injected EIP-1193 mock)', () => {
  test('announced provider shows up in AppKit modal and populates the header badge on select', async ({
    page,
  }) => {
    await installMockWallet(page, { address: MOCK_ADDRESS, chainId: 1 });

    await page.goto('/');

    // The banner starts with a Connect button; click it to open AppKit.
    const banner = page.getByRole('banner');
    await banner.getByRole('button', { name: /^connect$/i }).click();

    // AppKit renders inside a shadow-DOM web component; Playwright's
    // getByText pierces shadow roots by default.
    await expect(page.getByText('MockWallet').first()).toBeVisible({ timeout: 10_000 });

    await page.getByText('MockWallet').first().click();

    // After wagmi completes the connect, the header swaps to the badge.
    // Our badge truncates to `${first6}...${last4}`.
    await expect(banner.getByText(/0x1234.*5678/)).toBeVisible({ timeout: 10_000 });
    await expect(banner.getByRole('button', { name: /^connect$/i })).not.toBeVisible();

    // Sanity: the mock recorded the connect roundtrip.
    const calls = await getMockWalletCalls(page);
    const methods = calls.map((c) => c.method);
    expect(methods).toContain('eth_requestAccounts');
  });
});
