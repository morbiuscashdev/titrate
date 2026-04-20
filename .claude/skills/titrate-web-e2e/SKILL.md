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

The filter in `shouldIgnore()` drops Chromium's "Failed to load resource" console errors (network-layer noise, already covered by response tracking in the test) so third-party 403s (Reown without a project-id allowlisted for `http://localhost:4173`) don't mask real regressions.

## When adding a new test

- Put specs in `packages/web/e2e/*.spec.ts`.
- Build fresh per run — don't assume any persisted state.
- If a known-noisy console error creeps in (legitimate infra concern, not a code bug), extend `shouldIgnore()` in `smoke.spec.ts` with a specific-as-possible match.

## When NOT to use this

- Unit behavior — keep vitest component tests for form state, hooks, validation.
- Wallet-connected flows — this harness has no wallet. Phase 2 would add a MetaMask mock (Synpress or an injected EIP-1193 shim). For now, every test runs viewer-mode.
- Explicit accessibility audits — use `chrome-devtools-mcp:a11y-debugging` instead, which is richer for contrast and ARIA checks.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Error: page.goto: net::ERR_CONNECTION_REFUSED` | `vite preview` failed to start. Run `yarn build` locally to see the underlying build error. |
| Flake on `waitForTimeout(1500)` | Reown bootstrap took longer than usual. Bump the timeout or replace with an explicit `waitForResponse` on a known bootstrap request. |
| `Error: browserType.launch: Executable doesn't exist` | Run `npx playwright install chromium` once — the binary is cached outside the repo. |
| CI fails with playwright-report in artifacts | Open the HTML report: `npx playwright show-report packages/web/playwright-report`. |
