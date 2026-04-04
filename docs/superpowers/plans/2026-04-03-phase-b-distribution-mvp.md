# Phase B: Distribution MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the Phase C component library into a working web app: wallet connection, encrypted storage, React Router, provider tree, query hooks, 7-step campaign flow with step locking, perry mode, and settings page.

**Architecture:** Bottom-up build in 3 phases within one plan. First, infrastructure: SDK storage interface expansion (ChainConfigStore, AppSettingsStore), new IDB stores, web package dependencies, AES-GCM encryption, and the encrypted storage wrapper. Second, React providers + routing: theme, wallet (Reown AppKit), storage, chain, and campaign providers form a layered context tree; React Router connects pages; query hooks wrap SDK calls with TanStack caching. Third, step forms: 7 step components consume providers and compose the Phase C pure components.

**Tech Stack:** React 19, React Router, Reown AppKit, wagmi, TanStack Query, Viem, Tailwind CSS v4, Web Crypto API (AES-GCM), Vitest + RTL

**Note:** The generic RequestBus refactor is already complete (prior task). This plan uses it directly.

---

## File Structure

### SDK changes

| File | Change |
|------|--------|
| `packages/sdk/src/storage/index.ts` | Add `StoredChainConfig`, `ChainConfigStore`, `AppSettingsStore` types; extend `Storage` interface |
| `packages/sdk/src/index.ts` | Export new storage types |

### Storage-IDB changes

| File | Responsibility |
|------|----------------|
| `packages/storage-idb/src/chain-configs.ts` | New: `createChainConfigStore` |
| `packages/storage-idb/src/app-settings.ts` | New: `createAppSettingsStore` |
| `packages/storage-idb/src/db.ts` | Add `chainConfigs` + `appSettings` object stores, bump DB version |
| `packages/storage-idb/src/index.ts` | Wire new stores into `createIDBStorage` |

### Web package (`packages/web/src/`)

| File | Responsibility |
|------|----------------|
| **Crypto** | |
| `crypto/encrypt.ts` | AES-GCM encrypt/decrypt + key derivation from signature |
| `crypto/storage-wrapper.ts` | `createEncryptedStorage` — wraps Storage with field-level encryption |
| **Providers** | |
| `providers/ThemeProvider.tsx` | Theme context (light/dark/system) + localStorage |
| `providers/WalletProvider.tsx` | Reown AppKit + wagmi config + perry mode |
| `providers/StorageProvider.tsx` | IDB creation + encryption key derivation + encrypted wrapper |
| `providers/ChainProvider.tsx` | PublicClient + ExplorerBus per active campaign chain |
| `providers/CampaignProvider.tsx` | All campaigns + active focus + step locking |
| **Hooks** | |
| `hooks/useTokenMetadata.ts` | TanStack Query wrapper for `probeToken` |
| `hooks/useNativeBalance.ts` | TanStack Query wrapper for native balance |
| `hooks/useTokenBalance.ts` | TanStack Query wrapper for ERC-20 balance |
| `hooks/useGasEstimate.ts` | TanStack Query wrapper for gas estimation |
| **Components** | |
| `components/Header.tsx` | Global header: wordmark, theme toggle, settings link, wallet badge |
| `components/ThemeToggle.tsx` | Light/dark/system button group |
| `components/EncryptedField.tsx` | Renders ciphertext + subtle lock icon |
| **Pages** | |
| `pages/HomePage.tsx` | Campaign grid + "New Campaign" button |
| `pages/CampaignPage.tsx` | Step flow orchestrator with AppShell + TimelineRail |
| `pages/SettingsPage.tsx` | Chain config CRUD + theme |
| **Steps** | |
| `steps/CampaignStep.tsx` | Chain selection, token address, contract config |
| `steps/AddressesStep.tsx` | CSV upload, scanner config |
| `steps/FiltersStep.tsx` | Pipeline filter configuration |
| `steps/AmountsStep.tsx` | Uniform/variable amount setup |
| `steps/WalletStep.tsx` | Normal mode + perry mode derivation |
| `steps/RequirementsStep.tsx` | Gas + token balance check |
| `steps/DistributeStep.tsx` | Deploy + batch distribution with live progress |

### Test files

| File | Covers |
|------|--------|
| `packages/sdk/src/__tests__/storage/chain-config-types.test.ts` | Type validation for new storage interfaces |
| `packages/storage-idb/src/__tests__/chain-configs.test.ts` | ChainConfigStore CRUD |
| `packages/storage-idb/src/__tests__/app-settings.test.ts` | AppSettingsStore CRUD |
| `packages/web/src/crypto/encrypt.test.ts` | AES-GCM roundtrip, key derivation |
| `packages/web/src/crypto/storage-wrapper.test.ts` | Encrypted storage field interception |
| `packages/web/src/providers/ThemeProvider.test.tsx` | Theme toggle, localStorage |
| `packages/web/src/providers/CampaignProvider.test.tsx` | Step locking logic |
| `packages/web/src/components/Header.test.tsx` | Header rendering |
| `packages/web/src/components/ThemeToggle.test.tsx` | Toggle behavior |
| `packages/web/src/components/EncryptedField.test.tsx` | Ciphertext + lock display |
| `packages/web/src/hooks/*.test.ts` | Query hook caching |
| `packages/web/src/pages/HomePage.test.tsx` | Campaign grid rendering |

---

### Task 1: SDK Storage interface expansion

**Files:**
- Modify: `packages/sdk/src/storage/index.ts`
- Modify: `packages/sdk/src/index.ts`

- [ ] **Step 1: Add new types and interfaces to storage**

Add to `packages/sdk/src/storage/index.ts` (after `StoredWallet` type, before the store interfaces):

```typescript
export type StoredChainConfig = {
  readonly id: string;
  readonly chainId: number;
  readonly name: string;
  readonly rpcUrl: string;
  readonly rpcBusKey: string;
  readonly explorerApiUrl: string;
  readonly explorerApiKey: string;
  readonly explorerBusKey: string;
  readonly trueBlocksUrl: string;
  readonly trueBlocksBusKey: string;
};
```

Add new store interfaces (after `PipelineConfigStore`):

```typescript
export interface ChainConfigStore {
  get(id: string): Promise<StoredChainConfig | null>;
  getByChainId(chainId: number): Promise<StoredChainConfig | null>;
  put(config: StoredChainConfig): Promise<void>;
  list(): Promise<readonly StoredChainConfig[]>;
  delete(id: string): Promise<void>;
}

export interface AppSettingsStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
```

Extend the `Storage` interface:

```typescript
export interface Storage {
  readonly campaigns: CampaignStore;
  readonly addressSets: AddressSetStore;
  readonly addresses: AddressStore;
  readonly batches: BatchStore;
  readonly wallets: WalletStore;
  readonly pipelineConfigs: PipelineConfigStore;
  readonly chainConfigs: ChainConfigStore;
  readonly appSettings: AppSettingsStore;
}
```

- [ ] **Step 2: Export new types from SDK barrel**

Add to `packages/sdk/src/index.ts` in the Storage section:

```typescript
export type {
  // ... existing exports
  StoredChainConfig,
  ChainConfigStore,
  AppSettingsStore,
} from './storage/index.js';
```

- [ ] **Step 3: Build SDK**

Run: `cd packages/sdk && npx tsc`
Expected: This will cause type errors in `storage-idb` and `storage-fs` because they implement `Storage` but now lack `chainConfigs` and `appSettings`. That's expected — we fix them in the next tasks.

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/storage/index.ts packages/sdk/src/index.ts
git commit -m "feat(sdk): add ChainConfigStore and AppSettingsStore to Storage interface"
```

---

### Task 2: IDB chain config + app settings stores

**Files:**
- Create: `packages/storage-idb/src/chain-configs.ts`
- Create: `packages/storage-idb/src/app-settings.ts`
- Create: `packages/storage-idb/src/__tests__/chain-configs.test.ts`
- Create: `packages/storage-idb/src/__tests__/app-settings.test.ts`
- Modify: `packages/storage-idb/src/db.ts`
- Modify: `packages/storage-idb/src/index.ts`

- [ ] **Step 1: Write failing chain config tests**

```typescript
// packages/storage-idb/src/__tests__/chain-configs.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createIDBStorage } from '../index.js';
import type { Storage, StoredChainConfig } from '@titrate/sdk';

const testConfig: StoredChainConfig = {
  id: 'eth-main', chainId: 1, name: 'Ethereum',
  rpcUrl: 'https://eth.llamarpc.com', rpcBusKey: 'llamarpc',
  explorerApiUrl: 'https://api.etherscan.io/api', explorerApiKey: 'ABC123',
  explorerBusKey: 'api.etherscan.io',
  trueBlocksUrl: '', trueBlocksBusKey: '',
};

describe('ChainConfigStore', () => {
  let storage: Storage;
  beforeEach(async () => {
    storage = await createIDBStorage(`test-${Math.random()}`);
  });

  it('put and get roundtrip', async () => {
    await storage.chainConfigs.put(testConfig);
    const result = await storage.chainConfigs.get('eth-main');
    expect(result).toMatchObject({ chainId: 1, name: 'Ethereum' });
  });

  it('getByChainId returns matching config', async () => {
    await storage.chainConfigs.put(testConfig);
    const result = await storage.chainConfigs.getByChainId(1);
    expect(result?.id).toBe('eth-main');
  });

  it('list returns all configs', async () => {
    await storage.chainConfigs.put(testConfig);
    await storage.chainConfigs.put({ ...testConfig, id: 'base', chainId: 8453, name: 'Base' });
    const all = await storage.chainConfigs.list();
    expect(all).toHaveLength(2);
  });

  it('delete removes config', async () => {
    await storage.chainConfigs.put(testConfig);
    await storage.chainConfigs.delete('eth-main');
    expect(await storage.chainConfigs.get('eth-main')).toBeNull();
  });

  it('returns null for missing id', async () => {
    expect(await storage.chainConfigs.get('missing')).toBeNull();
  });
});
```

- [ ] **Step 2: Write failing app settings tests**

```typescript
// packages/storage-idb/src/__tests__/app-settings.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createIDBStorage } from '../index.js';
import type { Storage } from '@titrate/sdk';

describe('AppSettingsStore', () => {
  let storage: Storage;
  beforeEach(async () => {
    storage = await createIDBStorage(`test-${Math.random()}`);
  });

  it('put and get roundtrip', async () => {
    await storage.appSettings.put('theme', 'dark');
    expect(await storage.appSettings.get('theme')).toBe('dark');
  });

  it('returns null for missing key', async () => {
    expect(await storage.appSettings.get('missing')).toBeNull();
  });

  it('delete removes setting', async () => {
    await storage.appSettings.put('theme', 'dark');
    await storage.appSettings.delete('theme');
    expect(await storage.appSettings.get('theme')).toBeNull();
  });

  it('overwrites existing value', async () => {
    await storage.appSettings.put('theme', 'dark');
    await storage.appSettings.put('theme', 'light');
    expect(await storage.appSettings.get('theme')).toBe('light');
  });
});
```

- [ ] **Step 3: Implement chain configs store**

```typescript
// packages/storage-idb/src/chain-configs.ts
import type { IDBPDatabase } from 'idb';
import type { ChainConfigStore, StoredChainConfig } from '@titrate/sdk';

const STORE = 'chainConfigs';

export function createChainConfigStore(db: IDBPDatabase): ChainConfigStore {
  return {
    async get(id: string): Promise<StoredChainConfig | null> {
      return (await db.get(STORE, id)) ?? null;
    },

    async getByChainId(chainId: number): Promise<StoredChainConfig | null> {
      const all = await db.getAll(STORE);
      return all.find((c) => c.chainId === chainId) ?? null;
    },

    async put(config: StoredChainConfig): Promise<void> {
      await db.put(STORE, config);
    },

    async list(): Promise<readonly StoredChainConfig[]> {
      return db.getAll(STORE);
    },

    async delete(id: string): Promise<void> {
      await db.delete(STORE, id);
    },
  };
}
```

- [ ] **Step 4: Implement app settings store**

```typescript
// packages/storage-idb/src/app-settings.ts
import type { IDBPDatabase } from 'idb';
import type { AppSettingsStore } from '@titrate/sdk';

const STORE = 'appSettings';

export function createAppSettingsStore(db: IDBPDatabase): AppSettingsStore {
  return {
    async get(key: string): Promise<string | null> {
      const result = await db.get(STORE, key);
      return result?.value ?? null;
    },

    async put(key: string, value: string): Promise<void> {
      await db.put(STORE, { key, value });
    },

    async delete(key: string): Promise<void> {
      await db.delete(STORE, key);
    },
  };
}
```

- [ ] **Step 5: Update IDB schema — add new object stores**

In `packages/storage-idb/src/db.ts`, bump the DB version and add the new stores in the `upgrade` callback. Read the file first to find the exact insertion points. Add:

```typescript
if (!db.objectStoreNames.contains('chainConfigs')) {
  db.createObjectStore('chainConfigs', { keyPath: 'id' });
}
if (!db.objectStoreNames.contains('appSettings')) {
  db.createObjectStore('appSettings', { keyPath: 'key' });
}
```

Also update `openTitrateDB` (or equivalent) to accept an optional `dbName` parameter for test isolation if it doesn't already.

- [ ] **Step 6: Wire new stores into createIDBStorage**

In `packages/storage-idb/src/index.ts`, import and add:

```typescript
import { createChainConfigStore } from './chain-configs.js';
import { createAppSettingsStore } from './app-settings.js';

// In createIDBStorage return:
chainConfigs: createChainConfigStore(db),
appSettings: createAppSettingsStore(db),
```

- [ ] **Step 7: Update storage-fs to satisfy interface**

The `@titrate/storage-fs` package also implements `Storage`. It needs stub implementations for `chainConfigs` and `appSettings` (or real ones). Add minimal stubs that throw `'Not implemented in filesystem storage'` for now — the TUI doesn't need chain configs or app settings yet.

- [ ] **Step 8: Build and test**

Run: `cd packages/sdk && npx tsc && cd ../storage-idb && npx vitest run && cd ../storage-fs && npx tsc --noEmit`
Expected: All pass

- [ ] **Step 9: Commit**

```bash
git add packages/storage-idb/src/ packages/storage-fs/src/
git commit -m "feat(storage-idb): add chain config and app settings stores"
```

---

### Task 3: Web package dependencies + AES-GCM encryption

**Files:**
- Modify: `packages/web/package.json`
- Create: `packages/web/src/crypto/encrypt.ts`
- Create: `packages/web/src/crypto/encrypt.test.ts`

- [ ] **Step 1: Add new dependencies to web package**

Add to `packages/web/package.json` dependencies:

```json
"react-router": "^7.0.0",
"@reown/appkit": "^1.6.0",
"@reown/appkit-adapter-wagmi": "^1.6.0",
"wagmi": "^2.14.0",
"@tanstack/react-query": "^5.62.0",
"viem": "^2.23.2"
```

Run: `cd /Users/michaelmclaughlin/Documents/morbius/github/airdrop && npm install`

- [ ] **Step 2: Write failing encryption tests**

```typescript
// packages/web/src/crypto/encrypt.test.ts
import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, deriveEncryptionKey } from './encrypt.js';

describe('encrypt/decrypt', () => {
  it('roundtrips a string', async () => {
    const key = await deriveEncryptionKey('0x' + 'ab'.repeat(32));
    const ciphertext = await encrypt('hello world', key);
    expect(ciphertext).not.toBe('hello world');
    const plaintext = await decrypt(ciphertext, key);
    expect(plaintext).toBe('hello world');
  });

  it('produces different ciphertext each time (random IV)', async () => {
    const key = await deriveEncryptionKey('0x' + 'ab'.repeat(32));
    const c1 = await encrypt('same input', key);
    const c2 = await encrypt('same input', key);
    expect(c1).not.toBe(c2);
  });

  it('fails to decrypt with wrong key', async () => {
    const key1 = await deriveEncryptionKey('0x' + 'ab'.repeat(32));
    const key2 = await deriveEncryptionKey('0x' + 'cd'.repeat(32));
    const ciphertext = await encrypt('secret', key1);
    await expect(decrypt(ciphertext, key2)).rejects.toThrow();
  });
});

describe('deriveEncryptionKey', () => {
  it('produces a CryptoKey from a hex signature', async () => {
    const key = await deriveEncryptionKey('0x' + 'ab'.repeat(32));
    expect(key).toBeInstanceOf(CryptoKey);
  });

  it('produces same key for same signature', async () => {
    const sig = '0x' + 'ff'.repeat(32);
    const k1 = await deriveEncryptionKey(sig);
    const k2 = await deriveEncryptionKey(sig);
    // Can't compare CryptoKey directly, but encrypting same plaintext
    // and decrypting with the other key should work
    const ct = await encrypt('test', k1);
    const pt = await decrypt(ct, k2);
    expect(pt).toBe('test');
  });
});
```

- [ ] **Step 3: Implement encryption helpers**

```typescript
// packages/web/src/crypto/encrypt.ts
import { keccak256 } from 'viem';

/**
 * Derives an AES-GCM CryptoKey from a wallet signature.
 * signature → keccak256 → first 32 bytes → AES-GCM key.
 */
export async function deriveEncryptionKey(signature: string): Promise<CryptoKey> {
  const hash = keccak256(signature as `0x${string}`);
  // hash is 0x-prefixed hex string, 66 chars = 32 bytes
  const keyBytes = hexToBytes(hash.slice(2));
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypts a string with AES-GCM. Returns base64-encoded IV + ciphertext.
 */
export async function encrypt(plaintext: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded,
  );
  // Concatenate IV + ciphertext and base64-encode
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypts an AES-GCM encrypted string. Input is base64-encoded IV + ciphertext.
 */
export async function decrypt(encoded: string, key: CryptoKey): Promise<string> {
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(decrypted);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/web && npx vitest run src/crypto/encrypt.test.ts`
Expected: PASS — all 4 tests (jsdom environment has Web Crypto API)

- [ ] **Step 5: Commit**

```bash
git add packages/web/package.json package-lock.json \
  packages/web/src/crypto/encrypt.ts packages/web/src/crypto/encrypt.test.ts
git commit -m "feat(web): add dependencies and AES-GCM encryption helpers"
```

---

### Task 4: Encrypted storage wrapper

**Files:**
- Create: `packages/web/src/crypto/storage-wrapper.ts`
- Create: `packages/web/src/crypto/storage-wrapper.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/web/src/crypto/storage-wrapper.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEncryptedStorage } from './storage-wrapper.js';
import { deriveEncryptionKey } from './encrypt.js';
import type { Storage, StoredChainConfig } from '@titrate/sdk';

function createMockStorage(): Storage {
  const stores: Record<string, Map<string, unknown>> = {
    campaigns: new Map(),
    chainConfigs: new Map(),
    wallets: new Map(),
    appSettings: new Map(),
  };

  return {
    campaigns: {
      get: vi.fn(async (id) => stores.campaigns.get(id) ?? null),
      getByIdentity: vi.fn(async () => null),
      put: vi.fn(async (c) => { stores.campaigns.set(c.id, c); }),
      list: vi.fn(async () => [...stores.campaigns.values()]),
    },
    chainConfigs: {
      get: vi.fn(async (id) => stores.chainConfigs.get(id) ?? null),
      getByChainId: vi.fn(async () => null),
      put: vi.fn(async (c) => { stores.chainConfigs.set(c.id, c); }),
      list: vi.fn(async () => [...stores.chainConfigs.values()]),
      delete: vi.fn(async (id) => { stores.chainConfigs.delete(id); }),
    },
    wallets: {
      get: vi.fn(async (id) => stores.wallets.get(id) ?? null),
      put: vi.fn(async (w) => { stores.wallets.set(w.id, w); }),
    },
    appSettings: {
      get: vi.fn(async (key) => (stores.appSettings.get(key) as string) ?? null),
      put: vi.fn(async (key, value) => { stores.appSettings.put(key, value); }),
      delete: vi.fn(async (key) => { stores.appSettings.delete(key); }),
    },
    addressSets: {} as never,
    addresses: {} as never,
    batches: {} as never,
    pipelineConfigs: {} as never,
  } as unknown as Storage;
}

describe('createEncryptedStorage', () => {
  let key: CryptoKey;

  beforeEach(async () => {
    key = await deriveEncryptionKey('0x' + 'ab'.repeat(32));
  });

  it('encrypts rpcUrl on chainConfig put and decrypts on get', async () => {
    const mock = createMockStorage();
    const encrypted = createEncryptedStorage(mock, key);

    const config: StoredChainConfig = {
      id: 'test', chainId: 1, name: 'Ethereum',
      rpcUrl: 'https://secret-rpc.com', rpcBusKey: 'rpc',
      explorerApiUrl: 'https://api.etherscan.io', explorerApiKey: 'SECRET_KEY',
      explorerBusKey: 'etherscan',
      trueBlocksUrl: '', trueBlocksBusKey: '',
    };

    await encrypted.chainConfigs.put(config);

    // The underlying mock should have encrypted values
    const stored = (mock.chainConfigs.put as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(stored.rpcUrl).not.toBe('https://secret-rpc.com');
    expect(stored.explorerApiKey).not.toBe('SECRET_KEY');
    // But plaintext fields should pass through
    expect(stored.name).toBe('Ethereum');
    expect(stored.chainId).toBe(1);

    // Reading back should decrypt
    const result = await encrypted.chainConfigs.get('test');
    expect(result?.rpcUrl).toBe('https://secret-rpc.com');
    expect(result?.explorerApiKey).toBe('SECRET_KEY');
  });

  it('passes through campaign data unchanged', async () => {
    const mock = createMockStorage();
    const encrypted = createEncryptedStorage(mock, key);

    // Campaigns are not encrypted
    expect(encrypted.campaigns.put).toBeDefined();
    expect(encrypted.campaigns.get).toBeDefined();
  });

  it('encrypts appSettings values except theme', async () => {
    const mock = createMockStorage();
    const encrypted = createEncryptedStorage(mock, key);

    await encrypted.appSettings.put('theme', 'dark');
    // Theme should be stored as-is
    expect(mock.appSettings.put).toHaveBeenCalledWith('theme', 'dark');
  });
});
```

- [ ] **Step 2: Implement encrypted storage wrapper**

```typescript
// packages/web/src/crypto/storage-wrapper.ts
import type { Storage, StoredChainConfig, StoredWallet } from '@titrate/sdk';
import { encrypt, decrypt } from './encrypt.js';

const PLAINTEXT_SETTINGS = new Set(['theme']);

/**
 * Wraps a Storage instance with field-level AES-GCM encryption.
 * Only sensitive fields are encrypted; plaintext fields pass through unchanged.
 */
export function createEncryptedStorage(storage: Storage, key: CryptoKey): Storage {
  return {
    // Pass through unencrypted stores
    campaigns: storage.campaigns,
    addressSets: storage.addressSets,
    addresses: storage.addresses,
    batches: storage.batches,
    pipelineConfigs: storage.pipelineConfigs,

    // Encrypted stores
    chainConfigs: createEncryptedChainConfigStore(storage.chainConfigs, key),
    wallets: createEncryptedWalletStore(storage.wallets, key),
    appSettings: createEncryptedAppSettingsStore(storage.appSettings, key),
  };
}

function createEncryptedChainConfigStore(
  store: Storage['chainConfigs'],
  key: CryptoKey,
): Storage['chainConfigs'] {
  async function encryptConfig(config: StoredChainConfig): Promise<StoredChainConfig> {
    return {
      ...config,
      rpcUrl: await encrypt(config.rpcUrl, key),
      explorerApiKey: config.explorerApiKey ? await encrypt(config.explorerApiKey, key) : '',
    };
  }

  async function decryptConfig(config: StoredChainConfig): Promise<StoredChainConfig> {
    return {
      ...config,
      rpcUrl: await decrypt(config.rpcUrl, key),
      explorerApiKey: config.explorerApiKey ? await decrypt(config.explorerApiKey, key) : '',
    };
  }

  return {
    async get(id) {
      const raw = await store.get(id);
      return raw ? decryptConfig(raw) : null;
    },
    async getByChainId(chainId) {
      const raw = await store.getByChainId(chainId);
      return raw ? decryptConfig(raw) : null;
    },
    async put(config) {
      return store.put(await encryptConfig(config));
    },
    async list() {
      const all = await store.list();
      return Promise.all(all.map(decryptConfig));
    },
    async delete(id) {
      return store.delete(id);
    },
  };
}

function createEncryptedWalletStore(
  store: Storage['wallets'],
  key: CryptoKey,
): Storage['wallets'] {
  // Wallet store encrypts all fields except id and campaignId
  return {
    async get(campaignId) {
      const raw = await store.get(campaignId);
      if (!raw) return null;
      return {
        ...raw,
        hotAddress: (await decrypt(raw.hotAddress, key)) as `0x${string}`,
        coldAddress: (await decrypt(raw.coldAddress, key)) as `0x${string}`,
      };
    },
    async put(wallet) {
      return store.put({
        ...wallet,
        hotAddress: (await encrypt(wallet.hotAddress, key)) as `0x${string}`,
        coldAddress: (await encrypt(wallet.coldAddress, key)) as `0x${string}`,
      });
    },
  };
}

function createEncryptedAppSettingsStore(
  store: Storage['appSettings'],
  key: CryptoKey,
): Storage['appSettings'] {
  return {
    async get(settingKey) {
      const raw = await store.get(settingKey);
      if (raw === null) return null;
      if (PLAINTEXT_SETTINGS.has(settingKey)) return raw;
      return decrypt(raw, key);
    },
    async put(settingKey, value) {
      if (PLAINTEXT_SETTINGS.has(settingKey)) {
        return store.put(settingKey, value);
      }
      return store.put(settingKey, await encrypt(value, key));
    },
    async delete(settingKey) {
      return store.delete(settingKey);
    },
  };
}
```

- [ ] **Step 3: Run tests**

Run: `cd packages/web && npx vitest run src/crypto/`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/crypto/storage-wrapper.ts packages/web/src/crypto/storage-wrapper.test.ts
git commit -m "feat(web): add encrypted storage wrapper with field-level AES-GCM"
```

---

### Task 5: ThemeProvider + ThemeToggle

**Files:**
- Create: `packages/web/src/providers/ThemeProvider.tsx`
- Create: `packages/web/src/providers/ThemeProvider.test.tsx`
- Create: `packages/web/src/components/ThemeToggle.tsx`
- Create: `packages/web/src/components/ThemeToggle.test.tsx`

- [ ] **Step 1: Implement and test ThemeProvider + ThemeToggle**

The ThemeProvider tracks `theme: 'light' | 'dark' | 'system'`, reads/writes `localStorage` key `titrate-theme`, applies `dark` class to `document.documentElement`. ThemeToggle is a button group that cycles between the three modes.

Create all 4 files following the spec. Tests should verify:
- ThemeProvider: default to 'system', toggle changes context value, localStorage persistence, dark class applied
- ThemeToggle: renders three buttons, clicking changes theme

- [ ] **Step 2: Run tests, commit**

```bash
git commit -m "feat(web): add ThemeProvider and ThemeToggle components"
```

---

### Task 6: Header + EncryptedField components

**Files:**
- Create: `packages/web/src/components/Header.tsx`
- Create: `packages/web/src/components/Header.test.tsx`
- Create: `packages/web/src/components/EncryptedField.tsx`
- Create: `packages/web/src/components/EncryptedField.test.tsx`

- [ ] **Step 1: Implement Header**

Global header with: "Titrate" wordmark (links to `/`), ThemeToggle, settings gear icon (links to `/settings`), WalletBadge slot (placeholder for now — actual wallet connection in Task 7).

- [ ] **Step 2: Implement EncryptedField**

Renders raw encrypted ciphertext (truncated) with a subtle inline lock icon. Clicking the lock triggers `onUnlock` callback.

```typescript
type EncryptedFieldProps = {
  readonly ciphertext: string;
  readonly onUnlock?: () => void;
};
```

- [ ] **Step 3: Test both, commit**

```bash
git commit -m "feat(web): add Header and EncryptedField components"
```

---

### Task 7: WalletProvider (Reown AppKit + wagmi)

**Files:**
- Create: `packages/web/src/providers/WalletProvider.tsx`

- [ ] **Step 1: Implement WalletProvider**

Sets up Reown AppKit with wagmi adapter. Provides:
- `isConnected`, `address`, `chainId` from wagmi
- `deriveHotWallet()` — signs EIP-712 → derives hot wallet private key in memory
- `perryMode` state: `{ isActive, hotAddress, coldAddress } | null`

Uses `createAppKit` from `@reown/appkit` with wagmi adapter. The Reown project ID should come from an environment variable (`VITE_REOWN_PROJECT_ID`).

Wrap with `WagmiProvider` and Reown's modal.

- [ ] **Step 2: Commit**

No unit tests — Reown AppKit requires a real browser environment. Mocking the entire wagmi + Reown stack would be brittle. Tested manually.

```bash
git commit -m "feat(web): add WalletProvider with Reown AppKit and perry mode"
```

---

### Task 8: StorageProvider + ChainProvider

**Files:**
- Create: `packages/web/src/providers/StorageProvider.tsx`
- Create: `packages/web/src/providers/ChainProvider.tsx`

- [ ] **Step 1: Implement StorageProvider**

Creates `Storage` from `createIDBStorage()`. On wallet connect, prompts for EIP-712 signature to derive encryption key. Wraps storage with `createEncryptedStorage(storage, key)`. Stores key in `sessionStorage`. Exposes `storage: Storage | null` (null before unlock).

- [ ] **Step 2: Implement ChainProvider**

Reads active campaign's chain config from storage. Creates `PublicClient` via viem's `createPublicClient({ transport: http(rpcUrl) })`. Routes RPC calls through `getOrCreateRequestBus(rpcBusKey)`. Creates ExplorerBus if explorer API key is configured. Rebuilds when active campaign changes. Exposes `publicClient`, `explorerBus`, `chainConfig`.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(web): add StorageProvider and ChainProvider"
```

---

### Task 9: CampaignProvider + step locking

**Files:**
- Create: `packages/web/src/providers/CampaignProvider.tsx`
- Create: `packages/web/src/providers/CampaignProvider.test.tsx`

- [ ] **Step 1: Implement CampaignProvider**

Global provider that:
- Loads all campaigns from `storage.campaigns.list()` on mount
- Tracks `activeCampaignId: string | null`
- Computes step states based on saved campaign data
- Step locking logic per the spec's table (Campaign always unlocked, Addresses requires chain+token, etc.)
- Provides: `campaigns`, `activeCampaign`, `stepStates`, `createCampaign()`, `setActiveCampaign()`, `saveCampaign()`

- [ ] **Step 2: Write step locking tests**

Test the step locking logic with mock storage:
- All steps locked except Campaign for a fresh campaign
- Addresses unlocks after Campaign saved with chain + token
- Filters unlocks after addresses added
- Each step follows the locking table

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(web): add CampaignProvider with step locking"
```

---

### Task 10: Query hooks

**Files:**
- Create: `packages/web/src/hooks/useTokenMetadata.ts`
- Create: `packages/web/src/hooks/useNativeBalance.ts`
- Create: `packages/web/src/hooks/useTokenBalance.ts`
- Create: `packages/web/src/hooks/useGasEstimate.ts`

- [ ] **Step 1: Implement all 4 hooks**

Each hook uses `useQuery` from TanStack with the ChainProvider's `publicClient`:

```typescript
// Example: useTokenMetadata
export function useTokenMetadata(tokenAddress: Address | null) {
  const { publicClient } = useChain();
  return useQuery({
    queryKey: ['token-metadata', tokenAddress],
    queryFn: () => probeToken(publicClient!, tokenAddress!),
    enabled: !!publicClient && !!tokenAddress,
    staleTime: Infinity,
  });
}
```

Similar patterns for balance (15s stale) and gas estimate (30s stale).

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(web): add query hooks for token metadata, balances, gas"
```

---

### Task 11: Router + pages (Home, Campaign, Settings)

**Files:**
- Create: `packages/web/src/pages/HomePage.tsx`
- Create: `packages/web/src/pages/CampaignPage.tsx`
- Create: `packages/web/src/pages/SettingsPage.tsx`
- Modify: `packages/web/src/App.tsx`

- [ ] **Step 1: Implement HomePage**

Grid of `CampaignCard` tiles from CampaignProvider + "New Campaign" button. Clicking a card navigates to `/campaign/:id`. New Campaign creates a campaign in storage and navigates.

- [ ] **Step 2: Implement CampaignPage**

Wraps `AppShell` with `TimelineRail`. Maps step states from CampaignProvider to timeline steps. Renders the active step component in `StepPanel`.

- [ ] **Step 3: Implement SettingsPage**

Lists chain configs from storage. Add/edit/delete with `ChainSelector` + RPC URL override fields. Shows `EncryptedField` for sensitive values when locked.

- [ ] **Step 4: Wire up App.tsx with Router and provider tree**

```tsx
// packages/web/src/App.tsx
export function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <WalletProvider>
          <StorageProvider>
            <ChainProvider>
              <CampaignProvider>
                <BrowserRouter>
                  <Header />
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/campaign/:id" element={<CampaignPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                  </Routes>
                </BrowserRouter>
              </CampaignProvider>
            </ChainProvider>
          </StorageProvider>
        </WalletProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(web): add Router, HomePage, CampaignPage, SettingsPage"
```

---

### Task 12: Step forms (Campaign, Addresses, Filters, Amounts)

**Files:**
- Create: `packages/web/src/steps/CampaignStep.tsx`
- Create: `packages/web/src/steps/AddressesStep.tsx`
- Create: `packages/web/src/steps/FiltersStep.tsx`
- Create: `packages/web/src/steps/AmountsStep.tsx`

- [ ] **Step 1: Implement CampaignStep**

Hybrid chain selection (presets + custom + RPC override). Token address input with `useTokenMetadata` for auto-probe. Contract variant, name, batch size fields. Saves to CampaignProvider on submit.

- [ ] **Step 2: Implement AddressesStep**

CSV file upload (file picker, parsed via SDK `parseCSV`). Shows address count. Explorer scan config (token + block range). Saves address sources to storage.

- [ ] **Step 3: Implement FiltersStep**

Pipeline filter configuration using `PipelineStepEditor`. Add/remove filters. "No filters" explicit skip option. Shows filtered count.

- [ ] **Step 4: Implement AmountsStep**

Uses `AmountConfig` component. Uniform/variable toggle. Amount input. Shows total distribution amount.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(web): add campaign, addresses, filters, and amounts step forms"
```

---

### Task 13: Step forms (Wallet, Requirements, Distribute)

**Files:**
- Create: `packages/web/src/steps/WalletStep.tsx`
- Create: `packages/web/src/steps/RequirementsStep.tsx`
- Create: `packages/web/src/steps/DistributeStep.tsx`

- [ ] **Step 1: Implement WalletStep**

Two paths: normal mode (wallet already connected, auto-complete) and perry mode ("Derive Hot Wallet" button → EIP-712 sign → derive → show WalletBadge with perry indicator).

- [ ] **Step 2: Implement RequirementsStep**

Uses `computeRequirements` from SDK + `useNativeBalance` + `useTokenBalance` hooks. Renders `RequirementsPanel` with computed needs vs current balances. Perry mode can bypass.

- [ ] **Step 3: Implement DistributeStep**

Deploy contract button (if not deployed). Then stream batches via `disperseTokens`/`disperseTokensSimple`. Renders `BatchTimeline` with live progress. Auto-resume from last confirmed batch. Shows `SpendSummary` on completion.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(web): add wallet, requirements, and distribute step forms"
```

---

### Task 14: Final verification

- [ ] **Step 1: Run all SDK tests**

Run: `cd packages/sdk && npx vitest run`

- [ ] **Step 2: Run all storage adapter tests**

Run: `cd packages/storage-idb && npx vitest run && cd ../storage-fs && npx vitest run`

- [ ] **Step 3: Run all web tests**

Run: `cd packages/web && npx vitest run`

- [ ] **Step 4: Run all TUI tests**

Run: `cd packages/tui && npx vitest run`

- [ ] **Step 5: TypeScript check all packages**

Run: `cd packages/sdk && npx tsc --noEmit && cd ../storage-idb && npx tsc --noEmit && cd ../storage-fs && npx tsc --noEmit && cd ../tui && npx tsc --noEmit && cd ../web && npx tsc --noEmit`

- [ ] **Step 6: Build web app**

Run: `cd packages/web && npx vite build`
Expected: Clean build

- [ ] **Step 7: Manual smoke test**

Run: `cd packages/web && npx vite --port 5173`
Open http://localhost:5173 in browser. Verify:
- Home page loads with "New Campaign" button
- Theme toggle works (light/dark/system)
- Settings page accessible via gear icon
- Creating a campaign navigates to campaign detail
- Timeline shows step locking (only Campaign unlocked initially)

- [ ] **Step 8: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve issues found during Phase B verification"
```
