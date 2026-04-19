# Titrate

Offline-first airdrop platform for EVM chains.

## Monorepo

- `packages/contracts` — Solidity contracts (Foundry)
- `packages/sdk` — TypeScript SDK (Viem, Vitest, Node runtime)
- `packages/storage-fs` — filesystem storage adapter (Node)
- `packages/storage-idb` — IndexedDB storage adapter (browser)
- `packages/storage-campaign` — campaign-directory storage (Node) — `AppendableCSV`, `AppendableJSONL`, manifest / cursor / pipeline stores
- `packages/web` — Web app (Vite + React 19, Reown/wagmi, Tailwind v4)
- `packages/tui` — Terminal UI (Bun runtime, OpenTUI React, Commander)

## Runtime split

- **Bun**: `packages/tui` only (runtime + test runner)
- **Node**: everything else (sdk, storage-*, web)
- **Yarn 4** manages all installs workspace-wide; Bun is a runtime, not an installer

## Commands

- `forge test` — contract tests (from `packages/contracts`)
- `npx vitest run` — SDK / storage-* / web tests (from each package)
- `bun test` — TUI tests (from `packages/tui`)
- `yarn test:all` — full regression across every package (from root)
- `bun run src/index.tsx new <name>` — launch the TUI (from `packages/tui`)

## Conventions

- Functional patterns, no classes except where Viem requires them
- Pure functions, immutability, composition
- No `any` — use `unknown` at boundaries and narrow
- Strict mode always
- Conventional commits: `type(scope): subject`
- Never commit to `master` — feature branch + PR

## Skills (in `.claude/skills/`)

Auto-discovered during Claude Code sessions. Invoke the relevant one when its trigger matches:

- **`titrate-dispatch-checklist`** — pre/post-flight for subagent dispatches. Start here when implementing plan tasks.
- **`titrate-subagent-context`** — standard context blocks (OpenTUI quirks, bun:test differences, envelope schema). Paste relevant sections into subagent prompts.
- **`titrate-dist-fresh`** — rebuild `dist/` when downstream types fail to resolve. Run when the LSP / tsc reports "no exported member" for a type you just added.
- **`titrate-dev-services`** — bring up Anvil (and TrueBlocks) so the ~51 gated SDK tests actually run. Use before claiming a clean regression.
- **`titrate-tui-smoke`** — full launch-and-exit boot test for the TUI. Use after non-trivial TUI changes before marking the task done.
- **`titrate-mock-client`** — viem `PublicClient` mock fixture for TUI screen tests that consume `useClient()`.
- **`titrate-pulsechain-testnet`** — gated PulseChain v4 testnet E2E (faucet → deploy). Use after touching `deploy.ts` / `verify.ts` / contract sources to confirm the deploy path works against a real chain.

## Documentation layout

- `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` — design specs
- `docs/superpowers/plans/YYYY-MM-DD-<topic>.md` — implementation plans (checkbox-tracked)
- `docs/plans/` — older miscellaneous plans
- `progress.txt` — rolling checkpoint log

## Key architectural notes

- Campaign state lives in a directory: `<root>/<campaign-id>/{campaign.json, cursor.json, pipeline.json, addresses.csv, filtered.csv, wallets.jsonl, batches.jsonl, sweep.jsonl}`. See `docs/superpowers/specs/2026-04-15-campaign-lifecycle-design.md`.
- Hot-wallet private keys are always encrypted at rest with a user passphrase (scrypt + AES-GCM). `WalletRecord.encryptedKey` is a `{ ciphertext, iv, authTag }` envelope.
- RPC resolution walks a provider catalog: `valve.city` (universal EVM) → Alchemy (per-chain slug) → Infura (per-chain slug) → public RPC fallback. Provider API keys live in `AppSettings.providerKeys`.
- Derived hot wallets come from a one-time cold-wallet EIP-712 signature (paste, WalletConnect, or Ledger signer). Imported wallets skip this ceremony.
