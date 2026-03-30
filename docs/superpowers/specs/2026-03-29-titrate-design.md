# Titrate — Offline-First Airdrop Platform

## Overview

Titrate is an offline-first airdrop platform for EVM chains. It provides a TypeScript SDK, a terminal interface (TUI), and a browser-based web app for composing address lists, deploying custom-named distributor contracts, and executing batch token distributions.

The name reflects the core security model: operator allowances are titrated — metered out in controlled amounts from a cold wallet to a hot wallet derived deterministically via EIP-712 signatures.

## Architecture

### Monorepo Structure

```
titrate/
├── packages/
│   ├── sdk/            # Core library
│   ├── web/            # Vite + React offline-first app
│   ├── tui/            # Terminal interface
│   └── contracts/      # Solidity source + pre-compiled bytecode + tests
├── package.json        # Workspace root
├── tsconfig.json
└── CLAUDE.md
```

### Chain Support

Curated multi-chain with a dropdown of popular EVM chains (Ethereum, PulseChain, Base, Arbitrum, etc.) plus a custom RPC URL fallback for any EVM-compatible chain.

---

## Smart Contract

### Variants

Two contract variants, both receiving a user-chosen Solidity contract name for block explorer advertising:

| Variant | Use Case | Features |
|---------|----------|----------|
| **Simple** | "Just send tokens" | disperse + disperseSimple + disperseCall, no auth, no registry |
| **Full** | Hot/cold wallet workflow | Everything in Simple + operator allowance + on-chain registry |

### Deployment Strategy

The contract name only affects the metadata hash, not the functional bytecode. By compiling with `metadata.bytecodeHash: "none"`:

1. **Build time** (our CI): compile the contract with `metadata.bytecodeHash: "none"`, producing bytecode identical regardless of contract name.
2. **Deploy time** (user's browser/terminal): deploy the pre-compiled bytecode directly. No solc-js needed at runtime.
3. **Verify time**: string-replace the contract name in the Solidity source template, submit to the block explorer's verification API with matching compiler settings.

Both variants ship as static assets in the SDK (~few KB each). Deterministic tests verify bytecode stability across names.

### Contract Interface — Full Variant

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IERC20 {
    function transferFrom(address, address, uint256) external returns (bool);
}

contract USER_CONTRACT_NAME {

    // ─── Operator Allowance ─────────────────────────────
    // Titrated: cold wallet meters out a specific token-unit budget,
    // scoped per function selector. A hot wallet approved for
    // disperseSimple cannot pivot to disperseCall for DEX swaps.

    // mapping(owner => operator => selector => allowance)
    mapping(address => mapping(address => mapping(bytes4 => uint256)))
        public allowance;

    function approve(address operator, bytes4 selector, uint256 amount) external {
        allowance[msg.sender][operator][selector] = amount;
    }

    function increaseAllowance(address operator, bytes4 selector, uint256 added) external {
        allowance[msg.sender][operator][selector] += added;
    }

    // ─── On-chain Registry ──────────────────────────────
    // Optional. Pass bytes32(0) as campaignId to skip.

    mapping(address => mapping(bytes32 => mapping(address => bool)))
        public registry;

    /// @notice Batch-check registry for live deduplication
    function checkRecipients(
        address distributor,
        bytes32 campaignId,
        address[] calldata recipients
    ) external view returns (bool[] memory) {
        bool[] memory results = new bool[](recipients.length);
        for (uint256 i; i < recipients.length; ) {
            results[i] = registry[distributor][campaignId][recipients[i]];
            unchecked { ++i; }
        }
        return results;
    }

    // ─── Distribution ───────────────────────────────────
    // token == address(0) → native. from == address(0) → msg.sender.
    // Condition checks are outside the loop to avoid redundant branching.

    /// @notice Variable amounts per recipient
    function disperse(
        address token,
        address from,
        address[] calldata recipients,
        uint256[] calldata amounts,
        bytes32 campaignId
    ) external payable {
        require(recipients.length == amounts.length);
        bool isNative = token == address(0);
        address source = _resolveSource(from, isNative, this.disperse.selector);

        if (!isNative && from != address(0)) {
            _deductAllowance(from, this.disperse.selector, _sum(amounts));
        }

        if (isNative) {
            _sendNative(recipients, amounts, source, campaignId);
            _refundDust();
        } else {
            _sendToken(token, source, recipients, amounts, campaignId);
        }
    }

    /// @notice Same amount to all recipients
    function disperseSimple(
        address token,
        address from,
        address[] calldata recipients,
        uint256 amount,
        bytes32 campaignId
    ) external payable {
        bool isNative = token == address(0);
        address source = _resolveSource(from, isNative, this.disperseSimple.selector);

        if (!isNative && from != address(0)) {
            _deductAllowance(from, this.disperseSimple.selector, amount * recipients.length);
        }

        if (isNative) {
            _sendNativeSimple(recipients, amount, source, campaignId);
            _refundDust();
        } else {
            _sendTokenSimple(token, source, recipients, amount, campaignId);
        }
    }

    /// @notice Arbitrary calldata batch execution
    function disperseCall(
        address[] calldata targets,
        bytes[] calldata calldatas,
        uint256[] calldata values,
        bytes32 campaignId,
        address[] calldata registryRecipients
    ) external payable {
        require(targets.length == calldatas.length);
        require(targets.length == values.length);

        for (uint256 i; i < targets.length; ) {
            (bool ok, ) = targets[i].call{value: values[i]}(calldatas[i]);
            require(ok);
            if (campaignId != bytes32(0) && registryRecipients.length > i)
                _recordIfNeeded(msg.sender, campaignId, registryRecipients[i]);
            unchecked { ++i; }
        }

        _refundDust();
    }

    // ─── Multicall ───────────────────────────────────────
    // Compose multiple operations atomically in one tx.
    // Uses delegatecall so msg.sender is preserved for allowance checks.
    // Each public function passes its own selector explicitly to internal
    // helpers — no reliance on msg.sig, works at any call depth.

    function multicall(bytes[] calldata data)
        external payable returns (bytes[] memory results)
    {
        results = new bytes[](data.length);
        for (uint256 i; i < data.length; ) {
            (bool ok, bytes memory result) = address(this).delegatecall(data[i]);
            require(ok);
            results[i] = result;
            unchecked { ++i; }
        }
    }

    // ─── Internals ──────────────────────────────────────

    function _resolveSource(address from, bool isNative, bytes4 selector)
        internal view returns (address)
    {
        if (from == address(0)) return msg.sender;
        require(!isNative, "native: from must be sender");
        require(
            allowance[from][msg.sender][selector] > 0,
            "not authorized for this method"
        );
        return from;
    }

    function _deductAllowance(address from, bytes4 selector, uint256 total) internal {
        require(
            allowance[from][msg.sender][selector] >= total,
            "insufficient allowance"
        );
        allowance[from][msg.sender][selector] -= total;
    }

    function _sum(uint256[] calldata values) internal pure returns (uint256 total) {
        for (uint256 i; i < values.length; ) {
            total += values[i];
            unchecked { ++i; }
        }
    }

    function _sendNative(
        address[] calldata recipients, uint256[] calldata amounts,
        address source, bytes32 campaignId
    ) internal {
        for (uint256 i; i < recipients.length; ) {
            (bool ok, ) = recipients[i].call{value: amounts[i]}("");
            require(ok);
            _recordIfNeeded(source, campaignId, recipients[i]);
            unchecked { ++i; }
        }
    }

    function _sendNativeSimple(
        address[] calldata recipients, uint256 amount,
        address source, bytes32 campaignId
    ) internal {
        for (uint256 i; i < recipients.length; ) {
            (bool ok, ) = recipients[i].call{value: amount}("");
            require(ok);
            _recordIfNeeded(source, campaignId, recipients[i]);
            unchecked { ++i; }
        }
    }

    function _sendToken(
        address token, address source,
        address[] calldata recipients, uint256[] calldata amounts,
        bytes32 campaignId
    ) internal {
        for (uint256 i; i < recipients.length; ) {
            IERC20(token).transferFrom(source, recipients[i], amounts[i]);
            _recordIfNeeded(source, campaignId, recipients[i]);
            unchecked { ++i; }
        }
    }

    function _sendTokenSimple(
        address token, address source,
        address[] calldata recipients, uint256 amount,
        bytes32 campaignId
    ) internal {
        for (uint256 i; i < recipients.length; ) {
            IERC20(token).transferFrom(source, recipients[i], amount);
            _recordIfNeeded(source, campaignId, recipients[i]);
            unchecked { ++i; }
        }
    }

    function _recordIfNeeded(
        address distributor, bytes32 campaignId, address recipient
    ) internal {
        if (campaignId != bytes32(0))
            registry[distributor][campaignId][recipient] = true;
    }

    function _refundDust() internal {
        if (address(this).balance > 0) {
            (bool ok, ) = msg.sender.call{value: address(this).balance}("");
            require(ok);
        }
    }
}
```

### Contract Interface — Simple Variant

Same as Full but without: `allowance` mapping, `approve`, `increaseAllowance`, `registry` mapping, `checkRecipients`, `_recordIfNeeded`, `_deductAllowance`, `multicall`, and the `from`/`campaignId` parameters. The `disperse` and `disperseSimple` methods only accept `(token, recipients, amounts)` — always using `msg.sender` as source. `disperseCall` accepts `(targets, calldatas, values)` — no registry tracking.

### Gas Cost Considerations

| Feature | Per-recipient cost | Opt-in? |
|---------|-------------------|---------|
| Registry write (SSTORE) | ~20,000 gas | Yes — bytes32(0) skips |
| Event with 3 indexed params | ~1,875 gas | Not included by default |
| Operator allowance check | ~2,600 gas (SLOAD) | Only when from != address(0) |
| Multicall overhead | ~700 gas per delegatecall | When composing multiple operations |
| Base transfer (ERC-20) | ~65,000 gas | Always |
| Base transfer (native) | ~2,300 gas | Always |

Events are not emitted by default. Both registry and events are opt-in to keep the cheapest path as lean as possible.

### Double-Approval Security Model

Two independent layers limit hot wallet exposure:

- **Layer 1 — ERC-20 approve**: Cold wallet approves the contract for a specific token and amount. Per-token guard.
- **Layer 2 — Operator allowance (selector-scoped)**: Cold wallet approves the hot wallet on the distributor contract for a specific number of token units, scoped to a specific function selector (`bytes4`). A hot wallet approved for `disperseSimple` cannot call `disperseCall` for DEX swaps. Rate limiter. Decrements with each batch.

Effective limit = `min(ERC-20 allowance, operator allowance for the specific selector)`. The operator allowance is token-agnostic — the ERC-20 approve provides per-token protection.

### Hot/Cold Wallet Flow

1. Cold wallet deploys contract (one-time, user picks which wallet deploys)
2. Cold wallet calls `approve(hotWallet, disperseSimple.selector, 1_000_000e8)` on distributor — titrated, selector-scoped allowance
3. Cold wallet calls `token.approve(contract, 10_000_000e8)` on the ERC-20
4. Hot wallet calls `disperseSimple(token, coldWallet, recipients, amount, campaignId)` for each batch
5. Allowance decrements per batch. Cold wallet calls `increaseAllowance(hotWallet, disperseSimple.selector, amount)` to top up.
6. Optionally `approve(hotWallet, disperseSimple.selector, 0)` to revoke when done.

---

## SDK — @titrate/sdk

### Modules

#### pipeline

Composable set operations for building address lists.

```typescript
createPipeline(config: PipelineConfig): Pipeline
Pipeline.addSource(type: SourceType, params: SourceParams): Pipeline
Pipeline.addFilter(type: FilterType, params: FilterParams): Pipeline
Pipeline.execute(rpc: PublicClient, callbacks: PipelineCallbacks): AsyncGenerator<Set<Address>>
Pipeline.serialize(): PipelineConfig
deserializePipeline(config: PipelineConfig): Pipeline
```

**Pipeline model**: Everything is a set operation — start with a source set, subtract repeatedly. Subtractions are either derived from properties of the addresses themselves (is it a contract? min balance?) or from external chain data (token transfer recipients).

**Streaming execution**: Block scanning processes in configurable windows. Only the final address sets are stored — raw logs are discarded immediately to keep storage under ~10MB instead of ~20GB.

**Source types**: Block range scan (configurable field extraction: `tx.from`, `tx.to`, event log addresses), CSV import, or union of multiple sources.

**Derived filter types**: Contract check (`eth_getCode`), minimum balance (`eth_getBalance`), nonce range.

**External negative list types**: Token Transfer recipients (ERC-20 Transfer event `to` addresses), CSV exclusion list, previously sent (from local storage), on-chain registry check (`checkRecipients`).

**Pipeline configs are serializable**: Save/load/share as JSON. A pipeline config fully describes a collection + filter run.

#### scanner

Block and log scanning with dynamic range titration (ported from hex-airdrop).

```typescript
scanBlocks(rpc: PublicClient, range: BlockRange, options: ScanOptions): AsyncGenerator<Address[]>
scanTransferEvents(rpc: PublicClient, token: Address, range: BlockRange): AsyncGenerator<Address[]>
getAddressProperties(rpc: PublicClient, addresses: Address[], properties: PropertyType[]): AsyncGenerator<AddressProperties>
titrateBatchSize(rpc: PublicClient): Promise<number>  // dynamic block-range sizing
resolveBlockByTimestamp(rpc: PublicClient, timestamp: number): Promise<bigint>
```

#### wallet

EIP-712 deterministic hot wallet derivation.

```typescript
createEIP712Message(params: { funder: Address; name: string; version: number }): TypedData
deriveHotWallet(signature: Hex): { address: Address; privateKey: Hex }
getWalletClient(privateKey: Hex, rpc: string): WalletClient
```

The hot wallet private key = `keccak256(eip712Signature)`. Deterministic — same cold wallet + same message = same hot wallet every time.

**Security**: Private keys are held in memory only. Never persisted to disk or IndexedDB. The user re-derives by re-signing with their cold wallet. Only the hot wallet address is stored for reference.

#### distributor

Contract deployment, verification, and all disperse methods.

```typescript
deployContract(params: { name: string; variant: 'simple' | 'full'; wallet: WalletClient }): Promise<DeployResult>
verifyContract(params: { address: Address; name: string; chainId: number }): Promise<VerifyResult>
disperse(params: DisperseParams): Promise<BatchResult[]>
disperseSimple(params: DisperseSimpleParams): Promise<BatchResult[]>
disperseCall(params: DisperseCallParams): Promise<BatchResult[]>
approve(params: { contract: Address; operator: Address; selector: Hex; amount: bigint; wallet: WalletClient }): Promise<Hash>
increaseAllowance(params: { contract: Address; operator: Address; selector: Hex; amount: bigint; wallet: WalletClient }): Promise<Hash>
getAllowance(params: { contract: Address; from: Address; operator: Address; selector: Hex; rpc: PublicClient }): Promise<bigint>
multicall(params: { contract: Address; calls: Hex[]; wallet: WalletClient; value?: bigint }): Promise<Hash>
checkRecipients(params: { contract: Address; distributor: Address; campaignId: Hex; recipients: Address[]; rpc: PublicClient }): Promise<boolean[]>
```

**Batching**: Configurable batch size (default 200). Gas estimation with 20% padding. Dynamic fee bumping for stuck transactions. Nonce management.

**BatchResult**: Records every signed transaction, including failures and replacements.

```typescript
type BatchAttempt = {
  txHash: Hex
  nonce: number
  gasEstimate: bigint
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
  timestamp: number
  outcome: 'confirmed' | 'replaced' | 'reverted' | 'dropped'
}

type BatchResult = {
  batchIndex: number
  recipients: readonly Address[]
  amounts: readonly bigint[]
  attempts: BatchAttempt[]
  confirmedTxHash: Hex | null
  blockNumber: bigint | null
}
```

Every attempt is logged — if a tx gets stuck and gas is bumped, both the original and replacement are recorded. This provides a complete audit trail of everything the hot wallet key signed and broadcast.

#### csv

CSV parsing, validation, and amount handling.

```typescript
parseCSV(content: string, options?: CSVOptions): ParsedCSV
detectAmountFormat(values: string[]): 'integer' | 'decimal'
validateAddresses(rows: CSVRow[]): ValidationResult
deduplicateAddresses(rows: CSVRow[]): CSVRow[]
flagConflicts(rows: CSVRow[], format: 'integer' | 'decimal'): ConflictResult
```

**Amount format detection**: Auto-detects integer vs decimal based on column values. User can override with a toggle. If user selects "integer" but some rows contain decimals, those rows are highlighted as conflicts for the user to resolve (edit inline or re-upload).

**Two modes**: If the CSV has an `amount` column, amounts are per-address (variable). If no amount column, a uniform amount is applied to all addresses.

#### chains

Curated chain registry.

```typescript
SUPPORTED_CHAINS: ChainConfig[]
getChainConfig(chainId: number): ChainConfig
getExplorerApiUrl(chainId: number): string
resolveBlockByTimestamp(rpc: PublicClient, timestamp: number): Promise<bigint>
```

Each chain config includes: chainId, name, default RPC URLs, explorer API URL, native token symbol/decimals.

#### encode

Calldata encoders for `disperseCall()`.

```typescript
encode.transfer(token: Address, to: Address, amount: bigint): CallData
encode.nativeTransfer(to: Address): CallData  // empty bytes, value carries amount
encode.swap(router: Address, tokenIn: Address, tokenOut: Address, amountIn: bigint, amountOutMin: bigint, to: Address): CallData
encode.raw(abi: Abi, functionName: string, args: unknown[]): CallData
```

### Environment-Agnostic Storage Interface

The SDK defines a `Storage` interface. Consumers implement it for their environment.

```typescript
interface Storage {
  campaigns: CampaignStore
  addressSets: AddressSetStore
  addresses: AddressStore
  pipelineConfigs: PipelineConfigStore
  batches: BatchStore
  wallets: WalletStore
}
```

Web app implements with IndexedDB. TUI implements with filesystem.

### Callback-Driven Progress

All long-running operations accept an `onProgress` callback. The SDK reports state; consumers render it however they want (React components, terminal spinners, logs).

```typescript
type ProgressCallback = (event: ProgressEvent) => void

type ProgressEvent =
  | { type: 'scan'; currentBlock: bigint; endBlock: bigint; addressesFound: number }
  | { type: 'filter'; filterName: string; inputCount: number; outputCount: number }
  | { type: 'batch'; batchIndex: number; totalBatches: number; status: BatchStatus }
  | { type: 'tx'; batchIndex: number; attempt: BatchAttempt }
```

---

## Campaign Configuration

A campaign is identified by `(funder, name, version)`. This identity is stable across pipeline config changes — the user can modify filters mid-campaign without breaking resumability.

```typescript
type CampaignConfig = {
  // Identity (stable, used for resumability)
  funder: Address           // Cold wallet address
  name: string              // User-chosen name, e.g., "March HEX Airdrop"
  version: number           // Iteration number (default: 1)

  // Chain
  chainId: number
  rpcUrl: string

  // Token
  tokenAddress: Address     // address(0) for native
  tokenDecimals: number

  // Contract
  contractAddress: Address | null  // Set after deployment
  contractVariant: 'simple' | 'full'
  contractName: string      // Solidity contract name for block explorer

  // Amounts
  amountMode: 'uniform' | 'variable'
  amountFormat: 'integer' | 'decimal'  // Auto-detected, toggleable
  uniformAmount: string | null         // Only when amountMode = 'uniform'

  // Distribution
  batchSize: number         // Default: 200
  campaignId: Hex | null    // bytes32 for on-chain registry. Derived: keccak256(funder, name, version)
  pinnedBlock: bigint | null // Set when pipeline completes; used for live guard
}
```

### On-chain Campaign ID

For the full contract variant, the on-chain `bytes32 campaignId` is derived deterministically:

```
campaignId = keccak256(abi.encodePacked(funder, name, version))
```

This is reproducible across web and TUI sessions.

### Auto-Resume

Both web and TUI resume automatically by campaign identity. No `--resume` flag needed — providing the campaign name and funder is sufficient. The system finds the existing campaign state and picks up from the last completed batch.

---

## Web App — @titrate/web

### Stack

- Vite + React
- Reown (wallet connection for signing only)
- Viem publicClient on user-provided RPC for all reads
- IndexedDB for all persistent state

### IndexedDB Schema

Six object stores:

**campaigns** — top-level grouping. Stores `CampaignConfig` plus `createdAt`/`updatedAt`.

**addressSets** — named sets of addresses belonging to a campaign. Fields: `id`, `campaignId`, `name`, `type` (source | derived-filter | external-filter | result), `addressCount`, `createdAt`.

**addresses** — individual addresses in a set. Composite key `[setId]:[address]`. Fields: `setId`, `address`, `amount` (nullable, only for result sets with variable amounts).

**pipelineConfigs** — serialized pipeline JSON per campaign.

**batches** — distribution batch tracking. Fields: `id`, `campaignId`, `batchIndex`, `recipients`, `amounts`, `status` (pending | signing | broadcast | confirmed | failed), `attempts` (BatchAttempt[]), `confirmedTxHash`, `confirmedBlock`, timestamps.

**wallets** — hot wallet references. Fields: `id`, `campaignId`, `hotAddress`, `coldAddress`, `createdAt`. Private keys are never stored.

### RPC Separation

- **Reads** (getLogs, getBalance, getCode, getBlock): direct viem publicClient → user's RPC URL
- **Signing** (sendTransaction, signTypedData): Reown wallet provider

This avoids consuming the wallet provider's rate limits on heavy scanning operations.

### UI Flow

Six-step wizard that builds a visible pipeline diagram:

1. **Campaign Setup** — name, chain selection (dropdown), RPC URL, token address. Auto-fetches token name/decimals from RPC.
2. **Build Address List** — CSV upload or on-chain block scan with date picker (SDK resolves dates to block numbers). Configurable field extraction. Shows count + preview.
3. **Apply Filters** — add/remove filter steps. Derived filters (contract check, min balance, nonce range) + external negative lists (token transfer recipients, CSV exclusion). Each filter shows how many addresses it removes. Pipeline diagram visible alongside with live counts.
4. **Configure Amounts** — uniform (single input) or variable (CSV column mapping). Auto-detect int vs decimal with toggle override. Conflict highlighting for mismatched rows. Shows total tokens needed.
5. **Wallet & Contract Setup** — connect cold wallet (Reown). Derive hot wallet (EIP-712 sign). Deploy contract (pick variant, enter name). Shows hot wallet address + "copy private key" button. Fund hot wallet with gas.
6. **Review & Distribute** — preflight checks (balances, allowances, gas). Live guard scan (post-pinned-block + on-chain registry check). Batch progress dashboard with status per batch, tx hashes, attempts/failures. Pause/resume. All state persisted to IndexedDB between sessions.

### Offline-First Guarantees

- **Survives refresh**: all campaign state in IndexedDB. Close tab, reopen, pick up where you left off.
- **No backend**: only outbound connections are the user's RPC and block explorer verification API.
- **Export everything**: address sets, batch results, pipeline configs exportable as CSV/JSON.
- **Private keys stay local**: derived on-demand from EIP-712 re-sign, held in memory only, never persisted.

### Key UX Details

- **Block range ↔ date picker**: user selects dates, SDK resolves to block numbers. Shows both.
- **Live pipeline diagram**: as filters run, the diagram updates with counts showing exactly what each step removes.
- **Scan progress**: current block, blocks remaining, addresses found, estimated time. Dynamic range titration.
- **Amount conflict resolution**: if user toggles "integer" but rows have decimals, those rows are highlighted in a table for inline editing or re-upload.

---

## TUI — @titrate/tui

### Framework

TBD — candidates: Ink (React for terminals), Clack (lightweight prompts), or Commander + Ora (traditional CLI). Decision deferred to implementation planning.

### Two Modes

**Interactive**: step-by-step prompts with live progress (spinners, bars, counts). Mirrors the web app wizard.

**Headless/Scriptable**: fully composable with flags or a pipeline config JSON file. Suitable for cron, automation, CI.

```bash
# Interactive
$ titrate

# Headless — collect addresses
$ titrate collect \
  --chain ethereum \
  --rpc https://rpc.example.com \
  --blocks 20000000:21000000 \
  --extract tx.from \
  --filter-contracts \
  --filter-min-balance 0.05 \
  --exclude-token-recipients 0x2b59... \
  --output addresses.csv

# Headless — deploy
$ titrate deploy \
  --chain ethereum \
  --name "BuyMoreHEX" \
  --variant simple \
  --private-key $HOT_KEY

# Headless — distribute
$ titrate distribute \
  --contract 0xABC... \
  --token 0x2b59... \
  --addresses addresses.csv \
  --amount 1.0 \
  --batch-size 200 \
  --private-key $HOT_KEY \
  --from 0xCOLD... \
  --campaign-id "march-2024"

# Headless — from pipeline config
$ titrate run --config pipeline.json

# Derive hot wallet
$ titrate derive-wallet \
  --cold-key $COLD_KEY \
  --message "Titrate Hot Wallet v1"
```

### Auto-Resume

Automatic by campaign name. No `--resume` flag:

```bash
$ titrate --name "march-hex" --funder 0xCOLD...
# First run: creates campaign, runs full flow
# Next run: finds existing state, resumes from last completed batch
```

### Storage

Filesystem-backed, same logical schema as web app's IndexedDB:

```
.titrate/
├── campaigns/
│   └── march-hex-airdrop/
│       ├── campaign.json
│       ├── pipeline.json
│       ├── sets/
│       │   ├── source-block-scan.csv
│       │   ├── filter-contracts.csv
│       │   └── result.csv
│       └── batches/
│           ├── batch-000.json
│           ├── batch-001.json
│           └── ...
└── wallets.json            # Hot wallet addresses only (no keys)
```

### Web vs TUI Adapter Comparison

| Concern | Web | TUI |
|---------|-----|-----|
| Storage | IndexedDB | Filesystem (.titrate/) |
| Signing | Reown wallet provider | Private key from env/flag |
| Progress | React components | Terminal spinners/bars |
| Pipeline config | Built in wizard UI | JSON file or flags |
| Hot wallet | EIP-712 via Reown | EIP-712 via local key |
| Resumability | Automatic (IndexedDB) | Automatic (state files) |

---

## Data Flow Summary

```
Sources (CSV / Block Scan)
    ↓ Set<Address>
Derived Filters (contract check, min balance, nonce range)
    ↓ Set<Address>  (each filter shows removal count)
External Negative Lists (token recipients, CSV exclusion, on-chain registry)
    ↓ Set<Address>
Amount Assignment (uniform or variable from CSV)
    ↓ Map<Address, bigint>
Live Guard (post-pinned-block scan + registry check)
    ↓ Map<Address, bigint>  (final eligible set)
Batch Distribution (chunks of batchSize)
    ↓ BatchResult[]  (tx hashes, attempts, status)
```

All intermediate address sets are stored (IndexedDB or filesystem). Raw blockchain data (blocks, logs) is discarded immediately after extraction — only the resulting address sets persist.

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| Language | TypeScript (strict mode) |
| Chain interaction | Viem |
| Wallet connection (web) | Reown |
| Web framework | Vite + React |
| Web storage | IndexedDB (via idb) |
| Smart contracts | Solidity ^0.8.28 |
| Contract compilation | solc (build-time only, not shipped to users) |
| Contract testing | Foundry (forge) |
| Unit/integration tests | Vitest |
| Monorepo | npm/yarn workspaces |

---

## Security Considerations

- **Private keys in memory only**: hot wallet key derived on-demand from EIP-712 signature, never persisted to IndexedDB or filesystem.
- **Titrated, selector-scoped allowances**: cold wallet meters out a specific budget to the hot wallet, scoped per function selector (bytes4). A hot wallet approved for `disperseSimple` cannot pivot to `disperseCall` for DEX swaps. If compromised, damage bounded by remaining allowance for approved methods only.
- **Double-approval model**: ERC-20 approve (per-token) + operator allowance (per-selector rate limiter). Effective limit = min of both.
- **Multicall composability**: `multicall(bytes[])` via `delegatecall` preserves `msg.sender` for allowance checks, allowing atomic composition of multiple operations in a single transaction.
- **Append-before-confirm**: batch recipients recorded to local storage before transaction confirmation. Prefers under-send to double-send on crash.
- **On-chain registry dedup**: `checkRecipients()` provides cross-session, cross-device deduplication via contract state.
- **RPC separation**: reads go to user-provided RPC, signing through wallet provider. Avoids leaking wallet provider rate limits.
- **No backend**: zero server infrastructure. All state is local. Only outbound connections are RPC and block explorer verification API.
