---
name: titrate-pulsechain-testnet
description: Use when deploying or testing the TitrateSimple/TitrateFull distributor contracts against a live public testnet, when verifying that a deployment flow works end-to-end with real gas and a real explorer, when asked to run the PulseChain v4 testnet E2E check, or when a change touches `packages/sdk/src/distributor/deploy.ts` / `verify.ts` / the contract sources and needs on-chain confirmation beyond Anvil. Runs the gated PulseChain v4 testnet harness: claims tPLS from the faucet, deploys a contract, asserts bytecode. Anvil covers correctness; this covers *that the deploy path actually works against a real EVM chain*.
---

# Titrate PulseChain v4 Testnet E2E

## Why

Anvil-based tests validate contract *behavior* in-process, but not the full deploy → verify round-trip against a real chain. PulseChain v4 testnet has:

- A public RPC with no API key required.
- A free faucet (`faucet.v4.testnet.pulsechain.com`) with no captcha or auth.
- A block explorer at `scan.v4.testnet.pulsechain.com` for the verify flow.
- Cheap gas — a full deploy + one disperse costs a small fraction of 1 tPLS.

That makes it the cheapest way to prove the entire `deployDistributor` → `verifyContract` pipeline is alive after a change.

## Run the gated test

From `packages/sdk`:

```bash
RUN_PULSECHAIN_E2E=1 npx vitest run src/__tests__/e2e-pulsechain-v4
```

The test:

1. Resolves a signer key (see "Reuse a funded account" below).
2. If balance < 0.5 tPLS, POSTs to the faucet and polls for funds.
3. Deploys `TitrateSimple` with `name: 'TokenAirdrop'`.
4. Asserts the receipt has a non-empty contract address and bytecode.

Skipped by default — `yarn test:all` stays fully offline.

## Reuse a funded account

The faucet cooldown has been observed as IP-based in practice, not per-address, so generating a fresh random key per run does **not** avoid rate-limit errors. The helper picks a signer in this order:

1. `options.privateKey` (explicit call-site override).
2. `PULSECHAIN_TESTNET_PRIVATE_KEY` environment variable.
3. Persisted mnemonic at `packages/sdk/.pulsechain-testnet.local.json` (gitignored).
4. Fresh random key (only useful for smoke-testing helpers — has no funds).

### Preferred: persisted mnemonic

Generate once — the mnemonic lives in a gitignored file, so the account is reused across every run:

```bash
cd packages/sdk
npx tsx scripts/gen-testnet-key.ts
```

The script prints the derived address. Fund it via the faucet (once the IP cooldown resets) or a direct transfer from another tPLS account, then every `RUN_PULSECHAIN_E2E=1` invocation reuses that account. The test keeps ≥ 0.5 tPLS on the account after each deploy, so one 10 tPLS top-up covers many runs.

### Alternative: env var only

```bash
openssl rand -hex 32  # → use the 0x-prefixed hex as the key

PULSECHAIN_TESTNET_PRIVATE_KEY=0x... \
  RUN_PULSECHAIN_E2E=1 npx vitest run src/__tests__/e2e-pulsechain-v4
```

## Faucet API (no auth)

```bash
# Info — returns faucet payout + account
curl https://faucet.v4.testnet.pulsechain.com/api/info

# Claim — POST FormData with address=0x...
curl -X POST https://faucet.v4.testnet.pulsechain.com/api/claim \
  -F address=0xYOUR_ADDRESS
```

Response body on success: a 0x-prefixed tx hash. Non-2xx means the faucet rejected (usually cooldown) — the response body explains why.

## Chain facts

| Field | Value |
|---|---|
| Chain ID | `943` |
| Native symbol | `tPLS` |
| RPC URL | `https://rpc.v4.testnet.pulsechain.com` |
| Explorer | `https://scan.v4.testnet.pulsechain.com` |
| Explorer API | `https://api.scan.v4.testnet.pulsechain.com/api` |
| Faucet | `https://faucet.v4.testnet.pulsechain.com` |
| Payout | `10 tPLS` per claim |

These match the `chainId === 943` entry in `packages/sdk/src/chains/config.ts`. Keep them in sync if the testnet migrates.

## Helper

`packages/sdk/src/__tests__/helpers/pulsechain-testnet.ts` exposes:

- `pulsechainV4Testnet` — viem `defineChain` descriptor.
- `createTestnetContext({ privateKey? })` — viem client pair + account.
- `claimFromFaucet(address)` — POSTs the faucet, returns tx hash, throws with the response body on failure.
- `waitForBalance(publicClient, address, { minBalance, timeoutMs? })` — polling helper.

Reuse these for any ad-hoc script. They're test-adjacent on purpose: they import from `__tests__/` and shouldn't leak into the shipped SDK.

## When the test fails

| Symptom | Likely cause |
|---|---|
| `Faucet claim failed (429): ...` | Observed as IP-based in practice; wait for cooldown or fund the persisted account via direct transfer. Generating a fresh random key does *not* help. |
| `Faucet returned unexpected body` | Faucet HTML page returned instead of tx hash — Heroku dyno cold-start or the faucet account is drained. Retry. |
| `Timed out waiting for ... balance` | Faucet tx hasn't confirmed in 60s. Check PulseScan for the tx, or bump `timeoutMs`. |
| Deploy hangs past 60s | Testnet RPC is slow or down. Try the `publicnode.com` mirror in chain config. |
| `code.length` ≤ 2 | Contract wasn't deployed (receipt reverted). Check the receipt's `status` field. |

## What this does *not* cover

- Explorer verification (`verifyContract`) — the PulseScan API exists but the gated test doesn't exercise it yet. Add a follow-up assertion if that path changes.
- Gas estimation on real mainnet — PulseChain fees are orders of magnitude smaller than Ethereum, so gas-sensitive code needs a mainnet-cost testnet (Sepolia) for realistic numbers.
- ERC-20 interactions — we only deploy + sanity-check bytecode. Full `disperse` flow is still Anvil-tested.
