# Titrate

Offline-first airdrop platform for EVM chains.

## Monorepo

- `packages/contracts` — Solidity contracts (Foundry)
- `packages/sdk` — TypeScript SDK (Viem, Vitest)
- `packages/web` — Web app (Vite + React) — Phase 2
- `packages/tui` — Terminal UI — Phase 3

## Commands

- `forge test` — run contract tests (from packages/contracts)
- `npx vitest run` — run SDK tests (from packages/sdk)
- `npm test` — run all tests (from root)

## Conventions

- Functional patterns, no classes except where Viem requires them
- Pure functions, immutability, composition
- No `any` — use `unknown` at boundaries and narrow
- Strict mode always
- Conventional commits: `type(scope): subject`
