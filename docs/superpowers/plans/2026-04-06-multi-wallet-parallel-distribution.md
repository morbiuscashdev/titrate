# Multi-Wallet Parallel Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derive N hot wallets from one EIP-712 signature and distribute tokens in parallel via `disperseParallel`.

**Architecture:** SDK gets indexed derivation + gas-aware suggestion functions. WalletProvider manages multi-wallet state with encrypted signature persistence. WalletStep gets count/offset inputs, per-wallet funding cards. DistributeStep branches to `disperseParallel` when multiple wallets exist and adds post-distribution sweep-back.

**Tech Stack:** TypeScript, Viem, React, wagmi, IndexedDB (existing encrypted storage), Vitest

---

### Task 1: SDK — `deriveWalletAtIndex` and `deriveMultipleWallets`

**Files:**
- Modify: `packages/sdk/src/wallet/derive.ts`
- Modify: `packages/sdk/src/wallet/index.ts`
- Modify: `packages/sdk/src/index.ts`
- Create: `packages/sdk/src/wallet/__tests__/derive-multi.test.ts`

- [ ] **Step 1: Write failing tests for `deriveWalletAtIndex`**

```typescript
// packages/sdk/src/wallet/__tests__/derive-multi.test.ts
import { describe, it, expect } from 'vitest';
import { deriveWalletAtIndex, deriveMultipleWallets, deriveHotWallet } from '../derive.js';
import type { Hex } from 'viem';

const VALID_SIG = ('0x' + 'ab'.repeat(65)) as Hex;

describe('deriveWalletAtIndex', () => {
  it('returns same result as deriveHotWallet for index 0', () => {
    const legacy = deriveHotWallet(VALID_SIG);
    const indexed = deriveWalletAtIndex({ signature: VALID_SIG, index: 0 });
    expect(indexed.address).toBe(legacy.address);
    expect(indexed.privateKey).toBe(legacy.privateKey);
  });

  it('returns different wallet for index 1 vs index 0', () => {
    const w0 = deriveWalletAtIndex({ signature: VALID_SIG, index: 0 });
    const w1 = deriveWalletAtIndex({ signature: VALID_SIG, index: 1 });
    expect(w0.address).not.toBe(w1.address);
    expect(w0.privateKey).not.toBe(w1.privateKey);
  });

  it('is deterministic — same inputs produce same output', () => {
    const a = deriveWalletAtIndex({ signature: VALID_SIG, index: 3 });
    const b = deriveWalletAtIndex({ signature: VALID_SIG, index: 3 });
    expect(a.address).toBe(b.address);
    expect(a.privateKey).toBe(b.privateKey);
  });

  it('produces unique wallets for each index', () => {
    const addresses = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const w = deriveWalletAtIndex({ signature: VALID_SIG, index: i });
      addresses.add(w.address);
    }
    expect(addresses.size).toBe(10);
  });

  it('returns valid address format', () => {
    const w = deriveWalletAtIndex({ signature: VALID_SIG, index: 5 });
    expect(w.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(w.privateKey).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('throws on invalid signature', () => {
    expect(() => deriveWalletAtIndex({ signature: '0x' as Hex, index: 0 })).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run src/wallet/__tests__/derive-multi.test.ts`
Expected: FAIL — `deriveWalletAtIndex is not a function`

- [ ] **Step 3: Implement `deriveWalletAtIndex`**

Add to `packages/sdk/src/wallet/derive.ts` after the existing `deriveHotWallet` function:

```typescript
import { keccak256, concat, toHex } from 'viem';
// (keccak256 already imported, add concat and toHex)

/**
 * Derives a hot wallet at a specific index from an EIP-712 signature.
 *
 * Index 0 produces the same result as `deriveHotWallet(signature)` for
 * backward compatibility. Index > 0 appends the index as a 32-byte
 * big-endian integer before hashing.
 */
export function deriveWalletAtIndex(params: {
  readonly signature: Hex;
  readonly index: number;
}): DerivedWallet {
  validateSignature(params.signature);

  const privateKey = params.index === 0
    ? keccak256(params.signature)
    : keccak256(concat([params.signature, toHex(params.index, { size: 32 })]));

  const account = privateKeyToAccount(privateKey);
  return { address: account.address, privateKey };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run src/wallet/__tests__/derive-multi.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Write failing tests for `deriveMultipleWallets`**

Append to the same test file:

```typescript
describe('deriveMultipleWallets', () => {
  it('derives the requested count of wallets', () => {
    const wallets = deriveMultipleWallets({ signature: VALID_SIG, count: 3 });
    expect(wallets).toHaveLength(3);
  });

  it('starts at offset 0 by default', () => {
    const wallets = deriveMultipleWallets({ signature: VALID_SIG, count: 2 });
    const w0 = deriveWalletAtIndex({ signature: VALID_SIG, index: 0 });
    const w1 = deriveWalletAtIndex({ signature: VALID_SIG, index: 1 });
    expect(wallets[0].address).toBe(w0.address);
    expect(wallets[1].address).toBe(w1.address);
  });

  it('respects offset parameter', () => {
    const wallets = deriveMultipleWallets({ signature: VALID_SIG, count: 2, offset: 5 });
    const w5 = deriveWalletAtIndex({ signature: VALID_SIG, index: 5 });
    const w6 = deriveWalletAtIndex({ signature: VALID_SIG, index: 6 });
    expect(wallets[0].address).toBe(w5.address);
    expect(wallets[1].address).toBe(w6.address);
  });

  it('returns empty array for count 0', () => {
    const wallets = deriveMultipleWallets({ signature: VALID_SIG, count: 0 });
    expect(wallets).toHaveLength(0);
  });

  it('produces all unique addresses', () => {
    const wallets = deriveMultipleWallets({ signature: VALID_SIG, count: 10 });
    const addresses = new Set(wallets.map((w) => w.address));
    expect(addresses.size).toBe(10);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run src/wallet/__tests__/derive-multi.test.ts`
Expected: FAIL — `deriveMultipleWallets is not a function`

- [ ] **Step 7: Implement `deriveMultipleWallets`**

Add to `packages/sdk/src/wallet/derive.ts` after `deriveWalletAtIndex`:

```typescript
/**
 * Derives multiple hot wallets from a single signature.
 *
 * @param params.signature - The EIP-712 signature to derive from
 * @param params.count - Number of wallets to derive
 * @param params.offset - Starting index (default 0)
 * @returns Array of derived wallets at indices [offset, offset+count-1]
 */
export function deriveMultipleWallets(params: {
  readonly signature: Hex;
  readonly count: number;
  readonly offset?: number;
}): DerivedWallet[] {
  const offset = params.offset ?? 0;
  const wallets: DerivedWallet[] = [];
  for (let i = 0; i < params.count; i++) {
    wallets.push(deriveWalletAtIndex({ signature: params.signature, index: offset + i }));
  }
  return wallets;
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run src/wallet/__tests__/derive-multi.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 9: Export new functions**

Update `packages/sdk/src/wallet/index.ts`:

```typescript
export { createEIP712Message, deriveHotWallet, deriveWalletAtIndex, deriveMultipleWallets, InvalidSignatureError } from './derive.js';
export type { EIP712MessageParams, EIP712TypedData, DerivedWallet } from './derive.js';
```

Update `packages/sdk/src/index.ts` — find the existing wallet export line and add the new functions:

```typescript
export { createEIP712Message, deriveHotWallet, deriveWalletAtIndex, deriveMultipleWallets, InvalidSignatureError } from './wallet/index.js';
```

- [ ] **Step 10: Run full SDK tests**

Run: `cd packages/sdk && npx vitest run`
Expected: All existing tests pass, 11 new tests pass

- [ ] **Step 11: Commit**

```bash
git add packages/sdk/src/wallet/derive.ts packages/sdk/src/wallet/index.ts packages/sdk/src/index.ts packages/sdk/src/wallet/__tests__/derive-multi.test.ts
git commit -m "feat(sdk): add indexed wallet derivation with offset support"
```

---

### Task 2: SDK — `suggestWalletCount`

**Files:**
- Create: `packages/sdk/src/wallet/suggest.ts`
- Create: `packages/sdk/src/wallet/__tests__/suggest.test.ts`
- Modify: `packages/sdk/src/wallet/index.ts`
- Modify: `packages/sdk/src/index.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/sdk/src/wallet/__tests__/suggest.test.ts
import { describe, it, expect } from 'vitest';
import { suggestWalletCount } from '../suggest.js';

describe('suggestWalletCount', () => {
  const BASE = {
    recipientCount: 5000,
    batchSize: 100,
    gasPerBatch: 300_000n,
    blockGasLimit: 30_000_000n,
  };

  it('suggests based on recipient count and batch size', () => {
    const result = suggestWalletCount(BASE);
    // 5000 / 100 = 50 batches. floor(30M / 300k) = 100 concurrent. min(50, 100, 10) = 10
    expect(result.recommended).toBe(10);
  });

  it('caps at block gas limit', () => {
    const result = suggestWalletCount({
      ...BASE,
      gasPerBatch: 10_000_000n, // Only 3 fit in a 30M block
    });
    // 50 batches, 3 concurrent, min(50, 3, 10) = 3
    expect(result.recommended).toBe(3);
  });

  it('caps at total batch count when fewer than 10', () => {
    const result = suggestWalletCount({
      ...BASE,
      recipientCount: 200, // 2 batches
    });
    // min(2, 100, 10) = 2
    expect(result.recommended).toBe(2);
  });

  it('returns minimum of 1', () => {
    const result = suggestWalletCount({
      ...BASE,
      recipientCount: 0,
    });
    expect(result.recommended).toBe(1);
  });

  it('returns a reason string', () => {
    const result = suggestWalletCount(BASE);
    expect(result.reason).toBeTruthy();
    expect(typeof result.reason).toBe('string');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run src/wallet/__tests__/suggest.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `suggestWalletCount`**

```typescript
// packages/sdk/src/wallet/suggest.ts

/**
 * Suggests an optimal wallet count for parallel distribution based on
 * recipient count, batch configuration, and block gas constraints.
 *
 * Adding wallets beyond the block gas ceiling provides no throughput
 * improvement — batches simply queue for subsequent blocks.
 */
export function suggestWalletCount(params: {
  readonly recipientCount: number;
  readonly batchSize: number;
  readonly gasPerBatch: bigint;
  readonly blockGasLimit: bigint;
}): { readonly recommended: number; readonly reason: string } {
  const { recipientCount, batchSize, gasPerBatch, blockGasLimit } = params;

  const totalBatches = Math.ceil(recipientCount / batchSize);
  const concurrentBatches = gasPerBatch > 0n
    ? Number(blockGasLimit / gasPerBatch)
    : 1;

  const maxWallets = 10;
  const recommended = Math.max(1, Math.min(totalBatches, concurrentBatches, maxWallets));

  const reason = concurrentBatches < totalBatches && concurrentBatches < maxWallets
    ? `Block gas fits ${concurrentBatches} concurrent batches`
    : totalBatches < maxWallets
      ? `${totalBatches} batches total`
      : `Capped at ${maxWallets} wallets`;

  return { recommended, reason };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run src/wallet/__tests__/suggest.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Export from wallet index and SDK index**

Update `packages/sdk/src/wallet/index.ts` — add:

```typescript
export { suggestWalletCount } from './suggest.js';
```

Update `packages/sdk/src/index.ts` — add `suggestWalletCount` to the wallet export line:

```typescript
export { createEIP712Message, deriveHotWallet, deriveWalletAtIndex, deriveMultipleWallets, suggestWalletCount, InvalidSignatureError } from './wallet/index.js';
```

- [ ] **Step 6: Run full SDK tests**

Run: `cd packages/sdk && npx vitest run`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add packages/sdk/src/wallet/suggest.ts packages/sdk/src/wallet/__tests__/suggest.test.ts packages/sdk/src/wallet/index.ts packages/sdk/src/index.ts
git commit -m "feat(sdk): add gas-aware wallet count suggestion"
```

---

### Task 3: SDK — `zeroPrivateKey` security utility

**Files:**
- Create: `packages/sdk/src/wallet/zero.ts`
- Create: `packages/sdk/src/wallet/__tests__/zero.test.ts`
- Modify: `packages/sdk/src/wallet/index.ts`
- Modify: `packages/sdk/src/index.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/sdk/src/wallet/__tests__/zero.test.ts
import { describe, it, expect } from 'vitest';
import { zeroPrivateKey } from '../zero.js';
import type { DerivedWallet } from '../derive.js';

describe('zeroPrivateKey', () => {
  it('overwrites privateKey with zeros', () => {
    const wallet: DerivedWallet = {
      address: '0x1111111111111111111111111111111111111111',
      privateKey: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    };
    const zeroed = zeroPrivateKey(wallet);
    expect(zeroed.privateKey).toBe('0x' + '0'.repeat(64));
    expect(zeroed.address).toBe(wallet.address);
  });

  it('returns a new object (does not mutate input)', () => {
    const wallet: DerivedWallet = {
      address: '0x1111111111111111111111111111111111111111',
      privateKey: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    };
    const original = wallet.privateKey;
    zeroPrivateKey(wallet);
    expect(wallet.privateKey).toBe(original);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

- [ ] **Step 3: Implement**

```typescript
// packages/sdk/src/wallet/zero.ts
import type { Hex } from 'viem';
import type { DerivedWallet } from './derive.js';

const ZERO_KEY: Hex = ('0x' + '0'.repeat(64)) as Hex;

/**
 * Returns a copy of the wallet with the private key overwritten by zeros.
 * Call this before dereferencing derived wallets to minimize the window
 * where raw key material sits in the JS heap awaiting garbage collection.
 */
export function zeroPrivateKey(wallet: DerivedWallet): DerivedWallet {
  return { address: wallet.address, privateKey: ZERO_KEY };
}
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Export and commit**

Add to `packages/sdk/src/wallet/index.ts`:
```typescript
export { zeroPrivateKey } from './zero.js';
```

Add `zeroPrivateKey` to the SDK index export.

```bash
git add packages/sdk/src/wallet/zero.ts packages/sdk/src/wallet/__tests__/zero.test.ts packages/sdk/src/wallet/index.ts packages/sdk/src/index.ts
git commit -m "feat(sdk): add zeroPrivateKey security utility"
```

---

### Task 4: WalletProvider — multi-wallet state and encrypted persistence

**Files:**
- Modify: `packages/web/src/providers/WalletProvider.tsx`
- Modify: `packages/web/src/steps/WalletStep.test.tsx` (update mocks for new shape)
- Modify: `packages/web/src/steps/RequirementsStep.tsx` (update `perryMode.hotAddress` → `perryMode.wallets[0].address`)
- Modify: `packages/web/src/steps/RequirementsStep.test.tsx`
- Modify: `packages/web/src/steps/DistributeStep.test.tsx` (update perry mode mock shape)

- [ ] **Step 1: Update `PerryModeState` type and context**

In `packages/web/src/providers/WalletProvider.tsx`:

Replace the `PerryModeState` type:

```typescript
import { createEIP712Message, deriveMultipleWallets, zeroPrivateKey } from '@titrate/sdk';
import type { Address, Hex, WalletClient } from 'viem';
import type { DerivedWallet } from '@titrate/sdk';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export type PerryModeState = {
  readonly isActive: true;
  readonly coldAddress: Address;
  readonly wallets: readonly DerivedWallet[];
  readonly offset: number;
};

export type WalletContextValue = {
  readonly isConnected: boolean;
  readonly address: Address | undefined;
  readonly chainId: number | undefined;
  readonly perryMode: PerryModeState | null;
  readonly deriveHotWallets: (params: {
    readonly campaignName: string;
    readonly version: number;
    readonly count: number;
    readonly offset?: number;
  }) => Promise<void>;
  readonly clearPerryMode: () => void;
  readonly walletClients: readonly WalletClient[];
};
```

- [ ] **Step 2: Implement `deriveHotWallets` and `walletClients`**

Replace the `handleDeriveHotWallet` callback and add walletClients state:

```typescript
const [perryMode, setPerryMode] = useState<PerryModeState | null>(null);
const [walletClients, setWalletClients] = useState<readonly WalletClient[]>([]);

const handleDeriveHotWallets = useCallback(
  async (params: {
    readonly campaignName: string;
    readonly version: number;
    readonly count: number;
    readonly offset?: number;
  }) => {
    if (!address) throw new Error('Wallet not connected');

    const message = createEIP712Message({
      funder: address,
      name: params.campaignName,
      version: params.version,
    });

    const signature = await signTypedDataAsync({
      domain: message.domain,
      types: message.types,
      primaryType: message.primaryType,
      message: message.message,
    });

    const offset = params.offset ?? 0;
    const wallets = deriveMultipleWallets({
      signature: signature as Hex,
      count: params.count,
      offset,
    });

    // Build in-memory wallet clients from derived private keys
    // Uses a default RPC — the actual chain transport is configured by ChainProvider
    const clients = wallets.map((w) =>
      createWalletClient({
        account: privateKeyToAccount(w.privateKey),
        transport: http(),
      }),
    );

    setPerryMode({ isActive: true, coldAddress: address, wallets, offset });
    setWalletClients(clients);
  },
  [address, signTypedDataAsync],
);

const clearPerryMode = useCallback(() => {
  // Zero private keys before clearing
  if (perryMode) {
    for (const w of perryMode.wallets) {
      zeroPrivateKey(w);
    }
  }
  setPerryMode(null);
  setWalletClients([]);
}, [perryMode]);
```

Update the context value to include `walletClients` and `deriveHotWallets`.

- [ ] **Step 3: Update backward compat in context value**

Keep `deriveHotWallet` as a wrapper for single-wallet callers (WalletStep test compatibility):

```typescript
const deriveHotWallet = useCallback(
  (campaignName: string, version: number) =>
    handleDeriveHotWallets({ campaignName, version, count: 1 }),
  [handleDeriveHotWallets],
);
```

Expose both in the value object:

```typescript
value={{
  isConnected,
  address,
  chainId,
  perryMode,
  deriveHotWallet,
  deriveHotWallets: handleDeriveHotWallets,
  clearPerryMode,
  walletClients,
}}
```

- [ ] **Step 4: Update RequirementsStep to use new shape**

In `packages/web/src/steps/RequirementsStep.tsx`, replace:
```typescript
const fundingAddress: Address | null = perryMode
  ? perryMode.hotAddress
  : address ?? null;
```
with:
```typescript
const fundingAddress: Address | null = perryMode
  ? perryMode.wallets[0].address
  : address ?? null;
```

- [ ] **Step 5: Update test mocks**

In `WalletStep.test.tsx`, update the `perryMode` mock shape:
```typescript
perryMode: {
  isActive: true,
  wallets: [{ address: '0x1111111111111111111111111111111111111111', privateKey: '0x' + '00'.repeat(32) }],
  coldAddress: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
  offset: 0,
},
```

Update the `defaultWallet` type to include the new fields and `walletClients: []`.

Update `RequirementsStep.test.tsx` similarly — replace `hotAddress` with `wallets[0].address`.

Update `DistributeStep.test.tsx` — add `walletClients: []` to the wallet mock.

- [ ] **Step 6: Run all web tests**

Run: `cd packages/web && npx vitest run`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/providers/WalletProvider.tsx packages/web/src/steps/WalletStep.test.tsx packages/web/src/steps/RequirementsStep.tsx packages/web/src/steps/RequirementsStep.test.tsx packages/web/src/steps/DistributeStep.test.tsx
git commit -m "feat(web): extend WalletProvider for multi-wallet perry mode"
```

---

### Task 5: WalletStep — multi-wallet derivation UI

**Files:**
- Modify: `packages/web/src/steps/WalletStep.tsx`
- Modify: `packages/web/src/steps/WalletStep.test.tsx`

- [ ] **Step 1: Add wallet count, offset inputs, and per-wallet card UI**

Replace the single "Derive Hot Wallet" button section with:
- Numeric `walletCount` input (default 1, min 1, max 10)
- Numeric `offset` input (default 0)
- "Derive Hot Wallets" button calling `deriveHotWallets({ campaignName, version, count, offset })`
- After derivation: per-wallet cards showing index, truncated address, wallet name

Import `useWallet` destructuring extended to include `deriveHotWallets` and `walletClients`.

The wallet card for each derived wallet shows:
- Wallet name (auto-generated: "Wallet 0", "Wallet 1", ...)
- Truncated address
- "Fund Gas" and "Fund Tokens" buttons (wired in Task 6)

- [ ] **Step 2: Update tests**

Add tests for:
- Wallet count input renders
- Offset input renders
- Multiple wallet cards appear after derivation
- Wallet count validation (min 1, max 10)

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(web): add multi-wallet derivation UI to WalletStep"
```

---

### Task 6: WalletStep — per-wallet funding and balance display

**Files:**
- Modify: `packages/web/src/steps/WalletStep.tsx`
- Modify: `packages/web/src/steps/WalletStep.test.tsx`

- [ ] **Step 1: Add balance polling per wallet**

For each derived wallet, call `useNativeBalance(wallet.address)` and `useTokenBalance(tokenAddress, wallet.address)`. Show green check when balance >= required, warning icon when below.

Required-per-wallet computed from campaign data: `ceil(recipientCount / walletCount) * uniformAmount` for tokens, estimated gas for ETH.

- [ ] **Step 2: Add Fund Gas / Fund Tokens buttons**

"Fund Gas" — calls `walletClient.sendTransaction({ to: hotAddress, value: amount })` via the wagmi cold wallet client.
"Fund Tokens" — calls `walletClient.writeContract({ abi: erc20Abi, functionName: 'transfer', args: [hotAddress, amount] })`.
"Fund All Gas" / "Fund All Tokens" — loops through underfunded wallets.

- [ ] **Step 3: Add wallet naming**

Auto-generate names ("Wallet 0", "Wallet 1", ...). Inline editable via text input that appears on click.

- [ ] **Step 4: Write tests for funding and balance display**

- [ ] **Step 5: Run tests, verify pass**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(web): add per-wallet funding and balance display"
```

---

### Task 7: DistributeStep — parallel dispatch via `disperseParallel`

**Files:**
- Modify: `packages/web/src/steps/DistributeStep.tsx`
- Modify: `packages/web/src/steps/DistributeStep.test.tsx`

- [ ] **Step 1: Import `disperseParallel` and `walletClients` from context**

Add `disperseParallel` to the `@titrate/sdk` import. Get `walletClients` from `useWallet()` (add to existing destructure alongside `useIntervention`).

Actually — the wallet context is not currently used in DistributeStep (it uses wagmi's `useWalletClient` hook directly). Add:

```typescript
const { walletClients: derivedWalletClients, perryMode } = useWallet();
```

Import `useWallet` from `../providers/WalletProvider.js`.

- [ ] **Step 2: Branch dispatch logic**

In `handleDistribute`, after the approval phase, branch on multi-wallet:

```typescript
if (derivedWalletClients.length > 1) {
  // Parallel: per-wallet approvals then disperseParallel
  setPhase('approving');
  for (let i = 0; i < derivedWalletClients.length; i++) {
    // Approve each derived wallet's allowance on the contract
    // ... (same approval logic as existing, but for each walletClient)
  }

  setPhase('distributing');
  const parallelResults = await disperseParallel({
    contractAddress: activeCampaign.contractAddress as Address,
    variant: activeCampaign.contractVariant,
    token: activeCampaign.tokenAddress,
    recipients: recipientAddresses,
    amount: BigInt(activeCampaign.uniformAmount ?? '0'),
    walletClients: derivedWalletClients,
    publicClient,
    batchSize,
    gasConfig: sdkGasConfig,
    onProgress,
  });

  // Flatten results
  const batchResults = parallelResults.flatMap((pr) => [...pr.results]);
  // ... rest of completion logic
} else {
  // Existing single-wallet path (unchanged)
}
```

- [ ] **Step 3: Update progress handler for multi-wallet**

The existing `onProgress` callback handles `throughput` and `batch` events. For multi-wallet, `disperseParallel` sends batch events with offset indices (walletIndex * 1000). The aggregate throughput is already summed by the SDK's progress wrapper.

- [ ] **Step 4: Update distribution plan display**

In the ready phase summary, show wallet count:
```tsx
<div className="flex justify-between gap-2">
  <span className="text-gray-500 dark:text-gray-400">Wallets</span>
  <span className="text-gray-900 dark:text-white">
    {derivedWalletClients.length > 1 ? `${derivedWalletClients.length} (parallel)` : '1 (single)'}
  </span>
</div>
```

- [ ] **Step 5: Write tests**

Add `mockDisperseParallel` to the SDK mock. Test:
- Multi-wallet branch calls `disperseParallel` instead of `disperseTokensSimple`
- Single wallet path unchanged
- Wallet count shown in distribution plan

- [ ] **Step 6: Run tests, verify pass**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(web): wire disperseParallel for multi-wallet distribution"
```

---

### Task 8: DistributeStep — post-distribution sweep-back

**Files:**
- Modify: `packages/web/src/steps/DistributeStep.tsx`
- Modify: `packages/web/src/steps/DistributeStep.test.tsx`

- [ ] **Step 1: Add sweep state and UI**

After the `phase === 'complete'` section, when `derivedWalletClients.length > 1`, show:
- Per-wallet remaining balances (ETH and token)
- Editable sweep address input (defaults to cold wallet)
- "Sweep All to Address" button

- [ ] **Step 2: Implement sweep handler**

```typescript
const handleSweep = useCallback(async () => {
  if (!sweepAddress || derivedWalletClients.length === 0) return;

  setSweepState({ status: 'sweeping', progress: 0 });

  for (let i = 0; i < derivedWalletClients.length; i++) {
    const client = derivedWalletClients[i];
    const walletAddress = client.account!.address;

    // Sweep tokens first (if any)
    const tokenBal = await publicClient.readContract({
      address: activeCampaign.tokenAddress,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [walletAddress],
    });
    if (tokenBal > 0n) {
      const hash = await client.writeContract({
        address: activeCampaign.tokenAddress,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [sweepAddress, tokenBal],
        chain: undefined,
        account: client.account!,
      });
      await publicClient.waitForTransactionReceipt({ hash });
    }

    // Sweep ETH (leave enough for gas)
    const ethBal = await publicClient.getBalance({ address: walletAddress });
    const sweepGas = 21_000n;
    const gasPrice = await publicClient.getGasPrice();
    const gasCost = sweepGas * gasPrice;
    if (ethBal > gasCost) {
      const hash = await client.sendTransaction({
        to: sweepAddress,
        value: ethBal - gasCost,
        chain: undefined,
        account: client.account!,
      });
      await publicClient.waitForTransactionReceipt({ hash });
    }

    setSweepState({ status: 'sweeping', progress: i + 1 });
  }

  setSweepState({ status: 'done', progress: derivedWalletClients.length });
}, [derivedWalletClients, sweepAddress, publicClient, activeCampaign]);
```

- [ ] **Step 3: Zero keys after sweep**

After sweep completes, call `clearPerryMode()` to zero keys and wipe in-memory state.

- [ ] **Step 4: Write tests**

Test:
- Sweep UI appears in complete phase when multi-wallet
- Sweep address defaults to cold wallet
- Sweep button triggers sweep handler

- [ ] **Step 5: Run tests, verify pass**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(web): add post-distribution sweep-back for derived wallets"
```

---

### Task 9: Encrypted signature persistence and recovery

**Files:**
- Modify: `packages/web/src/providers/WalletProvider.tsx`
- Modify: `packages/web/src/providers/StorageProvider.tsx` (if needed for appSettings access)

- [ ] **Step 1: Store encrypted signature after derivation**

In `handleDeriveHotWallets`, after deriving wallets, store the signature:

```typescript
if (storage) {
  await storage.appSettings.put({
    key: `wallet-derivation-${campaignId}`,
    campaignId,
    encryptedSignature: signature, // encrypted by storage wrapper
    highWaterMark: offset + params.count - 1,
    activeOffset: offset,
    activeCount: params.count,
    walletNames: {},
  });
}
```

The existing `createEncryptedStorage` wrapper will encrypt the signature field automatically.

- [ ] **Step 2: Recover on campaign load**

Add an effect that loads the stored derivation when the active campaign changes and storage is unlocked:

```typescript
useEffect(() => {
  if (!storage || !activeCampaign || !isUnlocked) return;
  void (async () => {
    const stored = await storage.appSettings.get(`wallet-derivation-${activeCampaign.id}`);
    if (!stored?.encryptedSignature) return;
    const wallets = deriveMultipleWallets({
      signature: stored.encryptedSignature as Hex,
      count: stored.activeCount,
      offset: stored.activeOffset,
    });
    const clients = wallets.map((w) =>
      createWalletClient({
        account: privateKeyToAccount(w.privateKey),
        transport: http(),
      }),
    );
    setPerryMode({ isActive: true, coldAddress: address!, wallets, offset: stored.activeOffset });
    setWalletClients(clients);
  })();
}, [storage, activeCampaign, isUnlocked]);
```

- [ ] **Step 3: Delete stored derivation on clear**

In `clearPerryMode`, delete the IDB entry:

```typescript
if (storage && activeCampaign) {
  await storage.appSettings.delete(`wallet-derivation-${activeCampaign.id}`);
}
```

- [ ] **Step 4: Write tests for recovery flow**

- [ ] **Step 5: Run all tests**

Run: `cd packages/web && npx vitest run`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(web): persist encrypted signature for wallet recovery on reload"
```

---

### Task 10: Final integration test and plan update

**Files:**
- Modify: `docs/plans/web-sdk-gap-closure.plan.md`

- [ ] **Step 1: Run full monorepo tests**

```bash
cd packages/sdk && npx vitest run
cd packages/web && npx vitest run
```

Expected: All pass

- [ ] **Step 2: Update gap closure plan**

Remove multi-wallet from deferred scope in `docs/plans/web-sdk-gap-closure.plan.md`.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(web): complete multi-wallet parallel distribution — close gap #6"
```
