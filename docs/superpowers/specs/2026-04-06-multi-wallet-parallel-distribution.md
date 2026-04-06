# Multi-Wallet Parallel Distribution

Derive N hot wallets from a single EIP-712 signature, fund them, distribute tokens in parallel via `disperseParallel`, and sweep remaining balances back afterward.

## Motivation

Single-wallet distribution is bottlenecked by block gas limits and sequential nonce management. The SDK already has `disperseParallel` which partitions recipients across wallet clients and runs them concurrently. The missing piece: the web app has no way to produce multiple wallet clients without external wallet connections.

The solution leverages the existing perry mode pattern — sign one EIP-712 message, derive a private key from the signature — but extends it to derive N wallets by varying an index parameter. One wallet popup, N deterministic keys, all in-memory.

## 1. SDK Derivation API

### New functions in `packages/sdk/src/wallet/derive.ts`

```typescript
function deriveWalletAtIndex(params: {
  readonly signature: Hex;
  readonly index: number;
}): DerivedWallet
```

- `index === 0` → `keccak256(signature)` (backward-compatible with existing perry mode)
- `index > 0` → `keccak256(concat(signature, toHex(index, { size: 32 })))`

```typescript
function deriveMultipleWallets(params: {
  readonly signature: Hex;
  readonly count: number;
  readonly offset?: number;  // default 0
}): DerivedWallet[]
```

Derives wallets at indices `[offset, offset+1, ..., offset+count-1]`. The offset enables reuse of the same signing key across campaigns — wallets 0-4 for campaign A, wallets 5-9 for campaign B.

### Gas-aware wallet count suggestion

```typescript
function suggestWalletCount(params: {
  readonly recipientCount: number;
  readonly batchSize: number;
  readonly gasPerBatch: bigint;
  readonly blockGasLimit: bigint;
}): { readonly recommended: number; readonly reason: string }
```

Logic: `recommended = min(ceil(recipients / batchSize), floor(blockGasLimit / gasPerBatch), 10)`. Adding wallets beyond the block gas ceiling doesn't improve throughput — batches just queue for the next block.

### Existing function preserved

`deriveHotWallet(signature)` remains unchanged. It's the `index === 0` case. Existing perry mode callers are unaffected.

## 2. WalletProvider Multi-Wallet State

### Extended types

```typescript
type PerryModeState = {
  readonly isActive: true;
  readonly coldAddress: Address;
  readonly wallets: readonly DerivedWallet[];
  readonly offset: number;
};
```

`wallets[0].address` replaces the old `hotAddress`.

### New context shape

```typescript
type WalletContextValue = {
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

### Flow

1. User clicks "Derive Hot Wallets" → signs one EIP-712 message
2. `deriveMultipleWallets({ signature, count, offset })` → N `DerivedWallet` objects
3. Each private key → `createWalletClient({ account: privateKeyToAccount(key), chain, transport: http(rpcUrl) })` using the campaign's configured RPC URL
4. Encrypted signature + metadata stored in IDB (see section 5)
5. `walletClients[]` held in React state (never persisted raw)

### Backward compatibility

`deriveHotWallet(campaignName, version)` calls `deriveHotWallets` with `count: 1` internally. Single-wallet perry mode works unchanged.

## 3. WalletStep UI

### Before derivation

```
Perry Mode (Hot Wallets)

Wallets: [3]    Suggested: 3 (block gas fits 4 concurrent batches)
Offset:  [0]    Next unused: 0

[Derive Hot Wallets]
```

- Wallet count defaults to `suggestWalletCount` result, editable
- Offset defaults to `highWaterMark + 1` from stored derivation, editable
- Suggestion text explains the gas ceiling reasoning
- Recipient count loaded from IDB (same pattern as FiltersStep)

### After derivation — per-wallet cards

Each wallet shows:

- **Index and name** — auto-generated (Alpha, Bravo, Charlie... or Wallet 0, 1, 2), editable inline via Rename
- **Address** — truncated with copy button
- **ETH balance** — polled every 15s via `useNativeBalance`, green check or warning icon vs required
- **Token balance** — polled every 15s via `useTokenBalance`, green check or warning icon vs required
- **Fund Gas button** — sends ETH from cold wallet to this hot wallet. Amount defaults to `computeRequirements({ recipientCount: ceil(totalRecipients / walletCount), batchSize, ... }).gasTokenNeeded`
- **Fund Tokens button** — ERC-20 transfer from cold wallet. Amount defaults to `ceil(totalRecipients / walletCount) * amountPerRecipient`

### Batch funding

- "Fund All Gas" — loops through underfunded wallets, sends ETH from cold wallet to each
- "Fund All Tokens" — loops through underfunded wallets, transfers tokens from cold wallet to each
- Each funding action is a single wallet popup (cold wallet signs the transfer)
- Required-per-wallet: `ceil(recipientCount / walletCount) * amountPerRecipient` for tokens, gas estimate for ETH

## 4. DistributeStep Parallel Dispatch

### Pre-flight

- Validation runs once against full recipient list (existing `validateBatch`)
- Per-wallet ERC-20 approvals: loop through `walletClients[]`, check allowance on each, request approval if needed. For Simple variant: standard ERC-20 `approve`. For Full variant: selector-scoped `approveOperator`. Progress: "Approving wallet 1 of 3..."
- Sufficiency gated per-wallet: each wallet must have enough gas and tokens for its partition

### Dispatch

When `perryMode.wallets.length > 1`:

```typescript
const results = await disperseParallel({
  contractAddress,
  variant,
  token,
  recipients: recipientAddresses,
  amount,
  walletClients,
  publicClient,
  batchSize,
  gasConfig: sdkGasConfig,
  onProgress,
});
```

When `perryMode.wallets.length === 1` or no perry mode: existing single-wallet `disperseTokensSimple` / `disperseTokens` path unchanged.

### Progress display (aggregate + expandable)

**Top-level aggregate**:
- Combined `addressesCompleted` (sum across wallets)
- Combined `addressesPerHour` (sum)
- Combined `estimatedRemainingMs` (max across wallets — slowest determines completion)

**Expandable per-wallet detail**:
- Section header: wallet name + address
- Per-wallet `BatchTimeline` (reuses existing component)
- Per-wallet batch count, confirmed/failed counts

### Completion

- `SpendSummary` aggregates gas and tokens across all wallets
- Intervention journal entries include wallet index in metadata

### Post-distribution sweep

After completion, prompt to return remaining balances:

```
Remaining balances:
  Alpha:   0.03 ETH, 12 USDC
  Bravo:   0.01 ETH, 0 USDC
  Charlie: 0.02 ETH, 8 USDC

Sweep address: [0xColdWalletAddress]     (editable)
[Sweep All to Address]
```

- Sweep address defaults to connected cold wallet address, editable by user
- "Sweep All" sends remaining ETH and tokens from each derived wallet to the target address
- Each sweep tx signed by the derived wallet's in-memory client
- Progress shown per-wallet as sweeps execute

## 5. Stored State & Recovery

### Storage shape

Stored in IDB `appSettings` store with key `wallet-derivation-${campaignId}`:

```typescript
type StoredWalletDerivation = {
  readonly campaignId: string;
  readonly encryptedSignature: string;
  readonly highWaterMark: number;
  readonly activeOffset: number;
  readonly activeCount: number;
  readonly walletNames: Record<number, string>;
};
```

- `encryptedSignature` — AES-GCM encrypted via existing `createEncryptedStorage` infrastructure
- `highWaterMark` — highest index ever derived (enables offset suggestion for next use)
- `walletNames` — user-assigned names keyed by wallet index

### Recovery on page reload

1. StorageProvider unlocks → AES-GCM key available
2. WalletProvider loads `StoredWalletDerivation` for active campaign
3. Decrypts signature
4. `deriveMultipleWallets({ signature, count: activeCount, offset: activeOffset })`
5. Rebuilds `WalletClient[]` in memory from derived private keys
6. Perry mode state restored — no re-signing needed

### Edge cases

- **Storage locked** — perry mode shows "Unlock storage to restore wallets" prompt
- **Campaign changed** — clear in-memory wallet clients, load derivation for new campaign
- **User clears perry mode** — delete `StoredWalletDerivation` from IDB, wipe in-memory keys
- **Partial funding** — distribution gates on all wallets meeting minimum thresholds; underfunded wallets block start

## Design Decisions

1. **One signature, N wallets** — `keccak256(concat(sig, pad(index)))` derivation. One wallet popup regardless of wallet count. Index 0 backward-compatible with existing perry mode.

2. **Offset support** — same signing key can derive fresh wallets for different campaigns or retry scenarios. `highWaterMark` tracks usage so the UI suggests non-overlapping ranges.

3. **Encrypted signature in IDB, keys in memory** — the signature is the single secret. Private keys are re-derived on load, never persisted. One stored secret instead of N.

4. **Manual funding, prompted sweep-back** — users fund derived wallets externally (or via cold wallet fund buttons). After distribution, sweep remaining balances to a user-specified address (defaults to cold wallet). Auto-funding is simpler than full lifecycle management and avoids complex failure recovery.

5. **Gas-aware wallet suggestion** — `suggestWalletCount` caps recommendations at the block gas ceiling. More wallets beyond that don't improve throughput since batches queue for subsequent blocks.

6. **Aggregate + expandable progress** — combined stats for "am I done yet?" with per-wallet drill-down for debugging. Reuses existing `BatchTimeline` component.
