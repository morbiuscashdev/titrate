---
name: titrate-dev-services
description: Use when starting work that touches SDK integration tests, Anvil-gated tests, disperse flows, scanner/pipeline code, or whenever tests report "skipped (Anvil not running)" or "SKIPPED (TRUEBLOCKS_URL not set)". Brings up local Anvil and optionally TrueBlocks so the ~51 gated SDK tests actually run instead of silently skipping. Also use when asked to run a full regression, produce accurate test counts, or verify the end-to-end integration test in `packages/tui/__tests__/integration/full-campaign.test.ts`.
---

# Titrate Dev Services (Anvil + TrueBlocks)

## Why

Without Anvil running, **51 SDK tests silently skip** via `describe.runIf(anvilUp)` and the TUI's full-campaign integration test registers as a no-op. Every "all tests pass" report is accurate only up to this gate — real regressions in disperse / scanner / pipeline paths can hide behind a skipped label.

## Start Anvil

```bash
# Foreground (blocks terminal — use a separate pane)
anvil

# Or background via `run_in_background: true` on the Bash tool
anvil --silent > /tmp/anvil.log 2>&1 &
```

Default endpoint: `http://127.0.0.1:8545`. Chain ID: `31337`.

## Verify Anvil is up

```bash
curl -s -X POST -H "content-type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_chainId","id":1}' \
  http://127.0.0.1:8545 | head -c 200
```

Expected: `{"jsonrpc":"2.0","id":1,"result":"0x7a69"}` (`0x7a69` = 31337 decimal).

The SDK's `anvilAvailable` probe at `packages/sdk/src/__tests__/anvil.ts` (or similar) runs this same check at import time and caches the result across test files.

## Start TrueBlocks (optional)

TrueBlocks needs to be installed separately (`brew install trueblocks` or `chifra`). Once installed:

```bash
chifra daemon --api :8080 &
# verify:
curl -s http://localhost:8080/status | head -c 200
```

Set `TRUEBLOCKS_URL=http://localhost:8080` before running tests that gate on it.

## Running the gated tests

```bash
# SDK — Anvil + TrueBlocks gated tests activate
cd packages/sdk && npx vitest run 2>&1 | tail -6

# TUI full-campaign integration test
cd packages/tui && ANVIL_RPC=http://127.0.0.1:8545 bun test __tests__/integration/full-campaign.test.ts
```

Compare the "skipped" count to the baseline (`51 skipped` when Anvil is down) — it should drop substantially when Anvil is up.

## Teardown

```bash
pkill -f "^anvil" 2>/dev/null || true
pkill -f "chifra daemon" 2>/dev/null || true
```

## When NOT to bother

- Working on pure-type additions (Phase 1a-style SDK work)
- Working on web-app UI not touching RPC (Phase 2 dashboard, CSS work, storybook-equivalent snapshots)
- Working on non-EVM code (docs, contracts-only Forge work)

In those cases the skipped tests aren't load-bearing for what you're changing, and the setup cost isn't worth it.
