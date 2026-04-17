---
name: titrate-subagent-context
description: Use before dispatching any subagent that will touch `packages/tui/` (OpenTUI React code) or consume `@titrate/sdk` types. Produces a standard context block to paste into the subagent's prompt covering known library-API quirks (OpenTUI prop shapes, bun:test APIs, test renderer), the `WalletRecord.encryptedKey` envelope schema, workspace layout, and runtime (Bun vs Node). Stops subagents from rediscovering the same facts each dispatch, which cost ~5-10 minutes per run during Phase 1.
---

# Titrate Subagent Context

Paste the relevant section(s) below into subagent prompts when dispatching implementation work. Each section covers a specific surface where Phase 1 subagents hit friction.

## When to include which section

| Task touches | Include sections |
|---|---|
| OpenTUI React components | [OpenTUI API](#opentui-react-api-quirks), [TUI runtime](#tui-runtime-bun-not-node), [Test renderer](#opentui-test-renderer) |
| SDK types / signers / providers | [SDK workspace](#sdk-workspace--type-resolution), [Wallet schema](#walletrecord-envelope-schema) |
| Storage / campaign dir | [Storage-campaign](#storage-campaign-package) |
| Tests under `bun test` | [bun:test API](#buntest-api-differences-from-vitest) |
| `--campaign` flag / CLI commands | [Wallet schema](#walletrecord-envelope-schema), [Decrypt flow](#loadfromcampaign-decrypt-flow) |

## OpenTUI React API quirks

The React reconciler installed as `@opentui/react` has prop shapes that differ from the plan's generic React examples:

- **`<box>` visibility**: use `visible={boolean}` — NOT `display='flex' | 'none'`. The `display` prop is not supported.
- **`<select>` options**: shape is `{ name: string; description: string; value?: string }` — NOT `{ label, value }`.
- **`<select>` onChange**: signature is `(index: number, option: SelectOption | null) => void`. Extract `option?.value` inside the handler.
- **`<input>` onChange**: receives a plain `string` (not a synthetic event).
- **`<text>` styling**: use nested modifier elements (`<span fg="gray">`, `<strong>`, `<em>`) — NOT `style={{ color: '...' }}` props directly on `<text>`.
- **JSX import source**: `packages/tui/tsconfig.json` sets `"jsxImportSource": "@opentui/react"` so intrinsics resolve. If adding a new TS package that uses OpenTUI JSX, set this in its tsconfig too.

Type imports: `import type { SelectOption } from '@opentui/core'` (not `@opentui/react`). Hooks like `useKeyboard` live in `@opentui/react`.

## OpenTUI test renderer

For snapshot tests of rendered screens:

```tsx
import { createTestRenderer } from '@opentui/core/testing';
import { createRoot } from '@opentui/react';

const { renderer, captureCharFrame } = await createTestRenderer({ width: 60, height: 20 });
createRoot(renderer).render(<App .../>);
await new Promise((r) => setTimeout(r, 50));  // let effects settle
expect(captureCharFrame()).toContain('expected text');
```

The API is `captureCharFrame()` — **NOT `snapshot()`**. The plan was written with vitest snapshot conventions in mind; OpenTUI diverges.

## TUI runtime (Bun, not Node)

`packages/tui` runs on Bun. `packages/sdk`, `packages/storage-*`, `packages/web` stay on Node.

- Entry point: `packages/tui/src/index.tsx` (`.tsx`, not `.ts` — contains JSX)
- Scripts: `bun run src/index.tsx`, `bun test`, `bun build`
- Installs: **use Yarn, not `bun install`** — the monorepo uses Yarn 4 workspaces. `yarn add --cwd packages/tui <pkg>` or edit `packages/tui/package.json` + `yarn install` at root.
- A lone `bun.lockb` inside `packages/tui/` is wrong — delete it if it appears.

## bun:test API differences from Vitest

| Vitest | bun:test equivalent |
|---|---|
| `import { describe, it, expect } from 'vitest'` | `import { test, expect } from 'bun:test'` (also `describe`, `beforeEach`, `afterEach`) |
| `describe.runIf(cond)(...)` | `if (cond) describe(...)` — top-level await + conditional registration |
| `test.skipIf(cond)(...)` | Same conditional pattern — `test.skipIf` doesn't exist in bun:test |
| `vi.mock(...)` | No direct equivalent — use DI / test fixtures instead |
| Vitest snapshot files | bun:test has no native snapshot files; use `expect(x).toBe(expected)` against literal strings |

## SDK workspace & type resolution

- All new public SDK types must be re-exported from `packages/sdk/src/index.ts`
- Consumers import via `import type { X } from '@titrate/sdk'` (workspace-resolved)
- After changing SDK types, **rebuild the dist**: `cd packages/sdk && npx tsc`. Downstream packages (`storage-campaign`, `tui`, `web`) read from `packages/sdk/dist/index.d.ts` — stale dist = phantom "type not exported" errors.
- See `titrate-dist-fresh` skill for the rebuild workflow.

## WalletRecord envelope schema

`WalletRecord.encryptedKey` is an **envelope object**, not a bare string:

```typescript
type EncryptedKeyEnvelope = {
  readonly ciphertext: string;   // base64
  readonly iv: string;           // base64
  readonly authTag: string;      // base64
};

// Inside WalletRecord:
readonly encryptedKey: EncryptedKeyEnvelope;
readonly kdf: 'scrypt';
readonly kdfParams: { N, r, p, salt };   // salt is base64
```

When constructing records, write:

```typescript
encryptedKey: { ciphertext: enc.ciphertext, iv: enc.iv, authTag: enc.authTag }
```

When decrypting, unpack:

```typescript
decryptPrivateKey({
  ciphertext: r.encryptedKey.ciphertext,
  iv: r.encryptedKey.iv,
  authTag: r.encryptedKey.authTag,
  kdf: r.kdf,
  kdfParams: r.kdfParams,
}, passphrase);
```

## Storage-campaign package

- Package path: `packages/storage-campaign/`
- Types point at `dist/index.d.ts` — same rebuild rule as SDK applies
- Factories: `createCampaignStorage(dir)` and `createSharedStorage(root)`
- **Call `storage.ensureDir()` before the first write** — the factory doesn't create the directory eagerly. `AppendableCSV.append` and `AppendableJSONL.append` assume the parent directory exists.
- BigInt fields (`cursor.scan.lastBlock`, `cursor.scan.endBlock`) serialize as decimal strings in JSON. Use `CursorStore.read()` to get them back as `bigint`.

## loadFromCampaign decrypt flow

The `--campaign <name>` flag on `distribute`, `sweep`, `collect` loads wallets via this pattern:

```typescript
const root = await resolveCampaignRoot({ folder });
const storage = createCampaignStorage(join(root, campaignName));
const manifest = await storage.manifest.read();
const rl = createInterface({ input: stdin, output: stdout });
const passphrase = await rl.question('Passphrase: ');
rl.close();
const records = await storage.wallets.readAll();
const privateKeys = await Promise.all(
  records.map((r) => decryptPrivateKey({
    ciphertext: r.encryptedKey.ciphertext,
    iv: r.encryptedKey.iv,
    authTag: r.encryptedKey.authTag,
    kdf: r.kdf,
    kdfParams: r.kdfParams,
  }, passphrase)),
);
```

`collect` skips the passphrase/decrypt step — it only scans addresses, doesn't sign.

## Monorepo discipline

- **Never commit to `master`** — always use a feature branch, open a PR
- **Yarn 4 is the package manager** — not npm, not bun install, not pnpm
- **Commit message format**: conventional commits (`type(scope): subject`). Examples: `feat(tui): ...`, `fix(sdk): ...`, `chore(storage-campaign): ...`
- **No AI attribution** in commits or PRs
