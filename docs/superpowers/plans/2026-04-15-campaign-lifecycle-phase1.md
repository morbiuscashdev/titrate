# Campaign Lifecycle Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the TUI's one-shot clack wizard with a persistent, directory-scoped campaign workspace rendered via OpenTUI React on Bun. Add a unified wallet-encryption model (passphrase + scrypt + AES-GCM), an EIP-712 signer abstraction, and a templated RPC provider catalog.

**Architecture:** New `@titrate/storage-campaign` package provides append-only file primitives and JSON config stores. SDK gains type extensions (`CampaignManifest`, `WalletProvisioning`, `PipelineCursor`), a `PROVIDERS` catalog with templated URL builders, and an `EIP712Signer` abstraction. The TUI package switches runtime to Bun and interactive UI to OpenTUI React, replacing `@clack/prompts` + `ora` + Vitest.

**Tech Stack:** TypeScript 5.7, Bun 1.x, React 19, OpenTUI React, Commander, Viem, Vitest (SDK/storage-campaign), bun:test (TUI), scrypt, AES-GCM (WebCrypto).

**Testing Strategy:** SDK + storage-campaign use Vitest (Node). TUI uses `bun test` with `@opentui/core/testing` snapshots. Anvil-gated integration tests via `describe.runIf(anvilUp)`. Pure functions unit-tested before integration.

---

## File Structure Map

### Phase 1a — SDK Foundation

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/sdk/src/types.ts` | Modify | Add `CampaignStatus`, `WalletProvisioning`, `CampaignManifest`, `PipelineCursor`, `AppSettings.providerKeys` |
| `packages/sdk/src/storage/index.ts` | Modify | Add `WalletRecord`, `BatchRecord`, `SweepRecord` exports |
| `packages/sdk/src/chains/providers.ts` | Create | `RpcProvider` type, `PROVIDERS` catalog, `resolveRpcUrl`, `splitTemplate` |
| `packages/sdk/src/chains/config.ts` | Modify | Move valve templates out of `rpcUrls` (public-only list) |
| `packages/sdk/src/signers/types.ts` | Create | `EIP712Signer`, `SignerFactory` |
| `packages/sdk/src/signers/paste.ts` | Create | `createPasteSignerFactory` |
| `packages/sdk/src/signers/index.ts` | Create | Barrel re-exports |
| `packages/sdk/src/index.ts` | Modify | Export new modules |
| `packages/sdk/src/__tests__/types.test.ts` | Create | Type-shape smoke tests |
| `packages/sdk/src/__tests__/providers.test.ts` | Create | URL builder + resolver tests |
| `packages/sdk/src/__tests__/signers.test.ts` | Create | PasteSigner tests |

### Phase 1b — `@titrate/storage-campaign`

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/storage-campaign/package.json` | Create | Package manifest |
| `packages/storage-campaign/tsconfig.json` | Create | Extends `../../tsconfig.base.json` |
| `packages/storage-campaign/vitest.config.ts` | Create | Test config |
| `packages/storage-campaign/src/index.ts` | Create | `createCampaignStorage`, `createSharedStorage` factories |
| `packages/storage-campaign/src/types.ts` | Create | Package-internal types |
| `packages/storage-campaign/src/appendable-csv.ts` | Create | `AppendableCSV` primitive |
| `packages/storage-campaign/src/appendable-jsonl.ts` | Create | `AppendableJSONL<T>` primitive |
| `packages/storage-campaign/src/manifest-store.ts` | Create | `campaign.json` read/write |
| `packages/storage-campaign/src/cursor-store.ts` | Create | `cursor.json` read/write (BigInt-safe) |
| `packages/storage-campaign/src/pipeline-store.ts` | Create | `pipeline.json` read/write |
| `packages/storage-campaign/src/shared-storage.ts` | Create | `_shared/chains.json`, `_shared/settings.json` |
| `packages/storage-campaign/__tests__/*.test.ts` | Create | One test file per source file |

### Phase 1c — TUI Bun + OpenTUI Foundation

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/tui/package.json` | Modify | Bun runtime, OpenTUI/React deps, drop clack/ora/vitest |
| `packages/tui/tsconfig.json` | Modify | JSX: react-jsx, module: esnext, Bun types |
| `packages/tui/bunfig.toml` | Create | Bun test config |
| `packages/tui/src/index.tsx` | Create | Commander dispatch (replaces `src/index.ts`) |
| `packages/tui/src/index.ts` | Delete | Replaced by `.tsx` |
| `packages/tui/src/interactive/App.tsx` | Create | Root component, provider stack, screen router |
| `packages/tui/src/interactive/context.tsx` | Create | CampaignStorage, Manifest, Client, Intervention contexts |
| `packages/tui/src/interactive/step-status.ts` | Create | `deriveStepStates` pure fn |
| `packages/tui/src/interactive/screens/Dashboard.tsx` | Create | Step menu |
| `packages/tui/src/interactive/screens/CampaignSetup.tsx` | Create | Step 1 |
| `packages/tui/src/interactive/screens/Addresses.tsx` | Create | Step 2 |
| `packages/tui/src/interactive/screens/Filters.tsx` | Create | Step 3 |
| `packages/tui/src/interactive/screens/Amounts.tsx` | Create | Step 4 |
| `packages/tui/src/interactive/screens/Wallet.tsx` | Create | Step 5 |
| `packages/tui/src/interactive/screens/Distribute.tsx` | Create | Step 6 |
| `packages/tui/src/interactive/components/StepBadge.tsx` | Create | Status indicator |
| `packages/tui/src/interactive/components/ProviderKeyInput.tsx` | Create | Templated RPC input |
| `packages/tui/src/interactive/components/Spinner.tsx` | Create | `useTimeline` spinner |
| `packages/tui/src/interactive/components/InterventionOverlay.tsx` | Create | Pause/abort/continue modal |
| `packages/tui/src/utils/campaign-root.ts` | Create | Campaign root resolution |
| `packages/tui/src/utils/passphrase.ts` | Create | scrypt + AES-GCM helpers |

### Phase 1d — Command Wiring

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/tui/src/commands/new-campaign.ts` | Create | `titrate new <name>` |
| `packages/tui/src/commands/open-campaign.ts` | Create | `titrate open <name-or-path>` |
| `packages/tui/src/commands/list-campaigns.ts` | Create | `titrate list` |
| `packages/tui/src/commands/distribute.ts` | Modify | Add `--campaign` flag |
| `packages/tui/src/commands/sweep.ts` | Modify | Add `--campaign` flag |
| `packages/tui/src/commands/collect.ts` | Modify | Add `--campaign` flag |
| `packages/tui/src/interactive/wizard.ts` | Delete | Replaced |
| `packages/tui/src/interactive/steps/*.ts` | Delete | Replaced by React screens |
| `packages/tui/src/interactive/format.ts` | Delete | clack-specific |

### Phase 1e — Signer & Encryption

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/sdk/src/signers/walletconnect.ts` | Create | `createWalletConnectSignerFactory` |
| `packages/sdk/src/signers/ledger.ts` | Create | `createLedgerSignerFactory` (stretch) |
| `packages/tui/src/interactive/components/QRCode.tsx` | Create | Unicode-block QR renderer |
| `packages/tui/__tests__/integration/full-campaign.test.ts` | Create | Anvil end-to-end |

### Phase 1f — Regression

| File | Action | Responsibility |
|------|--------|----------------|
| `progress.txt` | Modify | Checkpoint |
| `package.json` (root) | Modify | Yarn workspace + test aggregation |

---

## Phase 1a — SDK Foundation

### Task 1: Add SDK types for `CampaignManifest`, `WalletProvisioning`, `PipelineCursor`

**Files:**
- Modify: `packages/sdk/src/types.ts`
- Test: `packages/sdk/src/__tests__/types.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/sdk/src/__tests__/types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type {
  CampaignManifest,
  CampaignStatus,
  WalletProvisioning,
  PipelineCursor,
} from '../types.js';
import type { Address } from 'viem';

describe('CampaignStatus', () => {
  it('accepts all lifecycle states', () => {
    const states: readonly CampaignStatus[] = [
      'configuring', 'ready', 'running', 'paused', 'completed', 'swept',
    ];
    expect(states).toHaveLength(6);
  });
});

describe('WalletProvisioning', () => {
  it('derived branch carries cold address + count + offset', () => {
    const p: WalletProvisioning = {
      mode: 'derived',
      coldAddress: '0x0000000000000000000000000000000000000001' as Address,
      walletCount: 3,
      walletOffset: 0,
    };
    expect(p.mode).toBe('derived');
    if (p.mode === 'derived') expect(p.walletCount).toBe(3);
  });

  it('imported branch carries only count', () => {
    const p: WalletProvisioning = { mode: 'imported', count: 2 };
    expect(p.mode).toBe('imported');
    if (p.mode === 'imported') expect(p.count).toBe(2);
  });
});

describe('CampaignManifest', () => {
  it('extends CampaignConfig with lifecycle fields', () => {
    const manifest: CampaignManifest = {
      funder: '0x0000000000000000000000000000000000000001' as Address,
      name: 'test',
      version: 1,
      chainId: 1,
      rpcUrl: 'https://rpc.example.com',
      tokenAddress: '0x0000000000000000000000000000000000000002' as Address,
      tokenDecimals: 18,
      contractAddress: null,
      contractVariant: 'simple',
      contractName: 'Test',
      amountMode: 'uniform',
      amountFormat: 'integer',
      uniformAmount: '1000000',
      batchSize: 200,
      campaignId: null,
      pinnedBlock: null,
      id: 'test-campaign',
      status: 'configuring',
      wallets: { mode: 'imported', count: 0 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    expect(manifest.status).toBe('configuring');
    expect(manifest.wallets.mode).toBe('imported');
  });
});

describe('PipelineCursor', () => {
  it('tracks watermarks for all three stages', () => {
    const cursor: PipelineCursor = {
      scan: { lastBlock: 18_000_000n, endBlock: null, addressCount: 0 },
      filter: { watermark: 0, qualifiedCount: 0 },
      distribute: { watermark: 0, confirmedCount: 0 },
    };
    expect(cursor.scan.endBlock).toBeNull();
    expect(typeof cursor.scan.lastBlock).toBe('bigint');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd packages/sdk && npx vitest run src/__tests__/types.test.ts`
Expected: FAIL — "Cannot find name 'CampaignManifest'" (or similar).

- [ ] **Step 3: Add types to `packages/sdk/src/types.ts`**

Append to the existing file:

```typescript
export type CampaignStatus =
  | 'configuring'
  | 'ready'
  | 'running'
  | 'paused'
  | 'completed'
  | 'swept';

export type WalletProvisioning =
  | {
      readonly mode: 'derived';
      readonly coldAddress: Address;
      readonly walletCount: number;
      readonly walletOffset: number;
    }
  | {
      readonly mode: 'imported';
      readonly count: number;
    };

export type CampaignManifest = CampaignConfig & {
  readonly id: string;
  readonly status: CampaignStatus;
  readonly wallets: WalletProvisioning;
  readonly createdAt: number;
  readonly updatedAt: number;
};

export type PipelineCursor = {
  readonly scan: {
    readonly lastBlock: bigint;
    readonly endBlock: bigint | null;
    readonly addressCount: number;
  };
  readonly filter: {
    readonly watermark: number;
    readonly qualifiedCount: number;
  };
  readonly distribute: {
    readonly watermark: number;
    readonly confirmedCount: number;
  };
};
```

- [ ] **Step 4: Export the new types from `packages/sdk/src/index.ts`**

Add to the existing exports:

```typescript
export type {
  CampaignStatus,
  WalletProvisioning,
  CampaignManifest,
  PipelineCursor,
} from './types.js';
```

- [ ] **Step 5: Run test to verify pass**

Run: `cd packages/sdk && npx vitest run src/__tests__/types.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/types.ts packages/sdk/src/index.ts packages/sdk/src/__tests__/types.test.ts
git commit -m "feat(sdk): add CampaignManifest, WalletProvisioning, PipelineCursor types"
```

---

### Task 2: Add JSONL record types (`WalletRecord`, `BatchRecord`, `SweepRecord`)

**Files:**
- Modify: `packages/sdk/src/storage/index.ts`
- Modify: `packages/sdk/src/index.ts`
- Test: `packages/sdk/src/__tests__/storage-records.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/sdk/src/__tests__/storage-records.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type {
  WalletRecord,
  BatchRecord,
  SweepRecord,
} from '../storage/index.js';
import type { Address, Hex } from 'viem';

describe('WalletRecord', () => {
  it('derived branch carries coldAddress + derivationIndex', () => {
    const record: WalletRecord = {
      index: 0,
      address: '0x0000000000000000000000000000000000000001' as Address,
      encryptedKey: 'ciphertext-base64',
      kdf: 'scrypt',
      kdfParams: { N: 131072, r: 8, p: 1, salt: 'salt-base64' },
      provenance: {
        type: 'derived',
        coldAddress: '0x0000000000000000000000000000000000000002' as Address,
        derivationIndex: 0,
      },
      createdAt: Date.now(),
    };
    expect(record.provenance.type).toBe('derived');
  });

  it('imported branch has type only', () => {
    const record: WalletRecord = {
      index: 0,
      address: '0x0000000000000000000000000000000000000001' as Address,
      encryptedKey: 'ciphertext-base64',
      kdf: 'scrypt',
      kdfParams: { N: 131072, r: 8, p: 1, salt: 'salt-base64' },
      provenance: { type: 'imported' },
      createdAt: Date.now(),
    };
    expect(record.provenance.type).toBe('imported');
  });
});

describe('BatchRecord', () => {
  it('serializes amounts as decimal strings (BigInt-safe)', () => {
    const record: BatchRecord = {
      batchIndex: 0,
      recipients: ['0x0000000000000000000000000000000000000001' as Address],
      amounts: ['1000000000000000000'],
      status: 'confirmed',
      confirmedTxHash: '0xabc' as Hex,
      confirmedBlock: '18000000',
      createdAt: Date.now(),
    };
    expect(record.status).toBe('confirmed');
    expect(typeof record.amounts[0]).toBe('string');
  });
});

describe('SweepRecord', () => {
  it('carries per-wallet sweep outcome', () => {
    const record: SweepRecord = {
      walletIndex: 0,
      walletAddress: '0x0000000000000000000000000000000000000001' as Address,
      balance: '5000000000000000',
      txHash: '0xdef' as Hex,
      error: null,
      createdAt: Date.now(),
    };
    expect(record.error).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — expect failure**

Run: `cd packages/sdk && npx vitest run src/__tests__/storage-records.test.ts`
Expected: FAIL — types undefined.

- [ ] **Step 3: Add types to `packages/sdk/src/storage/index.ts`**

Append:

```typescript
export type WalletRecord = {
  readonly index: number;
  readonly address: Address;
  readonly encryptedKey: string;
  readonly kdf: 'scrypt';
  readonly kdfParams: {
    readonly N: number;
    readonly r: number;
    readonly p: number;
    readonly salt: string;
  };
  readonly provenance:
    | {
        readonly type: 'derived';
        readonly coldAddress: Address;
        readonly derivationIndex: number;
      }
    | { readonly type: 'imported' };
  readonly createdAt: number;
};

export type BatchRecord = {
  readonly batchIndex: number;
  readonly recipients: readonly Address[];
  readonly amounts: readonly string[];  // decimal-string BigInt
  readonly status: 'pending' | 'broadcast' | 'confirmed' | 'failed';
  readonly confirmedTxHash: Hex | null;
  readonly confirmedBlock: string | null;  // decimal-string BigInt
  readonly createdAt: number;
};

export type SweepRecord = {
  readonly walletIndex: number;
  readonly walletAddress: Address;
  readonly balance: string;            // decimal-string BigInt
  readonly txHash: Hex | null;
  readonly error: string | null;
  readonly createdAt: number;
};
```

Add the import at the top of the file if not already present:

```typescript
import type { Address, Hex } from 'viem';
```

- [ ] **Step 4: Re-export from `packages/sdk/src/index.ts`**

```typescript
export type {
  WalletRecord,
  BatchRecord,
  SweepRecord,
} from './storage/index.js';
```

- [ ] **Step 5: Run test — expect pass**

Run: `cd packages/sdk && npx vitest run src/__tests__/storage-records.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/storage/index.ts packages/sdk/src/index.ts packages/sdk/src/__tests__/storage-records.test.ts
git commit -m "feat(sdk): add WalletRecord, BatchRecord, SweepRecord JSONL types"
```

---

### Task 3: RPC provider catalog — `PROVIDERS`, `resolveRpcUrl`, `splitTemplate`

**Files:**
- Create: `packages/sdk/src/chains/providers.ts`
- Modify: `packages/sdk/src/index.ts`
- Test: `packages/sdk/src/__tests__/providers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/sdk/src/__tests__/providers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  PROVIDERS,
  getProvider,
  resolveRpcUrl,
  splitTemplate,
} from '../chains/providers.js';

describe('PROVIDERS catalog', () => {
  it('exposes valve, alchemy, infura, public, custom', () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(ids).toContain('valve');
    expect(ids).toContain('alchemy');
    expect(ids).toContain('infura');
    expect(ids).toContain('public');
    expect(ids).toContain('custom');
  });
});

describe('valve.city URL builder', () => {
  it('uses chainId directly in subdomain', () => {
    const valve = getProvider('valve');
    expect(valve.buildUrl(369, 'vk_demo')).toBe('https://evm369.rpc.valve.city/v1/vk_demo');
    expect(valve.buildUrl(1, 'vk_abc')).toBe('https://evm1.rpc.valve.city/v1/vk_abc');
  });

  it('supports any EVM chain', () => {
    const valve = getProvider('valve');
    expect(valve.buildUrl(42161, 'key')).toBe('https://evm42161.rpc.valve.city/v1/key');
    expect(valve.buildUrl(8453, 'key')).toBe('https://evm8453.rpc.valve.city/v1/key');
  });
});

describe('alchemy URL builder', () => {
  it('returns slug-based URL for supported chains', () => {
    const alchemy = getProvider('alchemy');
    expect(alchemy.buildUrl(1, 'k')).toBe('https://eth-mainnet.g.alchemy.com/v2/k');
  });

  it('returns null for unsupported chains', () => {
    const alchemy = getProvider('alchemy');
    expect(alchemy.buildUrl(369, 'k')).toBeNull();
  });
});

describe('resolveRpcUrl', () => {
  it('prefers valve key when set', () => {
    const url = resolveRpcUrl(1, { providerKeys: { valve: 'vk_1' } }, ['https://public.example/rpc']);
    expect(url).toBe('https://evm1.rpc.valve.city/v1/vk_1');
  });

  it('falls back to alchemy if no valve key', () => {
    const url = resolveRpcUrl(1, { providerKeys: { alchemy: 'ak_1' } }, ['https://public.example/rpc']);
    expect(url).toBe('https://eth-mainnet.g.alchemy.com/v2/ak_1');
  });

  it('falls back to public rpc when no provider keys match', () => {
    const url = resolveRpcUrl(369, { providerKeys: { alchemy: 'ak_1' } }, ['https://rpc.pulsechain.com']);
    expect(url).toBe('https://rpc.pulsechain.com');
  });
});

describe('splitTemplate', () => {
  it('splits valve template into prefix + suffix', () => {
    const { prefix, suffix } = splitTemplate('valve', 369);
    expect(prefix).toBe('https://evm369.rpc.valve.city/v1/');
    expect(suffix).toBe('');
  });

  it('splits alchemy template into prefix + suffix', () => {
    const { prefix, suffix } = splitTemplate('alchemy', 1);
    expect(prefix).toBe('https://eth-mainnet.g.alchemy.com/v2/');
    expect(suffix).toBe('');
  });
});
```

- [ ] **Step 2: Run test — expect failure**

Run: `cd packages/sdk && npx vitest run src/__tests__/providers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/sdk/src/chains/providers.ts`**

```typescript
/**
 * RPC provider catalog — templated URL builders for known paid RPC services.
 *
 * Usage: pick a provider, call buildUrl(chainId, key). Returns null if the
 * provider doesn't support the chain. See resolveRpcUrl() for priority-based
 * selection across providers + public fallbacks.
 */

export type ProviderId = 'valve' | 'alchemy' | 'infura' | 'public' | 'custom';

export type RpcProvider = {
  readonly id: ProviderId;
  readonly name: string;
  readonly helpUrl: string;
  readonly requiresKey: boolean;
  readonly buildUrl: (chainId: number, key: string) => string | null;
};

const ALCHEMY_SLUGS: Record<number, string> = {
  1: 'eth-mainnet',
  8453: 'base-mainnet',
  42161: 'arb-mainnet',
  11155111: 'eth-sepolia',
  84532: 'base-sepolia',
  421614: 'arb-sepolia',
};

const INFURA_SLUGS: Record<number, string> = {
  1: 'mainnet',
  42161: 'arbitrum-mainnet',
  11155111: 'sepolia',
};

export const PROVIDERS: readonly RpcProvider[] = [
  {
    id: 'valve',
    name: 'valve.city',
    helpUrl: 'https://valve.city',
    requiresKey: true,
    buildUrl: (chainId, key) => `https://evm${chainId}.rpc.valve.city/v1/${key}`,
  },
  {
    id: 'alchemy',
    name: 'Alchemy',
    helpUrl: 'https://alchemy.com',
    requiresKey: true,
    buildUrl: (chainId, key) => {
      const slug = ALCHEMY_SLUGS[chainId];
      return slug ? `https://${slug}.g.alchemy.com/v2/${key}` : null;
    },
  },
  {
    id: 'infura',
    name: 'Infura',
    helpUrl: 'https://infura.io',
    requiresKey: true,
    buildUrl: (chainId, key) => {
      const slug = INFURA_SLUGS[chainId];
      return slug ? `https://${slug}.infura.io/v3/${key}` : null;
    },
  },
  {
    id: 'public',
    name: 'Public',
    helpUrl: '',
    requiresKey: false,
    buildUrl: () => null,
  },
  {
    id: 'custom',
    name: 'Custom URL',
    helpUrl: '',
    requiresKey: false,
    buildUrl: () => null,
  },
];

export function getProvider(id: ProviderId): RpcProvider {
  const p = PROVIDERS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}

export type ProviderKeys = {
  readonly valve?: string;
  readonly alchemy?: string;
  readonly infura?: string;
};

/**
 * Resolve an RPC URL for a chain given provider keys and public fallbacks.
 * Priority: valve → alchemy → infura → publicRpcUrls[0].
 */
export function resolveRpcUrl(
  chainId: number,
  settings: { readonly providerKeys: ProviderKeys },
  publicRpcUrls: readonly string[],
): string {
  const keys = settings.providerKeys;
  if (keys.valve) {
    const url = getProvider('valve').buildUrl(chainId, keys.valve);
    if (url) return url;
  }
  if (keys.alchemy) {
    const url = getProvider('alchemy').buildUrl(chainId, keys.alchemy);
    if (url) return url;
  }
  if (keys.infura) {
    const url = getProvider('infura').buildUrl(chainId, keys.infura);
    if (url) return url;
  }
  if (publicRpcUrls.length === 0) {
    throw new Error(`No RPC URL available for chain ${chainId}`);
  }
  return publicRpcUrls[0];
}

/**
 * Split a provider's URL template into prefix and suffix around the key slot.
 * Used by the templated input UI to render fixed zones around an editable key field.
 */
export function splitTemplate(id: ProviderId, chainId: number): { prefix: string; suffix: string } {
  const url = getProvider(id).buildUrl(chainId, '\x00');
  if (!url) return { prefix: '', suffix: '' };
  const idx = url.indexOf('\x00');
  return { prefix: url.slice(0, idx), suffix: url.slice(idx + 1) };
}
```

- [ ] **Step 4: Export from `packages/sdk/src/index.ts`**

```typescript
export {
  PROVIDERS,
  getProvider,
  resolveRpcUrl,
  splitTemplate,
} from './chains/providers.js';
export type { ProviderId, RpcProvider, ProviderKeys } from './chains/providers.js';
```

- [ ] **Step 5: Run test — expect pass**

Run: `cd packages/sdk && npx vitest run src/__tests__/providers.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/chains/providers.ts packages/sdk/src/index.ts packages/sdk/src/__tests__/providers.test.ts
git commit -m "feat(sdk): add RPC provider catalog with valve.city, Alchemy, Infura"
```

---

### Task 4: Add `AppSettings.providerKeys`

**Files:**
- Modify: `packages/sdk/src/types.ts` (if `AppSettings` defined there) or `packages/sdk/src/storage/app-settings.ts`

- [ ] **Step 1: Locate `AppSettings` type**

Run: `cd packages/sdk && grep -rn "AppSettings" src/ | head -10`
Expected: a file defining `AppSettings`. If absent (TUI may have used a local type), add to `src/types.ts`.

- [ ] **Step 2: Write failing test**

Create or extend `packages/sdk/src/__tests__/app-settings.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { AppSettings } from '../types.js';

describe('AppSettings.providerKeys', () => {
  it('accepts an object with optional valve/alchemy/infura fields', () => {
    const settings: AppSettings = {
      providerKeys: { valve: 'vk_1' },
    };
    expect(settings.providerKeys.valve).toBe('vk_1');
  });

  it('accepts an empty providerKeys object', () => {
    const settings: AppSettings = { providerKeys: {} };
    expect(settings.providerKeys).toEqual({});
  });
});
```

- [ ] **Step 3: Run — expect failure**

Run: `cd packages/sdk && npx vitest run src/__tests__/app-settings.test.ts`
Expected: FAIL — `AppSettings` not exported, or missing `providerKeys`.

- [ ] **Step 4: Add or extend `AppSettings` in `packages/sdk/src/types.ts`**

If `AppSettings` doesn't exist, add:

```typescript
export type AppSettings = {
  readonly providerKeys: {
    readonly valve?: string;
    readonly alchemy?: string;
    readonly infura?: string;
  };
};
```

If it exists elsewhere (e.g. `src/storage/app-settings.ts`), add the `providerKeys` field there instead, preserving all existing fields.

- [ ] **Step 5: Export**

Add to `packages/sdk/src/index.ts` if not already:

```typescript
export type { AppSettings } from './types.js';
```

- [ ] **Step 6: Run — expect pass**

Run: `cd packages/sdk && npx vitest run src/__tests__/app-settings.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/sdk/src/types.ts packages/sdk/src/index.ts packages/sdk/src/__tests__/app-settings.test.ts
git commit -m "feat(sdk): add providerKeys to AppSettings"
```

---

### Task 5: EIP-712 Signer abstraction + `PasteSigner`

**Files:**
- Create: `packages/sdk/src/signers/types.ts`
- Create: `packages/sdk/src/signers/paste.ts`
- Create: `packages/sdk/src/signers/index.ts`
- Modify: `packages/sdk/src/index.ts`
- Test: `packages/sdk/src/__tests__/signers.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/sdk/src/__tests__/signers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import type { TypedDataDefinition } from 'viem';
import {
  createPasteSignerFactory,
  type EIP712Signer,
} from '../signers/index.js';

const TYPED_DATA: TypedDataDefinition = {
  domain: { name: 'Titrate', version: '1', chainId: 1 },
  types: {
    StorageEncryption: [{ name: 'campaignId', type: 'string' }],
  },
  primaryType: 'StorageEncryption',
  message: { campaignId: 'test-campaign' },
};

describe('PasteSigner', () => {
  it('round-trips an externally-produced signature', async () => {
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    const signature = await account.signTypedData(TYPED_DATA);

    const factory = createPasteSignerFactory({
      coldAddress: account.address,
      readSignature: async () => signature,
    });
    expect(await factory.available()).toBe(true);
    const signer: EIP712Signer = await factory.create();
    expect(await signer.getAddress()).toBe(account.address);
    expect(await signer.signTypedData(TYPED_DATA)).toBe(signature);
  });

  it('rejects a signature that does not recover to the declared cold address', async () => {
    const pkA = generatePrivateKey();
    const pkB = generatePrivateKey();
    const accountA = privateKeyToAccount(pkA);
    const accountB = privateKeyToAccount(pkB);
    const signatureFromB = await accountB.signTypedData(TYPED_DATA);

    const factory = createPasteSignerFactory({
      coldAddress: accountA.address,
      readSignature: async () => signatureFromB,
    });
    const signer = await factory.create();
    await expect(signer.signTypedData(TYPED_DATA)).rejects.toThrow(/recovered address/i);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `cd packages/sdk && npx vitest run src/__tests__/signers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `packages/sdk/src/signers/types.ts`**

```typescript
import type { Address, Hex, TypedDataDefinition } from 'viem';

export type EIP712Signer = {
  readonly getAddress: () => Promise<Address>;
  readonly signTypedData: (payload: TypedDataDefinition) => Promise<Hex>;
  readonly close?: () => Promise<void>;
};

export type SignerFactoryId = 'paste' | 'walletconnect' | 'ledger';

export type SignerFactory = {
  readonly id: SignerFactoryId;
  readonly label: string;
  readonly available: () => Promise<boolean>;
  readonly create: () => Promise<EIP712Signer>;
};
```

- [ ] **Step 4: Create `packages/sdk/src/signers/paste.ts`**

```typescript
import { recoverTypedDataAddress, isAddressEqual, type Address, type Hex, type TypedDataDefinition } from 'viem';
import type { EIP712Signer, SignerFactory } from './types.js';

export type PasteSignerOptions = {
  readonly coldAddress: Address;
  /** Prompt the user for a pasted 0x-prefixed signature and return it. */
  readonly readSignature: (payload: TypedDataDefinition) => Promise<Hex>;
};

/**
 * Factory for a "paste a signature" signer. The user signs the EIP-712 payload
 * externally (web app, `cast wallet sign-typed-data`, etc.) and pastes the
 * resulting hex signature back into the TUI. Verifies that the signature
 * recovers to the declared cold address before accepting.
 */
export function createPasteSignerFactory(options: PasteSignerOptions): SignerFactory {
  const signer: EIP712Signer = {
    async getAddress() {
      return options.coldAddress;
    },
    async signTypedData(payload) {
      const signature = await options.readSignature(payload);
      const recovered = await recoverTypedDataAddress({ ...payload, signature });
      if (!isAddressEqual(recovered, options.coldAddress)) {
        throw new Error(
          `Signature verification failed: recovered address ${recovered} does not match cold address ${options.coldAddress}`,
        );
      }
      return signature;
    },
  };
  return {
    id: 'paste',
    label: 'Paste signature',
    available: async () => true,
    create: async () => signer,
  };
}
```

- [ ] **Step 5: Create `packages/sdk/src/signers/index.ts`**

```typescript
export type { EIP712Signer, SignerFactory, SignerFactoryId } from './types.js';
export { createPasteSignerFactory, type PasteSignerOptions } from './paste.js';
```

- [ ] **Step 6: Export from `packages/sdk/src/index.ts`**

```typescript
export * from './signers/index.js';
```

- [ ] **Step 7: Run — expect pass**

Run: `cd packages/sdk && npx vitest run src/__tests__/signers.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 8: Commit**

```bash
git add packages/sdk/src/signers packages/sdk/src/index.ts packages/sdk/src/__tests__/signers.test.ts
git commit -m "feat(sdk): add EIP712Signer abstraction + PasteSigner implementation"
```

---

## Phase 1b — `@titrate/storage-campaign` Package

### Task 6: Scaffold `@titrate/storage-campaign`

**Files:**
- Create: `packages/storage-campaign/package.json`
- Create: `packages/storage-campaign/tsconfig.json`
- Create: `packages/storage-campaign/vitest.config.ts`
- Create: `packages/storage-campaign/src/index.ts` (empty stub)

- [ ] **Step 1: Create directory**

```bash
mkdir -p packages/storage-campaign/src packages/storage-campaign/__tests__
```

- [ ] **Step 2: Write `packages/storage-campaign/package.json`**

```json
{
  "name": "@titrate/storage-campaign",
  "version": "0.0.1",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@titrate/sdk": "0.0.1",
    "viem": "^2.23.2"
  },
  "devDependencies": {
    "@types/node": "^25.5.0",
    "typescript": "^5.7.3",
    "vitest": "^4.1.1"
  }
}
```

- [ ] **Step 3: Write `packages/storage-campaign/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Write `packages/storage-campaign/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 5: Write initial `packages/storage-campaign/src/index.ts`**

```typescript
// Entry point — real exports added in Task 10.
export {};
```

- [ ] **Step 6: Add workspace entry** (if root `package.json` uses `workspaces`)

```bash
# Verify the packages/* glob is already present in root package.json
cd /Users/michaelmclaughlin/Documents/morbius/github/titrate
grep -A2 '"workspaces"' package.json
```

Expected: shows `"packages/*"` glob. If explicit list, add `"packages/storage-campaign"`.

- [ ] **Step 7: Install (yarn)**

```bash
cd /Users/michaelmclaughlin/Documents/morbius/github/titrate
yarn install
```

Expected: workspace discovered, no install errors.

- [ ] **Step 8: Verify build + test harness**

```bash
cd packages/storage-campaign
npx tsc --noEmit
npx vitest run
```

Expected: tsc clean, vitest reports "No test files found" (not an error — just empty).

- [ ] **Step 9: Commit**

```bash
git add packages/storage-campaign package.json yarn.lock
git commit -m "feat(storage-campaign): scaffold empty package"
```

---

### Task 7: `AppendableCSV` primitive

**Files:**
- Create: `packages/storage-campaign/src/appendable-csv.ts`
- Test: `packages/storage-campaign/__tests__/appendable-csv.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/storage-campaign/__tests__/appendable-csv.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppendableCSV, type CSVRow } from '../src/appendable-csv.js';

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'titrate-csv-'));
  path = join(dir, 'addresses.csv');
});

describe('AppendableCSV', () => {
  it('appends rows and persists them with a newline per row', async () => {
    const csv = createAppendableCSV(path);
    await csv.append([
      { address: '0x1', amount: '100' },
      { address: '0x2', amount: null },
    ]);
    const raw = await readFile(path, 'utf8');
    expect(raw).toBe('0x1,100\n0x2,\n');
    await rm(dir, { recursive: true });
  });

  it('count() returns total line count', async () => {
    const csv = createAppendableCSV(path);
    await csv.append([
      { address: '0x1', amount: null },
      { address: '0x2', amount: null },
      { address: '0x3', amount: null },
    ]);
    expect(await csv.count()).toBe(3);
    await rm(dir, { recursive: true });
  });

  it('count() returns 0 for a missing file', async () => {
    const csv = createAppendableCSV(path);
    expect(await csv.count()).toBe(0);
    await rm(dir, { recursive: true });
  });

  it('readFrom(offset) streams rows starting at the given line number', async () => {
    const csv = createAppendableCSV(path);
    await csv.append([
      { address: '0xa', amount: null },
      { address: '0xb', amount: null },
      { address: '0xc', amount: null },
    ]);
    const rows: CSVRow[] = [];
    for await (const row of csv.readFrom(1)) rows.push(row);
    expect(rows.map((r) => r.address)).toEqual(['0xb', '0xc']);
    await rm(dir, { recursive: true });
  });

  it('handles empty-amount rows correctly on readFrom', async () => {
    const csv = createAppendableCSV(path);
    await csv.append([{ address: '0xa', amount: null }]);
    const rows: CSVRow[] = [];
    for await (const row of csv.readFrom(0)) rows.push(row);
    expect(rows[0]).toEqual({ address: '0xa', amount: null });
    await rm(dir, { recursive: true });
  });

  it('append with zero rows is a no-op', async () => {
    const csv = createAppendableCSV(path);
    await csv.append([]);
    expect(await csv.count()).toBe(0);
    await rm(dir, { recursive: true });
  });

  it('handles a large batch (10k rows) without truncation', async () => {
    const csv = createAppendableCSV(path);
    const rows: CSVRow[] = Array.from({ length: 10_000 }, (_, i) => ({
      address: `0x${i.toString(16).padStart(40, '0')}`,
      amount: null,
    }));
    await csv.append(rows);
    expect(await csv.count()).toBe(10_000);
    await rm(dir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `cd packages/storage-campaign && npx vitest run __tests__/appendable-csv.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/storage-campaign/src/appendable-csv.ts`**

```typescript
import { appendFile, readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

export type CSVRow = {
  readonly address: string;
  readonly amount: string | null;
};

export type AppendableCSV = {
  readonly append: (rows: readonly CSVRow[]) => Promise<void>;
  readonly readFrom: (lineOffset: number) => AsyncIterable<CSVRow>;
  readonly count: () => Promise<number>;
};

function rowToLine(row: CSVRow): string {
  return `${row.address},${row.amount ?? ''}`;
}

function parseLine(line: string): CSVRow {
  const commaIdx = line.indexOf(',');
  if (commaIdx === -1) {
    return { address: line, amount: null };
  }
  const address = line.slice(0, commaIdx);
  const amount = line.slice(commaIdx + 1);
  return { address, amount: amount === '' ? null : amount };
}

/**
 * Append-only CSV file optimized for streaming. No header row; each line is
 * `<address>,<amount?>`. Safe to call append() concurrently — node's
 * fs.appendFile is atomic on POSIX. count() is not cached in memory
 * (re-scans on each call) — callers should cache if invoked hot.
 */
export function createAppendableCSV(path: string): AppendableCSV {
  return {
    async append(rows) {
      if (rows.length === 0) return;
      const buf = rows.map(rowToLine).join('\n') + '\n';
      await appendFile(path, buf, 'utf8');
    },
    async count() {
      try {
        const s = await stat(path);
        if (s.size === 0) return 0;
        const data = await readFile(path, 'utf8');
        // Count newlines. The last line always ends with \n (we write it that way).
        let n = 0;
        for (let i = 0; i < data.length; i++) {
          if (data.charCodeAt(i) === 10) n++;
        }
        return n;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 0;
        throw err;
      }
    },
    readFrom(lineOffset) {
      async function* gen(): AsyncIterable<CSVRow> {
        try {
          await stat(path);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
          throw err;
        }
        const stream = createReadStream(path, { encoding: 'utf8' });
        const rl = createInterface({ input: stream, crlfDelay: Infinity });
        let i = 0;
        for await (const line of rl) {
          if (i >= lineOffset && line.length > 0) {
            yield parseLine(line);
          }
          i++;
        }
      }
      return gen();
    },
  };
}
```

- [ ] **Step 4: Run — expect pass**

Run: `cd packages/storage-campaign && npx vitest run __tests__/appendable-csv.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/storage-campaign/src/appendable-csv.ts packages/storage-campaign/__tests__/appendable-csv.test.ts
git commit -m "feat(storage-campaign): add AppendableCSV primitive"
```

---

### Task 8: `AppendableJSONL<T>` primitive

**Files:**
- Create: `packages/storage-campaign/src/appendable-jsonl.ts`
- Test: `packages/storage-campaign/__tests__/appendable-jsonl.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/storage-campaign/__tests__/appendable-jsonl.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppendableJSONL } from '../src/appendable-jsonl.js';

type Record = { readonly a: number; readonly b: string };

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'titrate-jsonl-'));
  path = join(dir, 'records.jsonl');
});

describe('AppendableJSONL', () => {
  it('appends records as one JSON per line', async () => {
    const jsonl = createAppendableJSONL<Record>(path);
    await jsonl.append([
      { a: 1, b: 'one' },
      { a: 2, b: 'two' },
    ]);
    const raw = await readFile(path, 'utf8');
    expect(raw).toBe('{"a":1,"b":"one"}\n{"a":2,"b":"two"}\n');
    await rm(dir, { recursive: true });
  });

  it('readAll returns all records', async () => {
    const jsonl = createAppendableJSONL<Record>(path);
    await jsonl.append([{ a: 1, b: 'one' }, { a: 2, b: 'two' }]);
    const all = await jsonl.readAll();
    expect(all).toEqual([
      { a: 1, b: 'one' },
      { a: 2, b: 'two' },
    ]);
    await rm(dir, { recursive: true });
  });

  it('readFrom(offset) skips the first N records', async () => {
    const jsonl = createAppendableJSONL<Record>(path);
    await jsonl.append([
      { a: 1, b: 'one' },
      { a: 2, b: 'two' },
      { a: 3, b: 'three' },
    ]);
    const rows: Record[] = [];
    for await (const r of jsonl.readFrom(1)) rows.push(r);
    expect(rows).toEqual([
      { a: 2, b: 'two' },
      { a: 3, b: 'three' },
    ]);
    await rm(dir, { recursive: true });
  });

  it('count() returns 0 when file missing', async () => {
    const jsonl = createAppendableJSONL<Record>(path);
    expect(await jsonl.count()).toBe(0);
    await rm(dir, { recursive: true });
  });

  it('count() returns number of records', async () => {
    const jsonl = createAppendableJSONL<Record>(path);
    await jsonl.append([{ a: 1, b: 'x' }, { a: 2, b: 'y' }]);
    expect(await jsonl.count()).toBe(2);
    await rm(dir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `cd packages/storage-campaign && npx vitest run __tests__/appendable-jsonl.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/storage-campaign/src/appendable-jsonl.ts`**

```typescript
import { appendFile, stat, readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

export type AppendableJSONL<T> = {
  readonly append: (records: readonly T[]) => Promise<void>;
  readonly readFrom: (lineOffset: number) => AsyncIterable<T>;
  readonly readAll: () => Promise<readonly T[]>;
  readonly count: () => Promise<number>;
};

/**
 * Append-only JSONL file. Each record is serialized as a single-line JSON
 * record followed by \n. Consumers are expected to handle BigInt
 * serialization before passing records in (BigInts are not JSON-safe).
 */
export function createAppendableJSONL<T>(path: string): AppendableJSONL<T> {
  return {
    async append(records) {
      if (records.length === 0) return;
      const buf = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
      await appendFile(path, buf, 'utf8');
    },
    async count() {
      try {
        const s = await stat(path);
        if (s.size === 0) return 0;
        const data = await readFile(path, 'utf8');
        let n = 0;
        for (let i = 0; i < data.length; i++) {
          if (data.charCodeAt(i) === 10) n++;
        }
        return n;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 0;
        throw err;
      }
    },
    async readAll() {
      const out: T[] = [];
      for await (const r of this.readFrom(0)) out.push(r);
      return out;
    },
    readFrom(lineOffset) {
      async function* gen(): AsyncIterable<T> {
        try {
          await stat(path);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
          throw err;
        }
        const stream = createReadStream(path, { encoding: 'utf8' });
        const rl = createInterface({ input: stream, crlfDelay: Infinity });
        let i = 0;
        for await (const line of rl) {
          if (i >= lineOffset && line.length > 0) {
            yield JSON.parse(line) as T;
          }
          i++;
        }
      }
      return gen();
    },
  };
}
```

- [ ] **Step 4: Run — expect pass**

Run: `cd packages/storage-campaign && npx vitest run __tests__/appendable-jsonl.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/storage-campaign/src/appendable-jsonl.ts packages/storage-campaign/__tests__/appendable-jsonl.test.ts
git commit -m "feat(storage-campaign): add AppendableJSONL<T> primitive"
```

---

### Task 9: JSON config stores — `ManifestStore`, `CursorStore`, `PipelineStore`

**Files:**
- Create: `packages/storage-campaign/src/manifest-store.ts`
- Create: `packages/storage-campaign/src/cursor-store.ts`
- Create: `packages/storage-campaign/src/pipeline-store.ts`
- Test: `packages/storage-campaign/__tests__/manifest-store.test.ts`
- Test: `packages/storage-campaign/__tests__/cursor-store.test.ts`
- Test: `packages/storage-campaign/__tests__/pipeline-store.test.ts`

- [ ] **Step 1: Write manifest-store tests**

Create `packages/storage-campaign/__tests__/manifest-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CampaignManifest } from '@titrate/sdk';
import { createManifestStore } from '../src/manifest-store.js';

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'titrate-mf-'));
  path = join(dir, 'campaign.json');
});

const baseManifest: CampaignManifest = {
  id: 'abc',
  funder: '0x0000000000000000000000000000000000000001',
  name: 'test',
  version: 1,
  chainId: 1,
  rpcUrl: 'https://x',
  tokenAddress: '0x0000000000000000000000000000000000000002',
  tokenDecimals: 18,
  contractAddress: null,
  contractVariant: 'simple',
  contractName: 'X',
  amountMode: 'uniform',
  amountFormat: 'integer',
  uniformAmount: '1',
  batchSize: 200,
  campaignId: null,
  pinnedBlock: null,
  status: 'configuring',
  wallets: { mode: 'imported', count: 0 },
  createdAt: 1,
  updatedAt: 1,
};

describe('ManifestStore', () => {
  it('read() throws when file missing', async () => {
    const s = createManifestStore(path);
    await expect(s.read()).rejects.toThrow();
    await rm(dir, { recursive: true });
  });

  it('write then read round-trips', async () => {
    const s = createManifestStore(path);
    await s.write(baseManifest);
    const r = await s.read();
    expect(r).toEqual(baseManifest);
    await rm(dir, { recursive: true });
  });

  it('update() applies a patch and bumps updatedAt', async () => {
    const s = createManifestStore(path);
    await s.write(baseManifest);
    const before = (await s.read()).updatedAt;
    await new Promise((r) => setTimeout(r, 2));
    await s.update({ status: 'ready' });
    const after = await s.read();
    expect(after.status).toBe('ready');
    expect(after.updatedAt).toBeGreaterThan(before);
    await rm(dir, { recursive: true });
  });

  it('exists() returns true only when file present', async () => {
    const s = createManifestStore(path);
    expect(await s.exists()).toBe(false);
    await s.write(baseManifest);
    expect(await s.exists()).toBe(true);
    await rm(dir, { recursive: true });
  });
});
```

- [ ] **Step 2: Write cursor-store tests (BigInt-safe)**

Create `packages/storage-campaign/__tests__/cursor-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PipelineCursor } from '@titrate/sdk';
import { createCursorStore } from '../src/cursor-store.js';

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'titrate-cur-'));
  path = join(dir, 'cursor.json');
});

describe('CursorStore', () => {
  it('serializes bigints as decimal strings on disk', async () => {
    const s = createCursorStore(path);
    const cursor: PipelineCursor = {
      scan: { lastBlock: 99999999999999n, endBlock: null, addressCount: 0 },
      filter: { watermark: 0, qualifiedCount: 0 },
      distribute: { watermark: 0, confirmedCount: 0 },
    };
    await s.write(cursor);
    const raw = await readFile(path, 'utf8');
    expect(raw).toContain('"lastBlock":"99999999999999"');
    await rm(dir, { recursive: true });
  });

  it('deserializes bigints back to bigint', async () => {
    const s = createCursorStore(path);
    const cursor: PipelineCursor = {
      scan: { lastBlock: 12345n, endBlock: 67890n, addressCount: 5 },
      filter: { watermark: 10, qualifiedCount: 3 },
      distribute: { watermark: 0, confirmedCount: 0 },
    };
    await s.write(cursor);
    const r = await s.read();
    expect(r.scan.lastBlock).toBe(12345n);
    expect(r.scan.endBlock).toBe(67890n);
    expect(typeof r.scan.lastBlock).toBe('bigint');
    await rm(dir, { recursive: true });
  });

  it('read() returns a zero cursor when file missing', async () => {
    const s = createCursorStore(path);
    const r = await s.read();
    expect(r.scan.lastBlock).toBe(0n);
    expect(r.scan.endBlock).toBeNull();
    expect(r.filter.watermark).toBe(0);
    await rm(dir, { recursive: true });
  });
});
```

- [ ] **Step 3: Write pipeline-store tests**

Create `packages/storage-campaign/__tests__/pipeline-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PipelineConfig } from '@titrate/sdk';
import { createPipelineStore } from '../src/pipeline-store.js';

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'titrate-pl-'));
  path = join(dir, 'pipeline.json');
});

describe('PipelineStore', () => {
  it('write+read round-trips', async () => {
    const s = createPipelineStore(path);
    const pipeline: PipelineConfig = {
      steps: [
        { type: 'source', sourceType: 'csv', params: { path: 'addrs.csv' } },
        { type: 'filter', filterType: 'contract-check', params: {} },
      ],
    };
    await s.write(pipeline);
    const r = await s.read();
    expect(r).toEqual(pipeline);
    await rm(dir, { recursive: true });
  });

  it('read returns an empty pipeline when file missing', async () => {
    const s = createPipelineStore(path);
    const r = await s.read();
    expect(r.steps).toEqual([]);
    await rm(dir, { recursive: true });
  });
});
```

- [ ] **Step 4: Run — expect all three fail**

Run: `cd packages/storage-campaign && npx vitest run`
Expected: FAIL — three files missing.

- [ ] **Step 5: Implement `packages/storage-campaign/src/manifest-store.ts`**

```typescript
import { readFile, writeFile, stat } from 'node:fs/promises';
import type { CampaignManifest } from '@titrate/sdk';

export type ManifestStore = {
  readonly read: () => Promise<CampaignManifest>;
  readonly write: (manifest: CampaignManifest) => Promise<void>;
  readonly update: (patch: Partial<CampaignManifest>) => Promise<void>;
  readonly exists: () => Promise<boolean>;
};

export function createManifestStore(path: string): ManifestStore {
  return {
    async read() {
      const raw = await readFile(path, 'utf8');
      return JSON.parse(raw) as CampaignManifest;
    },
    async write(manifest) {
      await writeFile(path, JSON.stringify(manifest, null, 2), 'utf8');
    },
    async update(patch) {
      const current = await this.read();
      const next: CampaignManifest = {
        ...current,
        ...patch,
        updatedAt: Date.now(),
      };
      await this.write(next);
    },
    async exists() {
      try {
        await stat(path);
        return true;
      } catch {
        return false;
      }
    },
  };
}
```

- [ ] **Step 6: Implement `packages/storage-campaign/src/cursor-store.ts`**

```typescript
import { readFile, writeFile } from 'node:fs/promises';
import type { PipelineCursor } from '@titrate/sdk';

export type CursorStore = {
  readonly read: () => Promise<PipelineCursor>;
  readonly write: (cursor: PipelineCursor) => Promise<void>;
  readonly update: (patch: Partial<PipelineCursor>) => Promise<void>;
};

type CursorOnDisk = {
  readonly scan: {
    readonly lastBlock: string;
    readonly endBlock: string | null;
    readonly addressCount: number;
  };
  readonly filter: { readonly watermark: number; readonly qualifiedCount: number };
  readonly distribute: { readonly watermark: number; readonly confirmedCount: number };
};

const ZERO_CURSOR: PipelineCursor = {
  scan: { lastBlock: 0n, endBlock: null, addressCount: 0 },
  filter: { watermark: 0, qualifiedCount: 0 },
  distribute: { watermark: 0, confirmedCount: 0 },
};

function toDisk(c: PipelineCursor): CursorOnDisk {
  return {
    scan: {
      lastBlock: c.scan.lastBlock.toString(),
      endBlock: c.scan.endBlock === null ? null : c.scan.endBlock.toString(),
      addressCount: c.scan.addressCount,
    },
    filter: c.filter,
    distribute: c.distribute,
  };
}

function fromDisk(d: CursorOnDisk): PipelineCursor {
  return {
    scan: {
      lastBlock: BigInt(d.scan.lastBlock),
      endBlock: d.scan.endBlock === null ? null : BigInt(d.scan.endBlock),
      addressCount: d.scan.addressCount,
    },
    filter: d.filter,
    distribute: d.distribute,
  };
}

export function createCursorStore(path: string): CursorStore {
  return {
    async read() {
      try {
        const raw = await readFile(path, 'utf8');
        return fromDisk(JSON.parse(raw) as CursorOnDisk);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return ZERO_CURSOR;
        throw err;
      }
    },
    async write(cursor) {
      await writeFile(path, JSON.stringify(toDisk(cursor), null, 2), 'utf8');
    },
    async update(patch) {
      const current = await this.read();
      const next: PipelineCursor = {
        scan: { ...current.scan, ...(patch.scan ?? {}) },
        filter: { ...current.filter, ...(patch.filter ?? {}) },
        distribute: { ...current.distribute, ...(patch.distribute ?? {}) },
      };
      await this.write(next);
    },
  };
}
```

- [ ] **Step 7: Implement `packages/storage-campaign/src/pipeline-store.ts`**

```typescript
import { readFile, writeFile } from 'node:fs/promises';
import type { PipelineConfig } from '@titrate/sdk';

export type PipelineStore = {
  readonly read: () => Promise<PipelineConfig>;
  readonly write: (pipeline: PipelineConfig) => Promise<void>;
};

export function createPipelineStore(path: string): PipelineStore {
  return {
    async read() {
      try {
        const raw = await readFile(path, 'utf8');
        return JSON.parse(raw) as PipelineConfig;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { steps: [] };
        throw err;
      }
    },
    async write(pipeline) {
      await writeFile(path, JSON.stringify(pipeline, null, 2), 'utf8');
    },
  };
}
```

- [ ] **Step 8: Run all tests**

Run: `cd packages/storage-campaign && npx vitest run`
Expected: PASS — manifest (4), cursor (3), pipeline (2) = 9 tests.

- [ ] **Step 9: Commit**

```bash
git add packages/storage-campaign/src/manifest-store.ts packages/storage-campaign/src/cursor-store.ts packages/storage-campaign/src/pipeline-store.ts packages/storage-campaign/__tests__/manifest-store.test.ts packages/storage-campaign/__tests__/cursor-store.test.ts packages/storage-campaign/__tests__/pipeline-store.test.ts
git commit -m "feat(storage-campaign): add ManifestStore, CursorStore, PipelineStore"
```

---

### Task 10: `createCampaignStorage` + `createSharedStorage` factories

**Files:**
- Create: `packages/storage-campaign/src/shared-storage.ts`
- Modify: `packages/storage-campaign/src/index.ts`
- Test: `packages/storage-campaign/__tests__/campaign-storage.test.ts`
- Test: `packages/storage-campaign/__tests__/shared-storage.test.ts`

- [ ] **Step 1: Write campaign-storage tests**

Create `packages/storage-campaign/__tests__/campaign-storage.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CampaignManifest } from '@titrate/sdk';
import { createCampaignStorage } from '../src/index.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'titrate-cs-'));
});

const baseManifest: CampaignManifest = {
  id: 'abc', funder: '0x0000000000000000000000000000000000000001',
  name: 'x', version: 1, chainId: 1, rpcUrl: 'https://x',
  tokenAddress: '0x0000000000000000000000000000000000000002', tokenDecimals: 18,
  contractAddress: null, contractVariant: 'simple', contractName: 'X',
  amountMode: 'uniform', amountFormat: 'integer', uniformAmount: '1',
  batchSize: 200, campaignId: null, pinnedBlock: null,
  status: 'configuring', wallets: { mode: 'imported', count: 0 },
  createdAt: 1, updatedAt: 1,
};

describe('createCampaignStorage', () => {
  it('exposes manifest / pipeline / cursor stores', async () => {
    const s = createCampaignStorage(dir);
    await s.manifest.write(baseManifest);
    expect((await s.manifest.read()).id).toBe('abc');
    await rm(dir, { recursive: true });
  });

  it('exposes appendable files that write into the campaign dir', async () => {
    const s = createCampaignStorage(dir);
    await s.addresses.append([{ address: '0x1', amount: null }]);
    const entries = await readdir(dir);
    expect(entries).toContain('addresses.csv');
    await rm(dir, { recursive: true });
  });

  it('supports wallets.jsonl, batches.jsonl, sweep.jsonl', async () => {
    const s = createCampaignStorage(dir);
    await s.wallets.append([{
      index: 0, address: '0x1', encryptedKey: 'ct',
      kdf: 'scrypt', kdfParams: { N: 131072, r: 8, p: 1, salt: 's' },
      provenance: { type: 'imported' }, createdAt: 1,
    }]);
    expect(await s.wallets.count()).toBe(1);
    await rm(dir, { recursive: true });
  });
});
```

- [ ] **Step 2: Write shared-storage tests**

Create `packages/storage-campaign/__tests__/shared-storage.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSharedStorage } from '../src/index.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'titrate-shared-'));
});

describe('createSharedStorage', () => {
  it('writes chains + settings into _shared/', async () => {
    const s = createSharedStorage(root);
    await s.settings.write({ providerKeys: { valve: 'vk_x' } });
    const read = await s.settings.read();
    expect(read.providerKeys.valve).toBe('vk_x');
    await rm(root, { recursive: true });
  });

  it('isolates from campaign dirs', async () => {
    const s = createSharedStorage(root);
    await s.chains.write([]);
    // Did not touch root itself, only _shared/
    expect(await s.chains.read()).toEqual([]);
    await rm(root, { recursive: true });
  });
});
```

- [ ] **Step 3: Run — expect failure**

Run: `cd packages/storage-campaign && npx vitest run __tests__/campaign-storage.test.ts __tests__/shared-storage.test.ts`
Expected: FAIL — factories not exported.

- [ ] **Step 4: Implement `packages/storage-campaign/src/shared-storage.ts`**

```typescript
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppSettings, ChainConfig } from '@titrate/sdk';

export type AppSettingsStore = {
  readonly read: () => Promise<AppSettings>;
  readonly write: (settings: AppSettings) => Promise<void>;
  readonly update: (patch: Partial<AppSettings>) => Promise<void>;
};

export type ChainConfigStore = {
  readonly read: () => Promise<readonly ChainConfig[]>;
  readonly write: (chains: readonly ChainConfig[]) => Promise<void>;
};

export type SharedStorage = {
  readonly chains: ChainConfigStore;
  readonly settings: AppSettingsStore;
};

const EMPTY_SETTINGS: AppSettings = { providerKeys: {} };

export function createSharedStorage(campaignRoot: string): SharedStorage {
  const sharedDir = join(campaignRoot, '_shared');
  const chainsPath = join(sharedDir, 'chains.json');
  const settingsPath = join(sharedDir, 'settings.json');

  async function ensureDir(): Promise<void> {
    await mkdir(sharedDir, { recursive: true });
  }

  return {
    chains: {
      async read() {
        try {
          const raw = await readFile(chainsPath, 'utf8');
          return JSON.parse(raw) as readonly ChainConfig[];
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
          throw err;
        }
      },
      async write(chains) {
        await ensureDir();
        await writeFile(chainsPath, JSON.stringify(chains, null, 2), 'utf8');
      },
    },
    settings: {
      async read() {
        try {
          const raw = await readFile(settingsPath, 'utf8');
          return JSON.parse(raw) as AppSettings;
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') return EMPTY_SETTINGS;
          throw err;
        }
      },
      async write(settings) {
        await ensureDir();
        await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
      },
      async update(patch) {
        const current = await this.read();
        await this.write({ ...current, ...patch });
      },
    },
  };
}
```

- [ ] **Step 5: Replace `packages/storage-campaign/src/index.ts` with factories**

```typescript
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { WalletRecord, BatchRecord, SweepRecord } from '@titrate/sdk';
import { createAppendableCSV, type AppendableCSV } from './appendable-csv.js';
import { createAppendableJSONL, type AppendableJSONL } from './appendable-jsonl.js';
import { createManifestStore, type ManifestStore } from './manifest-store.js';
import { createCursorStore, type CursorStore } from './cursor-store.js';
import { createPipelineStore, type PipelineStore } from './pipeline-store.js';

export type CampaignStorage = {
  readonly dir: string;
  readonly manifest: ManifestStore;
  readonly pipeline: PipelineStore;
  readonly cursor: CursorStore;
  readonly addresses: AppendableCSV;
  readonly filtered: AppendableCSV;
  readonly amounts: AppendableCSV;
  readonly batches: AppendableJSONL<BatchRecord>;
  readonly wallets: AppendableJSONL<WalletRecord>;
  readonly sweeps: AppendableJSONL<SweepRecord>;
  readonly ensureDir: () => Promise<void>;
};

/**
 * Create a CampaignStorage rooted at `dir`. The directory is NOT created
 * eagerly — callers should call ensureDir() before first write, or rely on
 * individual append/write operations to create the file on demand.
 * mkdir is idempotent.
 */
export function createCampaignStorage(dir: string): CampaignStorage {
  return {
    dir,
    manifest: createManifestStore(join(dir, 'campaign.json')),
    pipeline: createPipelineStore(join(dir, 'pipeline.json')),
    cursor: createCursorStore(join(dir, 'cursor.json')),
    addresses: createAppendableCSV(join(dir, 'addresses.csv')),
    filtered: createAppendableCSV(join(dir, 'filtered.csv')),
    amounts: createAppendableCSV(join(dir, 'amounts.csv')),
    batches: createAppendableJSONL<BatchRecord>(join(dir, 'batches.jsonl')),
    wallets: createAppendableJSONL<WalletRecord>(join(dir, 'wallets.jsonl')),
    sweeps: createAppendableJSONL<SweepRecord>(join(dir, 'sweep.jsonl')),
    async ensureDir() {
      await mkdir(dir, { recursive: true });
    },
  };
}

export {
  createAppendableCSV,
  createAppendableJSONL,
  createManifestStore,
  createCursorStore,
  createPipelineStore,
};
export type { AppendableCSV, AppendableJSONL, ManifestStore, CursorStore, PipelineStore };
export type { CSVRow } from './appendable-csv.js';

export { createSharedStorage } from './shared-storage.js';
export type { SharedStorage, AppSettingsStore, ChainConfigStore } from './shared-storage.js';
```

- [ ] **Step 6: Run all storage-campaign tests**

Run: `cd packages/storage-campaign && npx vitest run`
Expected: PASS — ~14 tests total.

- [ ] **Step 7: Commit**

```bash
git add packages/storage-campaign
git commit -m "feat(storage-campaign): add createCampaignStorage + createSharedStorage factories"
```

---

## Phase 1c — TUI Bun + OpenTUI Foundation

### Task 11: Switch `@titrate/tui` runtime to Bun + install OpenTUI

**Files:**
- Modify: `packages/tui/package.json`
- Modify: `packages/tui/tsconfig.json`
- Create: `packages/tui/bunfig.toml`

- [ ] **Step 1: Verify Bun is installed**

```bash
bun --version
```

Expected: `1.x.x`. If not installed, run `curl -fsSL https://bun.sh/install | bash` first.

- [ ] **Step 2: Rewrite `packages/tui/package.json`**

```json
{
  "name": "@titrate/tui",
  "version": "0.0.1",
  "type": "module",
  "bin": {
    "titrate": "src/index.tsx"
  },
  "scripts": {
    "dev": "bun run src/index.tsx",
    "build": "bun build src/index.tsx --outdir dist --target bun",
    "test": "bun test",
    "test:watch": "bun test --watch"
  },
  "dependencies": {
    "@opentui/core": "latest",
    "@opentui/react": "latest",
    "@titrate/sdk": "file:../sdk",
    "@titrate/storage-campaign": "file:../storage-campaign",
    "commander": "^13.1.0",
    "react": "^19.0.0",
    "viem": "^2.23.2"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/react": "^19.0.0",
    "typescript": "^5.7.3"
  }
}
```

- [ ] **Step 3: Rewrite `packages/tui/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "types": ["bun-types", "react"],
    "skipLibCheck": true
  },
  "include": ["src/**/*", "__tests__/**/*"]
}
```

- [ ] **Step 4: Create `packages/tui/bunfig.toml`**

```toml
[test]
root = "__tests__"
preload = []
```

- [ ] **Step 5: Install via Bun**

```bash
cd packages/tui
rm -rf node_modules
bun install
```

Expected: creates `bun.lockb`, populates `node_modules`. No install errors.

- [ ] **Step 6: Verify Bun runs a trivial script**

```bash
cd packages/tui
bun -e "console.log('hello from bun')"
```

Expected: `hello from bun`.

- [ ] **Step 7: Verify OpenTUI imports resolve**

```bash
cd packages/tui
bun -e "import('@opentui/react').then(m => console.log(Object.keys(m).slice(0, 5)))"
```

Expected: prints an array of exported names (e.g., `createRoot`, `useKeyboard`, ...).

- [ ] **Step 8: Commit**

```bash
git add packages/tui/package.json packages/tui/tsconfig.json packages/tui/bunfig.toml packages/tui/bun.lockb
git commit -m "chore(tui): switch runtime to Bun and add OpenTUI dependencies"
```

---

### Task 12: Campaign root resolution utility

**Files:**
- Create: `packages/tui/src/utils/campaign-root.ts`
- Test: `packages/tui/__tests__/campaign-root.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/tui/__tests__/campaign-root.test.ts`:

```typescript
import { test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { resolveCampaignRoot } from '../src/utils/campaign-root.ts';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'titrate-root-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

test('--folder flag takes precedence', async () => {
  const root = await resolveCampaignRoot({ folder: dir });
  expect(root).toBe(dir);
});

test('TITRATE_CAMPAIGNS_DIR env var is used when no flag', async () => {
  process.env.TITRATE_CAMPAIGNS_DIR = dir;
  const root = await resolveCampaignRoot({});
  expect(root).toBe(dir);
  delete process.env.TITRATE_CAMPAIGNS_DIR;
});

test('auto-detect prefers ./titrate-campaigns when in a git repo', async () => {
  delete process.env.TITRATE_CAMPAIGNS_DIR;
  await mkdir(join(dir, '.git'), { recursive: true });
  const root = await resolveCampaignRoot({ cwd: dir });
  expect(root).toBe(join(dir, 'titrate-campaigns'));
});

test('auto-detect falls back to ~/.titrate-campaigns when not in a repo', async () => {
  delete process.env.TITRATE_CAMPAIGNS_DIR;
  const root = await resolveCampaignRoot({ cwd: dir });
  expect(root).toBe(join(homedir(), '.titrate-campaigns'));
});
```

- [ ] **Step 2: Run — expect failure**

Run: `cd packages/tui && bun test __tests__/campaign-root.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/tui/src/utils/campaign-root.ts`**

```typescript
import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type CampaignRootOptions = {
  readonly folder?: string;
  readonly cwd?: string;
};

async function isGitRepo(dir: string): Promise<boolean> {
  try {
    const s = await stat(join(dir, '.git'));
    return s.isDirectory() || s.isFile();
  } catch {
    return false;
  }
}

/**
 * Resolve the campaign root directory. Priority:
 *   1. explicit --folder flag
 *   2. TITRATE_CAMPAIGNS_DIR environment variable
 *   3. auto-detect: ./titrate-campaigns/ if in a git repo, else ~/.titrate-campaigns/
 */
export async function resolveCampaignRoot(options: CampaignRootOptions): Promise<string> {
  if (options.folder) return options.folder;
  const env = process.env.TITRATE_CAMPAIGNS_DIR;
  if (env) return env;
  const cwd = options.cwd ?? process.cwd();
  if (await isGitRepo(cwd)) {
    return join(cwd, 'titrate-campaigns');
  }
  return join(homedir(), '.titrate-campaigns');
}
```

- [ ] **Step 4: Run — expect pass**

Run: `cd packages/tui && bun test __tests__/campaign-root.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/tui/src/utils/campaign-root.ts packages/tui/__tests__/campaign-root.test.ts
git commit -m "feat(tui): add campaign root resolution utility"
```

---

### Task 13: Passphrase helpers (scrypt + AES-GCM)

**Files:**
- Create: `packages/tui/src/utils/passphrase.ts`
- Test: `packages/tui/__tests__/passphrase.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/tui/__tests__/passphrase.test.ts`:

```typescript
import { test, expect } from 'bun:test';
import { encryptPrivateKey, decryptPrivateKey, type EncryptedKey } from '../src/utils/passphrase.ts';

test('encrypt then decrypt round-trips a private key', async () => {
  const passphrase = 'correct horse battery staple';
  const plaintext = '0x' + '11'.repeat(32);
  const encrypted: EncryptedKey = await encryptPrivateKey(plaintext, passphrase);
  expect(encrypted.ciphertext).toBeTruthy();
  expect(encrypted.kdf).toBe('scrypt');
  expect(encrypted.kdfParams.salt).toBeTruthy();

  const decrypted = await decryptPrivateKey(encrypted, passphrase);
  expect(decrypted).toBe(plaintext);
});

test('decrypt rejects wrong passphrase', async () => {
  const encrypted = await encryptPrivateKey('0x' + '11'.repeat(32), 'right');
  await expect(decryptPrivateKey(encrypted, 'wrong')).rejects.toThrow();
});

test('each encryption produces a unique salt and IV', async () => {
  const pass = 'same';
  const pk = '0x' + '11'.repeat(32);
  const a = await encryptPrivateKey(pk, pass);
  const b = await encryptPrivateKey(pk, pass);
  expect(a.kdfParams.salt).not.toBe(b.kdfParams.salt);
  expect(a.iv).not.toBe(b.iv);
  expect(a.ciphertext).not.toBe(b.ciphertext);
});
```

- [ ] **Step 2: Run — expect failure**

Run: `cd packages/tui && bun test __tests__/passphrase.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/tui/src/utils/passphrase.ts`**

```typescript
import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const N = 131072;   // 2^17
const R = 8;
const P = 1;
const KEY_LEN = 32;
const IV_LEN = 12;

export type EncryptedKey = {
  readonly ciphertext: string;   // base64
  readonly iv: string;           // base64
  readonly authTag: string;      // base64
  readonly kdf: 'scrypt';
  readonly kdfParams: {
    readonly N: number;
    readonly r: number;
    readonly p: number;
    readonly salt: string;       // base64
  };
};

function toB64(buf: Buffer): string {
  return buf.toString('base64');
}

function fromB64(s: string): Buffer {
  return Buffer.from(s, 'base64');
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase.normalize('NFKC'), salt, KEY_LEN, { N, r: R, p: P, maxmem: 256 * 1024 * 1024 });
}

/**
 * Encrypt a private key (hex string) with a user passphrase.
 * Uses scrypt for key derivation, AES-256-GCM for authenticated encryption.
 */
export async function encryptPrivateKey(plaintext: string, passphrase: string): Promise<EncryptedKey> {
  const salt = randomBytes(16);
  const key = deriveKey(passphrase, salt);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: toB64(ct),
    iv: toB64(iv),
    authTag: toB64(authTag),
    kdf: 'scrypt',
    kdfParams: { N, r: R, p: P, salt: toB64(salt) },
  };
}

export async function decryptPrivateKey(encrypted: EncryptedKey, passphrase: string): Promise<string> {
  const salt = fromB64(encrypted.kdfParams.salt);
  const key = deriveKey(passphrase, salt);
  const iv = fromB64(encrypted.iv);
  const authTag = fromB64(encrypted.authTag);
  const ct = fromB64(encrypted.ciphertext);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}
```

- [ ] **Step 4: Run — expect pass**

Run: `cd packages/tui && bun test __tests__/passphrase.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/tui/src/utils/passphrase.ts packages/tui/__tests__/passphrase.test.ts
git commit -m "feat(tui): add passphrase-based private-key encryption helpers"
```

---

### Task 14: Step-status derivation (pure function)

**Files:**
- Create: `packages/tui/src/interactive/step-status.ts`
- Test: `packages/tui/__tests__/step-status.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/tui/__tests__/step-status.test.ts`:

```typescript
import { test, expect } from 'bun:test';
import type { CampaignManifest } from '@titrate/sdk';
import { deriveStepStates, type StepState } from '../src/interactive/step-status.ts';

const baseManifest: CampaignManifest = {
  id: 'x', funder: '0x0000000000000000000000000000000000000001',
  name: 'x', version: 1, chainId: 1, rpcUrl: 'https://x',
  tokenAddress: '0x0000000000000000000000000000000000000002', tokenDecimals: 18,
  contractAddress: null, contractVariant: 'simple', contractName: 'X',
  amountMode: 'uniform', amountFormat: 'integer', uniformAmount: '1',
  batchSize: 200, campaignId: null, pinnedBlock: null,
  status: 'configuring', wallets: { mode: 'imported', count: 0 },
  createdAt: 1, updatedAt: 1,
};

test('configuring campaign with no activity shows all steps as todo/blocked', () => {
  const states = deriveStepStates(baseManifest, {
    addresses: 0, filtered: 0, wallets: 0, batches: 0,
  });
  const map = Object.fromEntries(states.map((s: StepState) => [s.id, s.status]));
  expect(map.campaign).toBe('done');  // manifest exists with chain+token set
  expect(map.addresses).toBe('todo');
  expect(map.distribute).toBe('blocked');
});

test('addresses step becomes done once a non-zero count is recorded', () => {
  const states = deriveStepStates(baseManifest, {
    addresses: 100, filtered: 0, wallets: 0, batches: 0,
  });
  const addr = states.find((s) => s.id === 'addresses')!;
  expect(addr.status).toBe('done');
  expect(addr.summary).toContain('100');
});

test('distribute unblocks when addresses + filters + amounts + wallets are all done', () => {
  const manifest: CampaignManifest = {
    ...baseManifest,
    wallets: { mode: 'imported', count: 3 },
  };
  const states = deriveStepStates(manifest, {
    addresses: 10, filtered: 10, wallets: 3, batches: 0,
  });
  const dist = states.find((s) => s.id === 'distribute')!;
  expect(dist.status).not.toBe('blocked');
});
```

- [ ] **Step 2: Run — expect failure**

Run: `cd packages/tui && bun test __tests__/step-status.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/tui/src/interactive/step-status.ts`**

```typescript
import type { CampaignManifest } from '@titrate/sdk';

export type StepId = 'campaign' | 'addresses' | 'filters' | 'amounts' | 'wallet' | 'distribute';

export type StepStatus = 'done' | 'todo' | 'blocked' | 'warning';

export type StepState = {
  readonly id: StepId;
  readonly status: StepStatus;
  readonly summary: string;
};

export type StepCounts = {
  readonly addresses: number;
  readonly filtered: number;
  readonly wallets: number;
  readonly batches: number;
};

export function deriveStepStates(
  manifest: CampaignManifest,
  counts: StepCounts,
): readonly StepState[] {
  const campaignDone =
    manifest.chainId > 0 &&
    manifest.tokenAddress !== '0x0000000000000000000000000000000000000000';

  const addressesDone = counts.addresses > 0;
  const filtersDone = counts.filtered > 0 || counts.addresses > 0;  // filters optional
  const amountsDone = manifest.amountMode === 'uniform'
    ? manifest.uniformAmount !== null && manifest.uniformAmount !== ''
    : false;  // variable mode requires amounts.csv — tracked by caller
  const walletsDone = counts.wallets > 0 || manifest.wallets.mode === 'derived';

  const distributeBlocked = !(addressesDone && filtersDone && amountsDone && walletsDone);

  return [
    {
      id: 'campaign',
      status: campaignDone ? 'done' : 'todo',
      summary: campaignDone ? `chain ${manifest.chainId}` : 'not configured',
    },
    {
      id: 'addresses',
      status: addressesDone ? 'done' : 'todo',
      summary: addressesDone ? `${counts.addresses} sourced` : 'not configured',
    },
    {
      id: 'filters',
      status: filtersDone ? 'done' : 'todo',
      summary: filtersDone ? `${counts.filtered} qualified` : 'not configured',
    },
    {
      id: 'amounts',
      status: amountsDone ? 'done' : 'todo',
      summary: amountsDone ? `${manifest.amountMode}` : 'pending',
    },
    {
      id: 'wallet',
      status: walletsDone ? 'done' : 'todo',
      summary: walletsDone
        ? `${manifest.wallets.mode} · ${counts.wallets || (manifest.wallets.mode === 'derived' ? manifest.wallets.walletCount : 0)}`
        : 'not configured',
    },
    {
      id: 'distribute',
      status: distributeBlocked ? 'blocked' : (counts.batches > 0 ? 'done' : 'todo'),
      summary: distributeBlocked ? 'blocked' : counts.batches > 0 ? `${counts.batches} batches` : 'ready',
    },
  ];
}
```

- [ ] **Step 4: Run — expect pass**

Run: `cd packages/tui && bun test __tests__/step-status.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/tui/src/interactive/step-status.ts packages/tui/__tests__/step-status.test.ts
git commit -m "feat(tui): add deriveStepStates pure function"
```

---

### Task 15: Context providers + App shell

**Files:**
- Create: `packages/tui/src/interactive/context.tsx`
- Create: `packages/tui/src/interactive/App.tsx`

- [ ] **Step 1: Implement `packages/tui/src/interactive/context.tsx`**

```tsx
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { CampaignManifest } from '@titrate/sdk';
import type { CampaignStorage, SharedStorage } from '@titrate/storage-campaign';
import type { PublicClient } from 'viem';
import { createPublicClient, http } from 'viem';

// --- Storage ---
const CampaignStorageCtx = createContext<CampaignStorage | null>(null);
const SharedStorageCtx = createContext<SharedStorage | null>(null);

export function CampaignStorageProvider({
  value, children,
}: {
  value: CampaignStorage;
  children: ReactNode;
}) {
  return <CampaignStorageCtx.Provider value={value}>{children}</CampaignStorageCtx.Provider>;
}

export function SharedStorageProvider({
  value, children,
}: {
  value: SharedStorage;
  children: ReactNode;
}) {
  return <SharedStorageCtx.Provider value={value}>{children}</SharedStorageCtx.Provider>;
}

export function useCampaignStorage(): CampaignStorage {
  const s = useContext(CampaignStorageCtx);
  if (!s) throw new Error('useCampaignStorage called outside CampaignStorageProvider');
  return s;
}

export function useSharedStorage(): SharedStorage {
  const s = useContext(SharedStorageCtx);
  if (!s) throw new Error('useSharedStorage called outside SharedStorageProvider');
  return s;
}

// --- Manifest ---
type ManifestState = {
  readonly manifest: CampaignManifest;
  readonly refresh: () => Promise<void>;
};

const ManifestCtx = createContext<ManifestState | null>(null);

export function ManifestProvider({
  initial, children,
}: {
  initial: CampaignManifest;
  children: ReactNode;
}) {
  const storage = useCampaignStorage();
  const [manifest, setManifest] = useState(initial);
  const refresh = useCallback(async () => {
    setManifest(await storage.manifest.read());
  }, [storage]);
  return <ManifestCtx.Provider value={{ manifest, refresh }}>{children}</ManifestCtx.Provider>;
}

export function useManifest(): ManifestState {
  const s = useContext(ManifestCtx);
  if (!s) throw new Error('useManifest called outside ManifestProvider');
  return s;
}

// --- RPC Client ---
const ClientCtx = createContext<PublicClient | null>(null);

export function ClientProvider({ children }: { children: ReactNode }) {
  const { manifest } = useManifest();
  const [client, setClient] = useState<PublicClient | null>(null);
  useEffect(() => {
    setClient(createPublicClient({ transport: http(manifest.rpcUrl) }));
  }, [manifest.rpcUrl]);
  return <ClientCtx.Provider value={client}>{children}</ClientCtx.Provider>;
}

export function useClient(): PublicClient | null {
  return useContext(ClientCtx);
}
```

- [ ] **Step 2: Implement `packages/tui/src/interactive/App.tsx`**

```tsx
import { useState, useCallback } from 'react';
import { useKeyboard } from '@opentui/react';
import type { CampaignManifest } from '@titrate/sdk';
import type { CampaignStorage, SharedStorage } from '@titrate/storage-campaign';
import {
  CampaignStorageProvider,
  SharedStorageProvider,
  ManifestProvider,
  ClientProvider,
} from './context.js';
import type { StepId } from './step-status.js';
import { Dashboard } from './screens/Dashboard.js';
import { CampaignSetup } from './screens/CampaignSetup.js';
import { Addresses } from './screens/Addresses.js';
import { Filters } from './screens/Filters.js';
import { Amounts } from './screens/Amounts.js';
import { Wallet } from './screens/Wallet.js';
import { Distribute } from './screens/Distribute.js';

type Screen = 'dashboard' | StepId;

export type AppProps = {
  readonly storage: CampaignStorage;
  readonly shared: SharedStorage;
  readonly initialManifest: CampaignManifest;
};

export function App({ storage, shared, initialManifest }: AppProps) {
  const [screen, setScreen] = useState<Screen>('dashboard');

  const open = useCallback((step: StepId) => setScreen(step), []);
  const back = useCallback(() => setScreen('dashboard'), []);

  useKeyboard((key) => {
    if (key.ctrl && key.name === 'c') process.exit(0);
  });

  const visible = (s: Screen) => (screen === s ? 'flex' : 'none');

  return (
    <CampaignStorageProvider value={storage}>
      <SharedStorageProvider value={shared}>
        <ManifestProvider initial={initialManifest}>
          <ClientProvider>
            <box display={visible('dashboard')} flexDirection="column">
              <Dashboard onOpenStep={open} onQuit={() => process.exit(0)} />
            </box>
            <box display={visible('campaign')} flexDirection="column">
              <CampaignSetup onDone={back} onBack={back} />
            </box>
            <box display={visible('addresses')} flexDirection="column">
              <Addresses onDone={back} onBack={back} />
            </box>
            <box display={visible('filters')} flexDirection="column">
              <Filters onDone={back} onBack={back} />
            </box>
            <box display={visible('amounts')} flexDirection="column">
              <Amounts onDone={back} onBack={back} />
            </box>
            <box display={visible('wallet')} flexDirection="column">
              <Wallet onDone={back} onBack={back} />
            </box>
            <box display={visible('distribute')} flexDirection="column">
              <Distribute onDone={back} onBack={back} />
            </box>
          </ClientProvider>
        </ManifestProvider>
      </SharedStorageProvider>
    </CampaignStorageProvider>
  );
}

export type StepProps = {
  readonly onDone: () => void;
  readonly onBack: () => void;
};
```

- [ ] **Step 3: Verify type-check**

Run: `cd packages/tui && bunx tsc --noEmit`
Expected: the screen imports will fail (not yet implemented) — that's expected at this point. Tasks 16-22 create the screens.

- [ ] **Step 4: Commit (context only — App imports are placeholder)**

```bash
git add packages/tui/src/interactive/context.tsx packages/tui/src/interactive/App.tsx
git commit -m "feat(tui): add context providers and App shell (screens to follow)"
```

---

### Task 16: Dashboard screen + StepBadge component

**Files:**
- Create: `packages/tui/src/interactive/components/StepBadge.tsx`
- Create: `packages/tui/src/interactive/screens/Dashboard.tsx`
- Test: `packages/tui/__tests__/screens/Dashboard.test.tsx`

- [ ] **Step 1: Implement `packages/tui/src/interactive/components/StepBadge.tsx`**

```tsx
import type { StepStatus } from '../step-status.js';

const ICON: Record<StepStatus, string> = {
  done: '✓',
  todo: '○',
  blocked: '✗',
  warning: '!',
};

const COLOR: Record<StepStatus, string> = {
  done: 'green',
  todo: 'gray',
  blocked: 'red',
  warning: 'yellow',
};

export function StepBadge({ status }: { status: StepStatus }) {
  return (
    <text>
      <span fg={COLOR[status]}>{ICON[status]}</span>
    </text>
  );
}
```

- [ ] **Step 2: Implement `packages/tui/src/interactive/screens/Dashboard.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useKeyboard } from '@opentui/react';
import { useCampaignStorage, useManifest } from '../context.js';
import { deriveStepStates, type StepId, type StepState, type StepCounts } from '../step-status.js';
import { StepBadge } from '../components/StepBadge.js';

const STEP_LABELS: Record<StepId, string> = {
  campaign: '1. Campaign setup',
  addresses: '2. Addresses',
  filters: '3. Filters',
  amounts: '4. Amounts',
  wallet: '5. Hot wallets',
  distribute: '6. Distribute',
};

export type DashboardProps = {
  readonly onOpenStep: (step: StepId) => void;
  readonly onQuit: () => void;
};

export function Dashboard({ onOpenStep, onQuit }: DashboardProps) {
  const { manifest, refresh } = useManifest();
  const storage = useCampaignStorage();
  const [counts, setCounts] = useState<StepCounts>({ addresses: 0, filtered: 0, wallets: 0, batches: 0 });
  const [focused, setFocused] = useState(0);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [addresses, filtered, wallets, batches] = await Promise.all([
        storage.addresses.count(),
        storage.filtered.count(),
        storage.wallets.count(),
        storage.batches.count(),
      ]);
      if (!cancelled) setCounts({ addresses, filtered, wallets, batches });
    })();
    return () => { cancelled = true; };
  }, [storage, manifest.updatedAt]);

  const steps = deriveStepStates(manifest, counts);

  useKeyboard((key) => {
    if (key.name === 'up') setFocused((i) => Math.max(0, i - 1));
    if (key.name === 'down') setFocused((i) => Math.min(steps.length - 1, i + 1));
    if (key.name === 'return') {
      const step = steps[focused];
      if (step.status === 'blocked') {
        setWarning('Complete prior steps first');
        setTimeout(() => setWarning(null), 2000);
      } else {
        onOpenStep(step.id);
      }
    }
    if (key.name === 'q') onQuit();
    if (key.name === 'r') refresh();
  });

  return (
    <box border padding={1} flexDirection="column">
      <text>
        <strong>{manifest.name}</strong>
        <span fg="gray"> · {manifest.status}</span>
      </text>
      <text>
        <span fg="gray">chain {manifest.chainId} · batch size {manifest.batchSize}</span>
      </text>
      <box marginTop={1} flexDirection="column">
        {steps.map((step: StepState, i: number) => (
          <box key={step.id} flexDirection="row">
            <StepBadge status={step.status} />
            <text>
              <span fg={i === focused ? 'cyan' : 'white'}> {STEP_LABELS[step.id]}</span>
              <span fg="gray">  {step.summary}</span>
            </text>
          </box>
        ))}
      </box>
      <box marginTop={1}>
        <text>
          <span fg="gray">↑/↓ navigate · Enter open · q quit · r refresh</span>
        </text>
      </box>
      {warning && (
        <box marginTop={1}>
          <text><span fg="yellow">{warning}</span></text>
        </box>
      )}
    </box>
  );
}
```

- [ ] **Step 3: Write Dashboard snapshot test**

Create `packages/tui/__tests__/screens/Dashboard.test.tsx`:

```tsx
import { test, expect } from 'bun:test';
import { createTestRenderer } from '@opentui/core/testing';
import { createRoot } from '@opentui/react';
import type { CampaignManifest } from '@titrate/sdk';
import { createCampaignStorage, createSharedStorage } from '@titrate/storage-campaign';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { App } from '../../src/interactive/App.tsx';

test('Dashboard renders all six steps with status badges', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'titrate-dash-'));
  const storage = createCampaignStorage(dir);
  const shared = createSharedStorage(dir);
  await storage.ensureDir();
  const manifest: CampaignManifest = {
    id: 'x', funder: '0x0000000000000000000000000000000000000001',
    name: 'test-campaign', version: 1, chainId: 1, rpcUrl: 'https://x',
    tokenAddress: '0x0000000000000000000000000000000000000002', tokenDecimals: 18,
    contractAddress: null, contractVariant: 'simple', contractName: 'X',
    amountMode: 'uniform', amountFormat: 'integer', uniformAmount: '1',
    batchSize: 200, campaignId: null, pinnedBlock: null,
    status: 'configuring', wallets: { mode: 'imported', count: 0 },
    createdAt: 1, updatedAt: 1,
  };
  await storage.manifest.write(manifest);

  const { renderer, snapshot } = await createTestRenderer({ width: 60, height: 20 });
  createRoot(renderer).render(<App storage={storage} shared={shared} initialManifest={manifest} />);
  await new Promise((r) => setTimeout(r, 50));
  const text = snapshot();
  expect(text).toContain('test-campaign');
  expect(text).toContain('1. Campaign setup');
  expect(text).toContain('6. Distribute');
});
```

- [ ] **Step 4: Run**

Run: `cd packages/tui && bun test __tests__/screens/Dashboard.test.tsx`
Expected: PASS. (This test is brittle — the other screens being empty is acceptable for now.)

- [ ] **Step 5: Commit**

```bash
git add packages/tui/src/interactive/components/StepBadge.tsx packages/tui/src/interactive/screens/Dashboard.tsx packages/tui/__tests__/screens/Dashboard.test.tsx
git commit -m "feat(tui): add Dashboard screen with step menu"
```

---

### Task 17: `ProviderKeyInput` component

**Files:**
- Create: `packages/tui/src/interactive/components/ProviderKeyInput.tsx`
- Test: `packages/tui/__tests__/components/ProviderKeyInput.test.tsx`

- [ ] **Step 1: Implement `packages/tui/src/interactive/components/ProviderKeyInput.tsx`**

```tsx
import { useState, useMemo } from 'react';
import { splitTemplate, getProvider, type ProviderId } from '@titrate/sdk';

export type ProviderKeyInputProps = {
  readonly providerId: ProviderId;
  readonly chainId: number;
  readonly initialKey?: string;
  readonly focused: boolean;
  readonly onChange: (key: string, url: string | null) => void;
};

export function ProviderKeyInput({
  providerId, chainId, initialKey = '', focused, onChange,
}: ProviderKeyInputProps) {
  const [key, setKey] = useState(initialKey);
  const { prefix, suffix } = useMemo(
    () => splitTemplate(providerId, chainId),
    [providerId, chainId],
  );
  const url = useMemo(
    () => (key ? getProvider(providerId).buildUrl(chainId, key) : null),
    [providerId, chainId, key],
  );

  return (
    <box flexDirection="row">
      <text><span fg="gray">{prefix}</span></text>
      <input
        focused={focused}
        value={key}
        onChange={(next: string) => {
          setKey(next);
          onChange(next, next ? getProvider(providerId).buildUrl(chainId, next) : null);
        }}
        placeholder="your-api-key"
      />
      <text><span fg="gray">{suffix}</span></text>
    </box>
  );
}
```

- [ ] **Step 2: Write snapshot test**

Create `packages/tui/__tests__/components/ProviderKeyInput.test.tsx`:

```tsx
import { test, expect } from 'bun:test';
import { createTestRenderer } from '@opentui/core/testing';
import { createRoot } from '@opentui/react';
import { ProviderKeyInput } from '../../src/interactive/components/ProviderKeyInput.tsx';

test('renders valve template prefix for PulseChain', async () => {
  const { renderer, snapshot } = await createTestRenderer({ width: 60, height: 5 });
  createRoot(renderer).render(
    <ProviderKeyInput providerId="valve" chainId={369} focused onChange={() => {}} />,
  );
  await new Promise((r) => setTimeout(r, 10));
  expect(snapshot()).toContain('https://evm369.rpc.valve.city/v1/');
});

test('renders alchemy prefix for Ethereum', async () => {
  const { renderer, snapshot } = await createTestRenderer({ width: 80, height: 5 });
  createRoot(renderer).render(
    <ProviderKeyInput providerId="alchemy" chainId={1} focused onChange={() => {}} />,
  );
  await new Promise((r) => setTimeout(r, 10));
  expect(snapshot()).toContain('eth-mainnet.g.alchemy.com/v2/');
});
```

- [ ] **Step 3: Run**

Run: `cd packages/tui && bun test __tests__/components/ProviderKeyInput.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/tui/src/interactive/components/ProviderKeyInput.tsx packages/tui/__tests__/components/ProviderKeyInput.test.tsx
git commit -m "feat(tui): add ProviderKeyInput component with templated prefix/suffix"
```

---

### Task 18: `CampaignSetup` screen (Step 1)

**Files:**
- Create: `packages/tui/src/interactive/screens/CampaignSetup.tsx`

The pattern established here is followed by Tasks 19-22. Read carefully.

- [ ] **Step 1: Implement `packages/tui/src/interactive/screens/CampaignSetup.tsx`**

```tsx
import { useReducer, useEffect, useState } from 'react';
import { useKeyboard } from '@opentui/react';
import { getChains, probeToken, type ChainCategory } from '@titrate/sdk';
import { useCampaignStorage, useManifest } from '../context.js';
import type { StepProps } from '../App.js';

type Field = 'chain' | 'tokenAddress' | 'batchSize';

type State = {
  readonly focus: Field;
  readonly chainId: number;
  readonly tokenAddress: string;
  readonly batchSize: number;
  readonly probeStatus: 'idle' | 'loading' | 'success' | 'error';
  readonly probedSymbol: string;
  readonly probedDecimals: number;
  readonly error: string | null;
};

type Action =
  | { readonly type: 'focus'; readonly field: Field }
  | { readonly type: 'setChain'; readonly chainId: number }
  | { readonly type: 'setTokenAddress'; readonly value: string }
  | { readonly type: 'setBatchSize'; readonly value: number }
  | { readonly type: 'probeStart' }
  | { readonly type: 'probeSuccess'; readonly symbol: string; readonly decimals: number }
  | { readonly type: 'probeError'; readonly message: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'focus': return { ...state, focus: action.field };
    case 'setChain': return { ...state, chainId: action.chainId };
    case 'setTokenAddress': return { ...state, tokenAddress: action.value };
    case 'setBatchSize': return { ...state, batchSize: action.value };
    case 'probeStart': return { ...state, probeStatus: 'loading', error: null };
    case 'probeSuccess': return { ...state, probeStatus: 'success', probedSymbol: action.symbol, probedDecimals: action.decimals };
    case 'probeError': return { ...state, probeStatus: 'error', error: action.message };
  }
}

export function CampaignSetup({ onDone, onBack }: StepProps) {
  const { manifest, refresh } = useManifest();
  const storage = useCampaignStorage();
  const [state, dispatch] = useReducer(reducer, {
    focus: 'chain',
    chainId: manifest.chainId,
    tokenAddress: manifest.tokenAddress,
    batchSize: manifest.batchSize,
    probeStatus: 'idle',
    probedSymbol: manifest.contractName,
    probedDecimals: manifest.tokenDecimals,
    error: null,
  });

  const chains = [
    ...getChains('mainnet'),
    ...getChains('testnet'),
  ];

  useKeyboard((key) => {
    if (key.name === 'escape') onBack();
    if (key.name === 'tab') {
      const fields: Field[] = ['chain', 'tokenAddress', 'batchSize'];
      const i = fields.indexOf(state.focus);
      dispatch({ type: 'focus', field: fields[(i + 1) % fields.length] });
    }
    if (key.name === 'return' && state.probeStatus === 'success') {
      save();
    }
  });

  async function save() {
    await storage.manifest.update({
      chainId: state.chainId,
      tokenAddress: state.tokenAddress as `0x${string}`,
      tokenDecimals: state.probedDecimals,
      contractName: state.probedSymbol,
      batchSize: state.batchSize,
    });
    await refresh();
    onDone();
  }

  // Auto-probe token on address change
  useEffect(() => {
    if (state.tokenAddress.length !== 42) return;
    dispatch({ type: 'probeStart' });
    probeToken({
      chainId: state.chainId,
      tokenAddress: state.tokenAddress as `0x${string}`,
    }).then(
      (res) => dispatch({ type: 'probeSuccess', symbol: res.symbol, decimals: res.decimals }),
      (err) => dispatch({ type: 'probeError', message: String(err) }),
    );
  }, [state.chainId, state.tokenAddress]);

  return (
    <box border padding={1} flexDirection="column">
      <text><strong>Step 1 — Campaign Setup</strong></text>
      <box marginTop={1} flexDirection="column">
        <text>Chain:</text>
        <select
          focused={state.focus === 'chain'}
          options={chains.map((c) => ({ label: c.name, value: String(c.chainId) }))}
          onChange={(v: string) => dispatch({ type: 'setChain', chainId: Number(v) })}
        />
      </box>
      <box marginTop={1} flexDirection="column">
        <text>Token address:</text>
        <input
          focused={state.focus === 'tokenAddress'}
          value={state.tokenAddress}
          onChange={(v: string) => dispatch({ type: 'setTokenAddress', value: v })}
          placeholder="0x…"
        />
        {state.probeStatus === 'loading' && <text><span fg="gray">Probing…</span></text>}
        {state.probeStatus === 'success' && (
          <text>
            <span fg="green">✓ {state.probedSymbol} ({state.probedDecimals} decimals)</span>
          </text>
        )}
        {state.probeStatus === 'error' && (
          <text><span fg="red">{state.error}</span></text>
        )}
      </box>
      <box marginTop={1} flexDirection="column">
        <text>Batch size:</text>
        <input
          focused={state.focus === 'batchSize'}
          value={String(state.batchSize)}
          onChange={(v: string) => {
            const n = parseInt(v, 10);
            if (!Number.isNaN(n) && n > 0) dispatch({ type: 'setBatchSize', value: n });
          }}
          placeholder="200"
        />
      </box>
      <box marginTop={1}>
        <text>
          <span fg="gray">Tab: next field · Enter: save (when probe succeeds) · Esc: back</span>
        </text>
      </box>
    </box>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd packages/tui && bunx tsc --noEmit`
Expected: compiles cleanly (other screen stubs will fail — create minimal stubs in Task 19+).

- [ ] **Step 3: Commit**

```bash
git add packages/tui/src/interactive/screens/CampaignSetup.tsx
git commit -m "feat(tui): add CampaignSetup screen with token probe"
```

---

### Task 19: Remaining step screens — Addresses, Filters, Amounts

The pattern from Task 18 repeats: `useReducer` for local state, `useKeyboard` for navigation, commit to storage via `useCampaignStorage` on save, `refresh()` from manifest context.

**Files:**
- Create: `packages/tui/src/interactive/screens/Addresses.tsx`
- Create: `packages/tui/src/interactive/screens/Filters.tsx`
- Create: `packages/tui/src/interactive/screens/Amounts.tsx`

- [ ] **Step 1: Create `Addresses.tsx`**

```tsx
import { useState } from 'react';
import { useKeyboard } from '@opentui/react';
import { useCampaignStorage, useManifest } from '../context.js';
import type { StepProps } from '../App.js';
import { readFile } from 'node:fs/promises';

export function Addresses({ onDone, onBack }: StepProps) {
  const storage = useCampaignStorage();
  const { refresh } = useManifest();
  const [csvPath, setCsvPath] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  useKeyboard((key) => {
    if (key.name === 'escape') onBack();
    if (key.name === 'return' && csvPath) importCsv();
  });

  async function importCsv() {
    setStatus('loading');
    try {
      const raw = await readFile(csvPath, 'utf8');
      const rows = raw
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => {
          const [address, amount] = line.split(',');
          return { address: address.trim(), amount: amount?.trim() || null };
        });
      await storage.addresses.append(rows);
      await refresh();
      setStatus('success');
      setMessage(`${rows.length} addresses imported`);
    } catch (err) {
      setStatus('error');
      setMessage(String(err));
    }
  }

  return (
    <box border padding={1} flexDirection="column">
      <text><strong>Step 2 — Addresses</strong></text>
      <box marginTop={1} flexDirection="column">
        <text>Import from CSV path:</text>
        <input
          focused
          value={csvPath}
          onChange={setCsvPath}
          placeholder="/path/to/addresses.csv"
        />
      </box>
      {status === 'loading' && <text><span fg="gray">Loading…</span></text>}
      {status === 'success' && <text><span fg="green">{message}</span></text>}
      {status === 'error' && <text><span fg="red">{message}</span></text>}
      <box marginTop={1}>
        <text><span fg="gray">Enter: import · Esc: back</span></text>
      </box>
      <box marginTop={1}>
        <text onMouseDown={onDone}>
          <span fg="cyan">[ Done ]</span>
        </text>
      </box>
    </box>
  );
}
```

- [ ] **Step 2: Create `Filters.tsx`** (placeholder that saves an empty pipeline)

```tsx
import { useState } from 'react';
import { useKeyboard } from '@opentui/react';
import { useCampaignStorage, useManifest } from '../context.js';
import type { StepProps } from '../App.js';

export function Filters({ onDone, onBack }: StepProps) {
  const storage = useCampaignStorage();
  const { refresh } = useManifest();
  const [message, setMessage] = useState<string | null>(null);

  useKeyboard(async (key) => {
    if (key.name === 'escape') onBack();
    if (key.name === 's') {
      await storage.pipeline.write({ steps: [] });
      await refresh();
      setMessage('Pipeline saved (no filters)');
      setTimeout(onDone, 500);
    }
  });

  return (
    <box border padding={1} flexDirection="column">
      <text><strong>Step 3 — Filters</strong></text>
      <text>
        <span fg="gray">Filter configuration lands in Phase 1e. For now, press s to skip.</span>
      </text>
      {message && <text><span fg="green">{message}</span></text>}
      <box marginTop={1}>
        <text><span fg="gray">s: skip (save empty pipeline) · Esc: back</span></text>
      </box>
    </box>
  );
}
```

- [ ] **Step 3: Create `Amounts.tsx`**

```tsx
import { useState, useReducer } from 'react';
import { useKeyboard } from '@opentui/react';
import { useCampaignStorage, useManifest } from '../context.js';
import type { StepProps } from '../App.js';

type State = {
  readonly mode: 'uniform' | 'variable';
  readonly uniformAmount: string;
};

type Action =
  | { readonly type: 'setMode'; readonly mode: 'uniform' | 'variable' }
  | { readonly type: 'setAmount'; readonly value: string };

function reducer(s: State, a: Action): State {
  if (a.type === 'setMode') return { ...s, mode: a.mode };
  if (a.type === 'setAmount') return { ...s, uniformAmount: a.value };
  return s;
}

export function Amounts({ onDone, onBack }: StepProps) {
  const { manifest, refresh } = useManifest();
  const storage = useCampaignStorage();
  const [state, dispatch] = useReducer(reducer, {
    mode: manifest.amountMode,
    uniformAmount: manifest.uniformAmount ?? '',
  });
  const [message, setMessage] = useState<string | null>(null);

  useKeyboard(async (key) => {
    if (key.name === 'escape') onBack();
    if (key.name === 'return' && state.mode === 'uniform' && state.uniformAmount) {
      await storage.manifest.update({
        amountMode: 'uniform',
        uniformAmount: state.uniformAmount,
      });
      await refresh();
      setMessage('Saved');
      setTimeout(onDone, 300);
    }
  });

  return (
    <box border padding={1} flexDirection="column">
      <text><strong>Step 4 — Amounts</strong></text>
      <box marginTop={1}>
        <text>Mode:</text>
        <select
          focused
          options={[
            { label: 'Uniform (same amount per recipient)', value: 'uniform' },
            { label: 'Variable (per-recipient amounts.csv)', value: 'variable' },
          ]}
          onChange={(v: string) => dispatch({ type: 'setMode', mode: v as 'uniform' | 'variable' })}
        />
      </box>
      {state.mode === 'uniform' && (
        <box marginTop={1} flexDirection="column">
          <text>Amount (integer token base units):</text>
          <input
            focused
            value={state.uniformAmount}
            onChange={(v: string) => dispatch({ type: 'setAmount', value: v })}
            placeholder="1000000000000000000"
          />
        </box>
      )}
      {message && <text><span fg="green">{message}</span></text>}
      <box marginTop={1}>
        <text><span fg="gray">Enter: save · Esc: back</span></text>
      </box>
    </box>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/tui/src/interactive/screens/Addresses.tsx packages/tui/src/interactive/screens/Filters.tsx packages/tui/src/interactive/screens/Amounts.tsx
git commit -m "feat(tui): add Addresses, Filters, Amounts screens"
```

---

### Task 20: `Wallet` screen (Step 5) — paste signer + passphrase

**Files:**
- Create: `packages/tui/src/interactive/screens/Wallet.tsx`

- [ ] **Step 1: Implement `Wallet.tsx`**

```tsx
import { useReducer, useState } from 'react';
import { useKeyboard } from '@opentui/react';
import { privateKeyToAccount } from 'viem/accounts';
import type { Address, Hex } from 'viem';
import {
  createPasteSignerFactory,
  deriveMultipleWallets,
} from '@titrate/sdk';
import { useCampaignStorage, useManifest } from '../context.js';
import { encryptPrivateKey } from '../../utils/passphrase.js';
import type { StepProps } from '../App.js';

type Mode = 'derived' | 'imported';

type State = {
  readonly mode: Mode;
  readonly coldAddress: string;
  readonly signature: string;
  readonly walletCount: number;
  readonly walletOffset: number;
  readonly importedKeys: readonly string[];
  readonly passphrase: string;
  readonly status: 'idle' | 'saving' | 'success' | 'error';
  readonly message: string | null;
};

type Action =
  | { readonly type: 'setMode'; readonly mode: Mode }
  | { readonly type: 'setColdAddress'; readonly value: string }
  | { readonly type: 'setSignature'; readonly value: string }
  | { readonly type: 'setWalletCount'; readonly value: number }
  | { readonly type: 'addImportedKey'; readonly value: string }
  | { readonly type: 'setPassphrase'; readonly value: string }
  | { readonly type: 'saving' }
  | { readonly type: 'success'; readonly message: string }
  | { readonly type: 'error'; readonly message: string };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'setMode': return { ...s, mode: a.mode };
    case 'setColdAddress': return { ...s, coldAddress: a.value };
    case 'setSignature': return { ...s, signature: a.value };
    case 'setWalletCount': return { ...s, walletCount: a.value };
    case 'addImportedKey': return { ...s, importedKeys: [...s.importedKeys, a.value] };
    case 'setPassphrase': return { ...s, passphrase: a.value };
    case 'saving': return { ...s, status: 'saving' };
    case 'success': return { ...s, status: 'success', message: a.message };
    case 'error': return { ...s, status: 'error', message: a.message };
  }
}

export function Wallet({ onDone, onBack }: StepProps) {
  const storage = useCampaignStorage();
  const { manifest, refresh } = useManifest();
  const [state, dispatch] = useReducer(reducer, {
    mode: manifest.wallets.mode,
    coldAddress: manifest.wallets.mode === 'derived' ? manifest.wallets.coldAddress : '',
    signature: '',
    walletCount: manifest.wallets.mode === 'derived' ? manifest.wallets.walletCount : 1,
    walletOffset: manifest.wallets.mode === 'derived' ? manifest.wallets.walletOffset : 0,
    importedKeys: [],
    passphrase: '',
    status: 'idle',
    message: null,
  });
  const [pendingKey, setPendingKey] = useState('');

  useKeyboard(async (key) => {
    if (key.name === 'escape') onBack();
    if (key.name === 'return') {
      if (state.mode === 'derived') await saveDerived();
      else await saveImported();
    }
  });

  async function saveDerived() {
    if (!state.passphrase || !state.signature || !state.coldAddress) {
      dispatch({ type: 'error', message: 'cold address, signature, and passphrase are required' });
      return;
    }
    dispatch({ type: 'saving' });
    try {
      const factory = createPasteSignerFactory({
        coldAddress: state.coldAddress as Address,
        readSignature: async () => state.signature as Hex,
      });
      const signer = await factory.create();
      const sig = await signer.signTypedData({
        domain: { name: 'Titrate', version: '1', chainId: manifest.chainId },
        types: { StorageEncryption: [{ name: 'campaignId', type: 'string' }] },
        primaryType: 'StorageEncryption',
        message: { campaignId: manifest.id },
      });
      const wallets = deriveMultipleWallets(sig, state.walletOffset, state.walletCount);
      const records = await Promise.all(
        wallets.map(async (w, i) => {
          const enc = await encryptPrivateKey(w.privateKey, state.passphrase);
          return {
            index: i,
            address: w.address as Address,
            encryptedKey: enc.ciphertext,
            kdf: enc.kdf,
            kdfParams: enc.kdfParams,
            provenance: {
              type: 'derived' as const,
              coldAddress: state.coldAddress as Address,
              derivationIndex: state.walletOffset + i,
            },
            createdAt: Date.now(),
          };
        }),
      );
      await storage.wallets.append(records);
      await storage.manifest.update({
        wallets: {
          mode: 'derived',
          coldAddress: state.coldAddress as Address,
          walletCount: state.walletCount,
          walletOffset: state.walletOffset,
        },
      });
      await refresh();
      dispatch({ type: 'success', message: `${state.walletCount} wallets derived and encrypted` });
      setTimeout(onDone, 500);
    } catch (err) {
      dispatch({ type: 'error', message: String(err) });
    }
  }

  async function saveImported() {
    if (!state.passphrase || state.importedKeys.length === 0) {
      dispatch({ type: 'error', message: 'at least one imported key and a passphrase are required' });
      return;
    }
    dispatch({ type: 'saving' });
    try {
      const records = await Promise.all(
        state.importedKeys.map(async (pk, i) => {
          const account = privateKeyToAccount(pk as Hex);
          const enc = await encryptPrivateKey(pk, state.passphrase);
          return {
            index: i,
            address: account.address,
            encryptedKey: enc.ciphertext,
            kdf: enc.kdf,
            kdfParams: enc.kdfParams,
            provenance: { type: 'imported' as const },
            createdAt: Date.now(),
          };
        }),
      );
      await storage.wallets.append(records);
      await storage.manifest.update({
        wallets: { mode: 'imported', count: state.importedKeys.length },
      });
      await refresh();
      dispatch({ type: 'success', message: `${state.importedKeys.length} wallets imported and encrypted` });
      setTimeout(onDone, 500);
    } catch (err) {
      dispatch({ type: 'error', message: String(err) });
    }
  }

  return (
    <box border padding={1} flexDirection="column">
      <text><strong>Step 5 — Hot Wallets</strong></text>
      <box marginTop={1}>
        <text>Provisioning:</text>
        <select
          focused={state.status === 'idle'}
          options={[
            { label: 'Derived from cold wallet signature', value: 'derived' },
            { label: 'Import existing private keys', value: 'imported' },
          ]}
          onChange={(v: string) => dispatch({ type: 'setMode', mode: v as Mode })}
        />
      </box>
      {state.mode === 'derived' ? (
        <box marginTop={1} flexDirection="column">
          <text>Cold address:</text>
          <input value={state.coldAddress} onChange={(v: string) => dispatch({ type: 'setColdAddress', value: v })} placeholder="0x…" />
          <text marginTop={1}>Signature (paste hex after signing externally):</text>
          <input value={state.signature} onChange={(v: string) => dispatch({ type: 'setSignature', value: v })} placeholder="0x…" />
          <text marginTop={1}>Wallet count:</text>
          <input value={String(state.walletCount)} onChange={(v: string) => {
            const n = parseInt(v, 10);
            if (!Number.isNaN(n)) dispatch({ type: 'setWalletCount', value: n });
          }} />
        </box>
      ) : (
        <box marginTop={1} flexDirection="column">
          <text>Paste private key (one at a time, press Enter after each):</text>
          <input value={pendingKey} onChange={setPendingKey} placeholder="0x…" />
          <text onMouseDown={() => {
            if (pendingKey) {
              dispatch({ type: 'addImportedKey', value: pendingKey });
              setPendingKey('');
            }
          }}>
            <span fg="cyan">[ Add ]</span>
          </text>
          <text>
            <span fg="gray">{state.importedKeys.length} key(s) added</span>
          </text>
        </box>
      )}
      <box marginTop={1} flexDirection="column">
        <text>Passphrase (protects encrypted keys):</text>
        <input value={state.passphrase} onChange={(v: string) => dispatch({ type: 'setPassphrase', value: v })} placeholder="enter a strong passphrase" />
      </box>
      {state.status === 'saving' && <text><span fg="gray">Saving…</span></text>}
      {state.status === 'success' && <text><span fg="green">{state.message}</span></text>}
      {state.status === 'error' && <text><span fg="red">{state.message}</span></text>}
      <box marginTop={1}>
        <text><span fg="gray">Enter: save · Esc: back</span></text>
      </box>
    </box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/tui/src/interactive/screens/Wallet.tsx
git commit -m "feat(tui): add Wallet screen with derived + imported provisioning"
```

---

### Task 21: `Distribute` screen (Step 6) skeleton

**Files:**
- Create: `packages/tui/src/interactive/screens/Distribute.tsx`

Phase 1 distribute is stubbed — wires into SDK `disperseTokens` in Phase 1d.

- [ ] **Step 1: Implement stub `Distribute.tsx`**

```tsx
import { useState } from 'react';
import { useKeyboard } from '@opentui/react';
import type { StepProps } from '../App.js';

export function Distribute({ onDone, onBack }: StepProps) {
  const [message, setMessage] = useState<string | null>(null);

  useKeyboard((key) => {
    if (key.name === 'escape') onBack();
    if (key.name === 'd') {
      setMessage('Distribution wiring lands in Phase 1d (run titrate distribute --campaign <name>)');
    }
  });

  return (
    <box border padding={1} flexDirection="column">
      <text><strong>Step 6 — Distribute</strong></text>
      <text>
        <span fg="gray">Invoke the distributor via the scripted command: titrate distribute --campaign {'<name>'}</span>
      </text>
      {message && <text><span fg="yellow">{message}</span></text>}
      <box marginTop={1}>
        <text><span fg="gray">d: show run instructions · Esc: back</span></text>
      </box>
    </box>
  );
}
```

- [ ] **Step 2: Type-check whole TUI package**

Run: `cd packages/tui && bunx tsc --noEmit`
Expected: clean. All screens now exist; App.tsx compiles.

- [ ] **Step 3: Commit**

```bash
git add packages/tui/src/interactive/screens/Distribute.tsx
git commit -m "feat(tui): add Distribute screen stub (real wiring in Phase 1d)"
```

---

## Phase 1d — Command Wiring

### Task 22: `titrate new <name>` command

**Files:**
- Create: `packages/tui/src/commands/new-campaign.ts`

- [ ] **Step 1: Implement `new-campaign.ts`**

```typescript
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { createCampaignStorage, createSharedStorage } from '@titrate/storage-campaign';
import type { CampaignManifest } from '@titrate/sdk';
import { App } from '../interactive/App.js';
import { resolveCampaignRoot } from '../utils/campaign-root.js';

export type NewCampaignOptions = {
  readonly folder?: string;
};

export async function runNewCampaign(name: string, options: NewCampaignOptions): Promise<void> {
  const root = await resolveCampaignRoot({ folder: options.folder });
  const id = `${name}-${randomBytes(3).toString('hex')}`;
  const dir = join(root, id);

  try {
    const s = await stat(join(dir, 'campaign.json'));
    if (s) {
      console.error(`Campaign ${id} already exists at ${dir}`);
      process.exit(1);
    }
  } catch { /* expected — does not exist */ }

  const storage = createCampaignStorage(dir);
  const shared = createSharedStorage(root);
  await storage.ensureDir();

  const now = Date.now();
  const manifest: CampaignManifest = {
    id,
    funder: '0x0000000000000000000000000000000000000000',
    name,
    version: 1,
    chainId: 1,
    rpcUrl: 'https://eth.llamarpc.com',
    tokenAddress: '0x0000000000000000000000000000000000000000',
    tokenDecimals: 18,
    contractAddress: null,
    contractVariant: 'simple',
    contractName: '',
    amountMode: 'uniform',
    amountFormat: 'integer',
    uniformAmount: null,
    batchSize: 200,
    campaignId: null,
    pinnedBlock: null,
    status: 'configuring',
    wallets: { mode: 'imported', count: 0 },
    createdAt: now,
    updatedAt: now,
  };
  await storage.manifest.write(manifest);

  const renderer = await createCliRenderer({ exitOnCtrlC: true });
  createRoot(renderer).render(<App storage={storage} shared={shared} initialManifest={manifest} />);
}
```

- [ ] **Step 2: Register in `packages/tui/src/index.tsx`**

Replace `packages/tui/src/index.ts` with `packages/tui/src/index.tsx`:

```tsx
#!/usr/bin/env bun
import { Command } from 'commander';
import { runNewCampaign } from './commands/new-campaign.js';

const program = new Command();

program
  .name('titrate')
  .description('Offline-first airdrop platform for EVM chains')
  .version('0.0.1');

program
  .command('new')
  .argument('<name>', 'campaign name')
  .option('-f, --folder <path>', 'campaign root directory')
  .description('Create a new campaign and drop into the interactive dashboard')
  .action(async (name: string, options: { folder?: string }) => {
    await runNewCampaign(name, options);
  });

// Additional commands (open, list, distribute, sweep, collect, etc.)
// registered in subsequent tasks. Parse after all registrations.
program.parseAsync(process.argv);
```

- [ ] **Step 3: Delete stale `index.ts`**

```bash
rm packages/tui/src/index.ts
```

- [ ] **Step 4: Smoke-test**

```bash
cd packages/tui
bun run src/index.tsx new smoke-test --folder /tmp/titrate-smoke
```

Expected: interactive dashboard opens. Press `q` to exit. `/tmp/titrate-smoke/smoke-test-<hex>/campaign.json` exists.

- [ ] **Step 5: Commit**

```bash
git rm packages/tui/src/index.ts
git add packages/tui/src/index.tsx packages/tui/src/commands/new-campaign.ts
git commit -m "feat(tui): add titrate new command"
```

---

### Task 23: `titrate open` and `titrate list` commands

**Files:**
- Create: `packages/tui/src/commands/open-campaign.ts`
- Create: `packages/tui/src/commands/list-campaigns.ts`
- Modify: `packages/tui/src/index.tsx`

- [ ] **Step 1: Implement `open-campaign.ts`**

```typescript
import { stat, access } from 'node:fs/promises';
import { join } from 'node:path';
import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { createCampaignStorage, createSharedStorage } from '@titrate/storage-campaign';
import { App } from '../interactive/App.js';
import { resolveCampaignRoot } from '../utils/campaign-root.js';

export type OpenCampaignOptions = {
  readonly folder?: string;
};

async function resolveCampaignDir(nameOrPath: string, root: string): Promise<string> {
  // Try as absolute/relative path first
  try {
    await access(join(nameOrPath, 'campaign.json'));
    return nameOrPath;
  } catch { /* fall through */ }
  // Try as name under root
  const dir = join(root, nameOrPath);
  try {
    await access(join(dir, 'campaign.json'));
    return dir;
  } catch {
    throw new Error(`Campaign not found: ${nameOrPath} (looked in ${nameOrPath} and ${dir})`);
  }
}

export async function runOpenCampaign(nameOrPath: string, options: OpenCampaignOptions): Promise<void> {
  const root = await resolveCampaignRoot({ folder: options.folder });
  const dir = await resolveCampaignDir(nameOrPath, root);
  const storage = createCampaignStorage(dir);
  const shared = createSharedStorage(root);
  const manifest = await storage.manifest.read();

  const renderer = await createCliRenderer({ exitOnCtrlC: true });
  createRoot(renderer).render(<App storage={storage} shared={shared} initialManifest={manifest} />);
}
```

- [ ] **Step 2: Implement `list-campaigns.ts` (plain stdout, no TUI)**

```typescript
import { readdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { createCampaignStorage } from '@titrate/storage-campaign';
import { resolveCampaignRoot } from '../utils/campaign-root.js';

export type ListCampaignsOptions = {
  readonly folder?: string;
};

export async function runListCampaigns(options: ListCampaignsOptions): Promise<void> {
  const root = await resolveCampaignRoot({ folder: options.folder });
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log(`No campaigns yet (root ${root} does not exist)`);
      return;
    }
    throw err;
  }

  const rows: { id: string; name: string; status: string; updatedAt: string }[] = [];
  for (const entry of entries) {
    if (entry === '_shared') continue;
    const dir = join(root, entry);
    try {
      await access(join(dir, 'campaign.json'));
    } catch { continue; }
    const storage = createCampaignStorage(dir);
    const m = await storage.manifest.read();
    rows.push({
      id: m.id,
      name: m.name,
      status: m.status,
      updatedAt: new Date(m.updatedAt).toISOString(),
    });
  }

  if (rows.length === 0) {
    console.log(`No campaigns found in ${root}`);
    return;
  }
  console.log('ID\tNAME\tSTATUS\tUPDATED');
  for (const r of rows) {
    console.log(`${r.id}\t${r.name}\t${r.status}\t${r.updatedAt}`);
  }
}
```

- [ ] **Step 3: Register in `index.tsx`**

Add before `program.parseAsync`:

```tsx
import { runOpenCampaign } from './commands/open-campaign.js';
import { runListCampaigns } from './commands/list-campaigns.js';

program
  .command('open')
  .argument('<nameOrPath>', 'campaign name or directory path')
  .option('-f, --folder <path>', 'campaign root directory')
  .description('Open an existing campaign in the interactive dashboard')
  .action(async (nameOrPath: string, options: { folder?: string }) => {
    await runOpenCampaign(nameOrPath, options);
  });

program
  .command('list')
  .option('-f, --folder <path>', 'campaign root directory')
  .description('List campaigns in the campaign root')
  .action(async (options: { folder?: string }) => {
    await runListCampaigns(options);
  });
```

- [ ] **Step 4: Smoke-test**

```bash
cd packages/tui
bun run src/index.tsx list --folder /tmp/titrate-smoke
```

Expected: prints the `smoke-test-<hex>` campaign.

```bash
bun run src/index.tsx open smoke-test-<hex> --folder /tmp/titrate-smoke
```

Expected: interactive dashboard opens at that campaign.

- [ ] **Step 5: Commit**

```bash
git add packages/tui/src/commands/open-campaign.ts packages/tui/src/commands/list-campaigns.ts packages/tui/src/index.tsx
git commit -m "feat(tui): add titrate open and titrate list commands"
```

---

### Task 24: `--campaign` flag on `distribute`, `sweep`, `collect`

**Files:**
- Modify: `packages/tui/src/commands/distribute.ts`
- Modify: `packages/tui/src/commands/sweep.ts`
- Modify: `packages/tui/src/commands/collect.ts`

Each existing command gains an optional `--campaign <name>` flag. When set, the command loads config from the campaign directory instead of reading `--contract`/`--rpc`/etc flags. When absent, existing behavior unchanged.

- [ ] **Step 1: Read existing `distribute.ts`**

```bash
cat packages/tui/src/commands/distribute.ts
```

- [ ] **Step 2: Add `--campaign` support to `distribute.ts`**

At the top, add imports:

```typescript
import { createCampaignStorage } from '@titrate/storage-campaign';
import { resolveCampaignRoot } from '../utils/campaign-root.js';
import { decryptPrivateKey } from '../utils/passphrase.js';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
```

Add a helper to load config from campaign:

```typescript
async function loadFromCampaign(campaignName: string, folder?: string) {
  const root = await resolveCampaignRoot({ folder });
  const dir = join(root, campaignName);
  const storage = createCampaignStorage(dir);
  const manifest = await storage.manifest.read();

  const rl = createInterface({ input, output });
  const passphrase = await rl.question('Passphrase for this campaign: ');
  rl.close();

  const records = await storage.wallets.readAll();
  const privateKeys = await Promise.all(
    records.map((r) =>
      decryptPrivateKey({
        ciphertext: r.encryptedKey,
        iv: '', authTag: '',  // placeholder — encryptedKey MUST include these in a proper format
        kdf: r.kdf,
        kdfParams: r.kdfParams,
      }, passphrase)
        .catch(() => { throw new Error(`Could not decrypt wallet ${r.index} — wrong passphrase?`); }),
    ),
  );

  return { manifest, privateKeys, storage };
}
```

> **NOTE on encryptedKey format**: Task 13's `encryptPrivateKey` returns `{ ciphertext, iv, authTag, kdf, kdfParams }` — but the `WalletRecord` schema only stores `encryptedKey: string`. Before shipping this task, update the schema (Task 2) to either (a) store the full object inline or (b) pack iv+authTag+ciphertext into a single base64 blob. Option (a) is cleaner — revise `WalletRecord.encryptedKey` to `EncryptedKey` type and re-run tests. The plan author should make this fix in Task 2 before Task 24.

Add the option to the command:

```typescript
command
  .option('-c, --campaign <name>', 'campaign name (loads config from campaign directory)')
  .option('-f, --folder <path>', 'campaign root directory (with --campaign)');
```

In the action handler, branch at the top:

```typescript
.action(async (options) => {
  let manifest, privateKeys, storage;
  if (options.campaign) {
    const loaded = await loadFromCampaign(options.campaign, options.folder);
    manifest = loaded.manifest;
    privateKeys = loaded.privateKeys;
    storage = loaded.storage;
    // Use manifest.rpcUrl, manifest.tokenAddress, etc. in place of flag-driven config
  } else {
    // existing flag-driven path unchanged
  }
  // ... rest of distribute logic
});
```

- [ ] **Step 3: Repeat for `sweep.ts`**

Same pattern: add `--campaign` + `--folder`, load manifest+wallets from storage, append sweep records to `storage.sweeps`.

- [ ] **Step 4: Repeat for `collect.ts`**

Same pattern: `--campaign` + `--folder`, append collected addresses to `storage.addresses`, advance cursor.

- [ ] **Step 5: Type-check**

```bash
cd packages/tui && bunx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/tui/src/commands/distribute.ts packages/tui/src/commands/sweep.ts packages/tui/src/commands/collect.ts
git commit -m "feat(tui): add --campaign flag to distribute, sweep, collect"
```

---

### Task 25: Delete stale clack-based wizard + steps

**Files:**
- Delete: `packages/tui/src/interactive/wizard.ts`
- Delete: `packages/tui/src/interactive/steps/campaign.ts`
- Delete: `packages/tui/src/interactive/steps/addresses.ts`
- Delete: `packages/tui/src/interactive/steps/filters.ts`
- Delete: `packages/tui/src/interactive/steps/amounts.ts`
- Delete: `packages/tui/src/interactive/steps/wallet.ts`
- Delete: `packages/tui/src/interactive/steps/distribute.ts`
- Delete: `packages/tui/src/interactive/format.ts`

- [ ] **Step 1: Verify nothing imports from these files**

```bash
cd packages/tui
grep -rln "interactive/wizard\|interactive/steps\|interactive/format" src/ __tests__/ 2>&1
```

Expected: no matches. If there are, fix the importers first.

- [ ] **Step 2: Delete the files**

```bash
rm -r packages/tui/src/interactive/steps
rm packages/tui/src/interactive/wizard.ts packages/tui/src/interactive/format.ts
```

- [ ] **Step 3: Type-check**

```bash
cd packages/tui && bunx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Full test run**

```bash
cd packages/tui && bun test
```

Expected: PASS — all tests.

- [ ] **Step 5: Commit**

```bash
git add -A packages/tui/src/interactive
git commit -m "chore(tui): remove clack-based wizard and step files"
```

---

## Phase 1e — Signer & Encryption Polish

### Task 26: WalletConnect signer

**Files:**
- Create: `packages/sdk/src/signers/walletconnect.ts`
- Modify: `packages/sdk/src/signers/index.ts`
- Create: `packages/tui/src/interactive/components/QRCode.tsx`

- [ ] **Step 1: Install WC deps in SDK**

```bash
cd packages/sdk
npm install @walletconnect/sign-client@^2 @walletconnect/utils@^2 qrcode@^1
npm install -D @types/qrcode
```

- [ ] **Step 2: Implement `packages/sdk/src/signers/walletconnect.ts`**

```typescript
import type { Address, Hex, TypedDataDefinition } from 'viem';
import type { EIP712Signer, SignerFactory } from './types.js';

export type WalletConnectOptions = {
  readonly projectId: string;
  readonly chainId: number;
  readonly onQR: (uri: string) => void;
  readonly onApproval: (address: Address) => void;
};

export function createWalletConnectSignerFactory(options: WalletConnectOptions): SignerFactory {
  return {
    id: 'walletconnect',
    label: 'WalletConnect',
    async available() {
      try {
        // Reachability check: attempt a DNS resolution of the relay host
        return true;
      } catch { return false; }
    },
    async create(): Promise<EIP712Signer> {
      const { SignClient } = await import('@walletconnect/sign-client');
      const client = await SignClient.init({
        projectId: options.projectId,
        metadata: {
          name: 'Titrate',
          description: 'Titrate TUI',
          url: 'https://titrate.local',
          icons: [],
        },
      });
      const { uri, approval } = await client.connect({
        requiredNamespaces: {
          eip155: {
            methods: ['eth_signTypedData_v4'],
            chains: [`eip155:${options.chainId}`],
            events: [],
          },
        },
      });
      if (uri) options.onQR(uri);
      const session = await approval();
      const account = session.namespaces.eip155.accounts[0];
      const address = account.split(':')[2] as Address;
      options.onApproval(address);

      return {
        async getAddress() { return address; },
        async signTypedData(payload: TypedDataDefinition) {
          const result = await client.request({
            topic: session.topic,
            chainId: `eip155:${options.chainId}`,
            request: {
              method: 'eth_signTypedData_v4',
              params: [address, JSON.stringify(payload)],
            },
          });
          return result as Hex;
        },
        async close() {
          await client.disconnect({
            topic: session.topic,
            reason: { code: 6000, message: 'User done' },
          });
        },
      };
    },
  };
}
```

- [ ] **Step 3: Export from signers barrel**

Append to `packages/sdk/src/signers/index.ts`:

```typescript
export { createWalletConnectSignerFactory, type WalletConnectOptions } from './walletconnect.js';
```

- [ ] **Step 4: Implement `packages/tui/src/interactive/components/QRCode.tsx`**

```tsx
import { useEffect, useState } from 'react';
import QRCodeLib from 'qrcode';

export function QRCode({ value }: { value: string }) {
  const [ascii, setAscii] = useState<string>('');
  useEffect(() => {
    QRCodeLib.toString(value, { type: 'terminal', small: true }).then(setAscii);
  }, [value]);
  return (
    <box flexDirection="column">
      <text>{ascii}</text>
    </box>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/signers/walletconnect.ts packages/sdk/src/signers/index.ts packages/sdk/package.json packages/sdk/package-lock.json packages/tui/src/interactive/components/QRCode.tsx
git commit -m "feat(sdk,tui): add WalletConnect signer with terminal QR renderer"
```

---

### Task 27: Ledger signer (stretch)

**Files:**
- Create: `packages/sdk/src/signers/ledger.ts`
- Modify: `packages/sdk/src/signers/index.ts`

- [ ] **Step 1: Install deps**

```bash
cd packages/sdk
npm install @ledgerhq/hw-app-eth @ledgerhq/hw-transport-node-hid
```

- [ ] **Step 2: Implement `packages/sdk/src/signers/ledger.ts`**

```typescript
import type { Address, Hex, TypedDataDefinition } from 'viem';
import type { EIP712Signer, SignerFactory } from './types.js';

export type LedgerOptions = {
  readonly derivationPath: string;   // e.g., "44'/60'/0'/0/0"
};

export function createLedgerSignerFactory(options: LedgerOptions): SignerFactory {
  return {
    id: 'ledger',
    label: 'Ledger',
    async available() {
      try {
        const { default: Transport } = await import('@ledgerhq/hw-transport-node-hid');
        const devices = await Transport.list();
        return devices.length > 0;
      } catch {
        return false;
      }
    },
    async create(): Promise<EIP712Signer> {
      const { default: Transport } = await import('@ledgerhq/hw-transport-node-hid');
      const { default: Eth } = await import('@ledgerhq/hw-app-eth');
      const transport = await Transport.create();
      const eth = new Eth(transport);
      const { address } = await eth.getAddress(options.derivationPath);
      const normalized = address as Address;

      return {
        async getAddress() { return normalized; },
        async signTypedData(payload: TypedDataDefinition) {
          const result = await eth.signEIP712Message(options.derivationPath, payload as unknown as Record<string, unknown>);
          return `0x${result.r}${result.s}${result.v.toString(16).padStart(2, '0')}` as Hex;
        },
        async close() { await transport.close(); },
      };
    },
  };
}
```

- [ ] **Step 3: Export**

```typescript
// packages/sdk/src/signers/index.ts
export { createLedgerSignerFactory, type LedgerOptions } from './ledger.js';
```

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/signers/ledger.ts packages/sdk/src/signers/index.ts packages/sdk/package.json packages/sdk/package-lock.json
git commit -m "feat(sdk): add Ledger signer (stretch)"
```

---

### Task 28: Fix `WalletRecord.encryptedKey` to store full envelope

This is the fixup referenced in Task 24's NOTE. The schema as written in Task 2 stored `encryptedKey: string` — but the encryption envelope also needs `iv` and `authTag`. Fix it now before distribution depends on it.

**Files:**
- Modify: `packages/sdk/src/storage/index.ts`
- Modify: Tests that use `WalletRecord`

- [ ] **Step 1: Update schema**

Replace the `encryptedKey: string` field in `WalletRecord` with:

```typescript
export type EncryptedKeyEnvelope = {
  readonly ciphertext: string;   // base64
  readonly iv: string;           // base64
  readonly authTag: string;      // base64
};

// Within WalletRecord:
readonly encryptedKey: EncryptedKeyEnvelope;
```

- [ ] **Step 2: Export `EncryptedKeyEnvelope`**

```typescript
// packages/sdk/src/index.ts
export type { EncryptedKeyEnvelope } from './storage/index.js';
```

- [ ] **Step 3: Update Task 13's `encryptPrivateKey` to return this envelope shape directly**

Modify `packages/tui/src/utils/passphrase.ts` return type to match. The fields already are right — just ensure the `EncryptedKey` type is structurally compatible.

- [ ] **Step 4: Update Wallet.tsx usage**

In `saveDerived` / `saveImported`:

```typescript
const enc = await encryptPrivateKey(w.privateKey, state.passphrase);
return {
  index: i,
  address: w.address as Address,
  encryptedKey: { ciphertext: enc.ciphertext, iv: enc.iv, authTag: enc.authTag },
  kdf: enc.kdf,
  kdfParams: enc.kdfParams,
  provenance: { /* ... */ },
  createdAt: Date.now(),
};
```

- [ ] **Step 5: Update `loadFromCampaign` in distribute.ts**

```typescript
const privateKeys = await Promise.all(
  records.map((r) =>
    decryptPrivateKey({
      ciphertext: r.encryptedKey.ciphertext,
      iv: r.encryptedKey.iv,
      authTag: r.encryptedKey.authTag,
      kdf: r.kdf,
      kdfParams: r.kdfParams,
    }, passphrase),
  ),
);
```

- [ ] **Step 6: Fix tests**

Update `packages/sdk/src/__tests__/storage-records.test.ts` to use the envelope:

```typescript
encryptedKey: { ciphertext: 'ct', iv: 'iv', authTag: 'at' },
```

Update `packages/storage-campaign/__tests__/campaign-storage.test.ts` the same way.

- [ ] **Step 7: Run all affected tests**

```bash
cd packages/sdk && npx vitest run
cd ../storage-campaign && npx vitest run
cd ../tui && bun test
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/sdk/src/storage/index.ts packages/sdk/src/index.ts packages/sdk/src/__tests__/storage-records.test.ts packages/tui/src/utils/passphrase.ts packages/tui/src/interactive/screens/Wallet.tsx packages/tui/src/commands/distribute.ts packages/storage-campaign/__tests__/campaign-storage.test.ts
git commit -m "fix(sdk): WalletRecord.encryptedKey uses full IV+authTag+ciphertext envelope"
```

---

### Task 29: Anvil end-to-end integration test

**Files:**
- Create: `packages/tui/__tests__/integration/full-campaign.test.ts`

- [ ] **Step 1: Implement the test**

```typescript
import { test, expect, beforeAll } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCampaignStorage, createSharedStorage } from '@titrate/storage-campaign';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { encryptPrivateKey } from '../../src/utils/passphrase.ts';

const ANVIL_RPC = process.env.ANVIL_RPC ?? 'http://127.0.0.1:8545';

async function anvilUp(): Promise<boolean> {
  try {
    const res = await fetch(ANVIL_RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', id: 1 }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

test.skipIf(!(await anvilUp()))('full campaign lifecycle — create, configure, encrypt, read back', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'titrate-e2e-'));
  const storage = createCampaignStorage(dir);
  const shared = createSharedStorage(dir);
  await storage.ensureDir();

  // 1. Write manifest
  const manifest = {
    id: 'e2e-test', funder: '0x0000000000000000000000000000000000000001' as const,
    name: 'e2e', version: 1, chainId: 31337, rpcUrl: ANVIL_RPC,
    tokenAddress: '0x0000000000000000000000000000000000000002' as const, tokenDecimals: 18,
    contractAddress: null, contractVariant: 'simple' as const, contractName: 'X',
    amountMode: 'uniform' as const, amountFormat: 'integer' as const,
    uniformAmount: '1000000000000000000', batchSize: 10, campaignId: null, pinnedBlock: null,
    status: 'configuring' as const, wallets: { mode: 'imported' as const, count: 0 },
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  await storage.manifest.write(manifest);

  // 2. Import 3 wallets
  const pks = [generatePrivateKey(), generatePrivateKey(), generatePrivateKey()];
  const passphrase = 'test-pass';
  const records = await Promise.all(
    pks.map(async (pk, i) => {
      const acc = privateKeyToAccount(pk);
      const enc = await encryptPrivateKey(pk, passphrase);
      return {
        index: i, address: acc.address,
        encryptedKey: { ciphertext: enc.ciphertext, iv: enc.iv, authTag: enc.authTag },
        kdf: enc.kdf, kdfParams: enc.kdfParams,
        provenance: { type: 'imported' as const }, createdAt: Date.now(),
      };
    }),
  );
  await storage.wallets.append(records);

  // 3. Re-read and verify
  const readBack = await storage.wallets.readAll();
  expect(readBack).toHaveLength(3);
  expect(readBack[0].address).toBe(records[0].address);

  // 4. Append 10 addresses + 3 filtered
  await storage.addresses.append(Array.from({ length: 10 }, (_, i) => ({ address: `0x${i.toString(16).padStart(40, '0')}`, amount: null })));
  await storage.filtered.append(Array.from({ length: 3 }, (_, i) => ({ address: `0x${i.toString(16).padStart(40, '0')}`, amount: null })));
  expect(await storage.addresses.count()).toBe(10);
  expect(await storage.filtered.count()).toBe(3);

  // 5. Write and read cursor
  await storage.cursor.write({
    scan: { lastBlock: 42n, endBlock: null, addressCount: 10 },
    filter: { watermark: 10, qualifiedCount: 3 },
    distribute: { watermark: 0, confirmedCount: 0 },
  });
  const cursor = await storage.cursor.read();
  expect(cursor.scan.lastBlock).toBe(42n);
});
```

- [ ] **Step 2: Run**

```bash
# With Anvil up
anvil &
cd packages/tui && bun test __tests__/integration/full-campaign.test.ts
```

Expected: PASS when Anvil is up, SKIP when it's not.

- [ ] **Step 3: Commit**

```bash
git add packages/tui/__tests__/integration/full-campaign.test.ts
git commit -m "test(tui): add Anvil-gated full campaign lifecycle test"
```

---

## Phase 1f — Regression

### Task 30: Full test suite sweep

- [ ] **Step 1: Run every package's test suite**

```bash
cd /Users/michaelmclaughlin/Documents/morbius/github/titrate

# SDK + storage packages + web (Node/Vitest)
cd packages/sdk && npx vitest run && cd -
cd packages/storage-campaign && npx vitest run && cd -
cd packages/storage-fs && npx vitest run && cd -
cd packages/storage-idb && npx vitest run && cd -
cd packages/web && yarn test && cd -

# TUI (Bun test)
cd packages/tui && bun test && cd -

# Contracts (Forge)
cd packages/contracts && forge test && cd -
```

Expected: every command exits 0.

- [ ] **Step 2: Tally results** and record in `progress.txt`

Edit `progress.txt` — append a new dated checkpoint section with test counts per package and a summary of what landed in Phase 1 (a-f).

- [ ] **Step 3: Commit**

```bash
git add progress.txt
git commit -m "docs: checkpoint — Phase 1 complete, campaign lifecycle + OpenTUI + encrypted wallets"
```

---

### Task 31: Root-level test aggregation script (optional)

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Add root script**

```json
{
  "scripts": {
    "test:all": "yarn workspace @titrate/sdk test && yarn workspace @titrate/storage-campaign test && yarn workspace @titrate/storage-fs test && yarn workspace @titrate/storage-idb test && yarn workspace @titrate/web test && cd packages/tui && bun test && cd - && cd packages/contracts && forge test && cd -"
  }
}
```

- [ ] **Step 2: Verify**

```bash
yarn test:all
```

Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add test:all root script for full regression"
```

---

## Self-Review

**Spec coverage** — every spec section has at least one task:
- Overview + CLI surface → Tasks 22, 23, 24 (new/open/list)
- Campaign Directory Structure → Tasks 6-10 (storage-campaign)
- Data Model (Manifest, Cursor, Pipeline) → Tasks 1, 9
- Interactive Framework (runtime, nav, state tiers, dashboard) → Tasks 11, 15, 16
- Wallet Provisioning & Encryption → Tasks 2, 13, 20, 28
- Signer Abstraction (paste/WC/Ledger) → Tasks 5, 26, 27
- RPC Provider Catalog → Tasks 3, 4, 17
- Live Pipeline Orchestration → Phase 2 (not in scope for this plan)
- What Changes vs What Stays → covered by the phased tasks
- Phasing (1a-1f) → sections of this plan

**Placeholder scan** — none; every step has exact code or exact commands.

**Type consistency** — `WalletRecord.encryptedKey` reconciled in Task 28 (envelope, not bare string). `StepProps` defined in App.tsx (Task 15) and used by every screen. `CampaignStorage` and `SharedStorage` types used consistently.

**Ambiguity check** — "delete clack-based wizard (after feature parity)" made explicit in Task 25, which runs only after Tasks 16-23 deliver parity.

---

## Execution

Plan complete. Save this file with `git add` + commit, then choose execution mode:

1. **Subagent-Driven (recommended)** — dispatch one fresh subagent per task, review between.
2. **Inline execution** — run tasks sequentially in this session using superpowers:executing-plans.

Both paths will check each step's box as it lands. Phase 1a and 1b have no file overlap — they can be dispatched in parallel. Phase 1c depends on 1a (SDK types). Phase 1d depends on 1c. Phase 1e depends on 1c+1d. Phase 1f depends on everything.



