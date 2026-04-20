---
name: titrate-web-e2e
description: Use after touching anything that ships with the web bundle — HTML meta tags (CSP), service-worker config, router setup, theme provider, header/navigation chrome, or VitePWA options. Also use when the user reports a bug that only reproduces on the deployed Railway app and not in vitest unit tests. Runs a Playwright smoke against `vite preview` of the real production build. Catches the PWA/CSP/router/SW class of regressions that unit tests cannot, because the failing behaviors only manifest in the built artifact.
---

# Titrate Web E2E Smoke

## Why

Unit tests run against jsdom and the unbuilt source; they cannot see service-worker registration, CSP meta tags, PWA precaching, or the built bundle's router wiring. Every one of the five findings from the 2026-04-19 production audit was invisible to vitest but would have been caught by a single Playwright pass against `vite preview`.

This harness exists to close that gap — not to replace unit tests.

## Run

From `packages/web`:

```bash
yarn test:e2e        # headless
yarn test:e2e:ui     # Playwright UI mode for debugging
```

Playwright builds the app, starts `vite preview` on port 4173, and runs the smoke suite. One pass is ~17 seconds locally, ~3 minutes in CI (chromium install dominates).

CI runs the harness automatically on every PR.

## What the smoke guards

| Test | Regression it catches |
|---|---|
| `renders without console errors or Lit dev-mode warning` | Lit warning regression (PR #29/#31); real JS runtime errors |
| `header navigation uses HashRouter-compatible hrefs` | Header anchors using `/` instead of `#/` (PR #29) |
| `renders only one theme toggle button` | Duplicate theme toggle on landing page (PR #31) |
| `settings page loads via hash route` | SPA fallback breaking `#/settings` rendering, stale SW serving old HTML (PR #30) |
| `announced provider shows up in AppKit modal` | Reown AppKit EIP-6963 discovery breaking; header badge swap logic; wagmi connector wiring |

The filter in `shouldIgnore()` drops Chromium's "Failed to load resource" console errors (network-layer noise, already covered by response tracking in the test) so third-party 403s (Reown without a project-id allowlisted for `http://localhost:4173`) don't mask real regressions.

## Wallet-connected tests — mock EIP-1193 provider

`e2e/helpers/mock-wallet.ts` exposes `installMockWallet(page, { address, chainId? })` which:

1. Installs an EIP-1193-compliant provider on `window.ethereum` before the app boots (via `page.addInitScript`).
2. Announces the provider via EIP-6963 (`eip6963:announceProvider`) so Reown AppKit picks it up as a selectable connector.
3. Gates access correctly: `eth_accounts` returns `[]` until `eth_requestAccounts` succeeds, matching real wallet behavior (this is why the mock doesn't auto-connect on page load).
4. Records every RPC call on `window.__mockWalletCalls`; read them back with `getMockWalletCalls(page)` to assert on method ordering / params.

Supported RPC surface: `eth_requestAccounts`, `eth_accounts`, `eth_chainId`, `net_version`, `wallet_switchEthereumChain`, `wallet_addEthereumChain`, `wallet_get/requestPermissions`, `personal_sign`, `eth_sign`, `eth_signTypedData_v4`, `eth_sendTransaction`, `eth_sendRawTransaction`, `eth_blockNumber`, `eth_getBalance`, `eth_estimateGas`, `eth_gasPrice`. Signatures and tx hashes are deterministic fakes — this does **not** prove signature correctness, only that the flow doesn't crash.

Example:

```ts
import { installMockWallet, getMockWalletCalls } from './helpers/mock-wallet.js';

test('wallet flow', async ({ page }) => {
  await installMockWallet(page, { address: '0x1234...5678', chainId: 1 });
  await page.goto('/');
  await page.getByRole('button', { name: /^connect$/i }).click();
  await page.getByText('MockWallet').first().click();
  // Header now shows truncated address.
});
```

Extend the mock (not the tests) when a new RPC method is needed. The unsupported-method branch throws intentionally so silent regressions don't slip through.

## When adding a new test

- Put specs in `packages/web/e2e/*.spec.ts`.
- Build fresh per run — don't assume any persisted state.
- If a known-noisy console error creeps in (legitimate infra concern, not a code bug), extend `shouldIgnore()` in `smoke.spec.ts` with a specific-as-possible match.

## When NOT to use this

- Unit behavior — keep vitest component tests for form state, hooks, validation.
- Signature correctness — the mock returns deterministic fake sigs. Use the SDK's real test suite against Anvil to verify signing logic.
- Explicit accessibility audits — use `chrome-devtools-mcp:a11y-debugging` instead, which is richer for contrast and ARIA checks.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Error: page.goto: net::ERR_CONNECTION_REFUSED` | `vite preview` failed to start. Run `yarn build` locally to see the underlying build error. |
| Flake on `waitForTimeout(1500)` | Reown bootstrap took longer than usual. Bump the timeout or replace with an explicit `waitForResponse` on a known bootstrap request. |
| `Error: browserType.launch: Executable doesn't exist` | Run `npx playwright install chromium` once — the binary is cached outside the repo. |
| CI fails with playwright-report in artifacts | Open the HTML report: `npx playwright show-report packages/web/playwright-report`. |
