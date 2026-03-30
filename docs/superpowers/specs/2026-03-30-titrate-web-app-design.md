# Titrate Web App Design

## Overview

Browser-based UI for the Titrate airdrop platform. Offline-first, self-hosted, wallet-authenticated. Built on top of `@titrate/sdk` and `@titrate/storage-idb`.

**Build progression:** C (component library) → B (distribution MVP) → A (full app) → Z (analytics)

This spec covers the full vision. The first implementation plan targets **Phase C only** (preceded by SDK extraction of shared business logic from the TUI).

## Tech Stack

- **Framework:** Vite + React 19
- **Styling:** Tailwind CSS + Tailwind UI (paid)
- **Wallet:** Reown AppKit (wagmi adapter)
- **Chain interaction:** Viem + wagmi (Reown sits on top)
- **Storage:** `@titrate/storage-idb` (IndexedDB) with AES-GCM encryption
- **Testing:** Vitest + React Testing Library

## Package: `packages/web`

### Dependencies

- `@titrate/sdk` — business logic
- `@titrate/storage-idb` — IndexedDB persistence
- `@reown/appkit` + `@reown/appkit-adapter-wagmi` — wallet connection
- `viem`, `wagmi` — chain interaction
- `react`, `react-dom`, `react-router` — UI framework
- `tailwindcss`, `@tailwindcss/forms` — styling

## Layout Architecture

### Responsive Design

- **Desktop (≥1024px):** Split timeline — fixed left rail with step indicators, right pane with active step content.
- **Mobile (<1024px):** Progressive reveal — horizontal progress bar at top, steps collapse into summary bars as completed, active step renders full-width below.

### Routing

| Route | View | Description |
|-------|------|-------------|
| `/` | Mission Control | Grid of CampaignCards, "New Campaign" button |
| `/campaign/:id` | Campaign Detail | Timeline/progressive layout with all steps |
| `/settings` | Settings | Global chain configs, explorer API keys |

### Mission Control (Multi-Campaign Dashboard)

Grid of `CampaignCard` tiles. Each shows campaign name, chain, token, address count, distribution progress, and status. Click to drill into the campaign detail view.

## Storage

### Existing Stores (from `@titrate/storage-idb`)

Campaigns, address sets, addresses, batches, wallets, pipeline configs — unchanged.

### New Stores

| Store | Purpose | Schema |
|-------|---------|--------|
| `chainConfigs` | Global chain settings | `{ id, chainId, name, rpcUrl, explorerApiUrl, explorerApiKey }` |
| `appSettings` | App preferences | `{ key, value }` key-value store |

### Encryption

On first wallet connect, the user signs a typed EIP-712 message. `keccak256(signature)` produces an AES-GCM key stored in `sessionStorage`. All IndexedDB writes encrypt with this key; all reads decrypt. Key is evicted on tab close. User signs again to re-enter.

### Configuration Model

Global chain configs serve as defaults. Any campaign can override the RPC URL (e.g., dedicated node for high-volume drops). Per-campaign overrides are stored in the campaign record, not in `chainConfigs`.

## Component Library (Phase C)

All components are pure: `(props) => JSX`. No hooks, no state, no context. Each has a colocated `.test.tsx` file.

### Layout Components

- **`TimelineRail`** — Vertical step indicators (complete/active/locked) with labels and summaries. Desktop: fixed left rail. Mobile: collapses to horizontal progress bar.
- **`StepPanel`** — Right-side content area in split view. Full-width on mobile below progress bar.
- **`CampaignCard`** — Mission control tile: campaign name, chain badge, status, address count, progress indicator. Clickable.
- **`AppShell`** — Responsive wrapper switching between split-timeline (≥1024px) and progressive-reveal (<1024px). Renders `TimelineRail` + `StepPanel` or stacked progressive view.

### Data Display Components

- **`AddressTable`** — Paginated address list with optional amount column. Supports selection, sorting, conflict highlighting (flagged duplicates or amount mismatches).
- **`BatchStatusCard`** — Single batch display: tx hash (linked to explorer), recipient count, status badge (pending/confirmed/failed), gas cost.
- **`BatchTimeline`** — Vertical list of `BatchStatusCard`s showing distribution progress.
- **`SpendSummary`** — Post-distribution report: total gas spent, total tokens distributed, unique recipients, cost per recipient, per-batch breakdown table.
- **`RequirementsPanel`** — Pre-distribution checklist: gas token needed, ERC-20 needed, current balances, shortfall warnings with deficit amounts.

### Form Components

- **`ChainSelector`** — Dropdown of configured chains with network color indicator.
- **`PipelineStepEditor`** — Configure a single pipeline step. Renders different fields per step type (source: CSV path / block scan params / explorer scan; filter: min balance / nonce range / contract check / exclude list).
- **`AmountConfig`** — Uniform vs. variable toggle, decimal vs. integer selector, amount input field.
- **`WalletBadge`** — Connected address (truncated), chain name, balance display. Perry mode indicator showing hot/cold relationship.

### Feedback Components

- **`ProgressRing`** — Circular progress indicator for scanning/filtering operations. Shows percentage and optional label.
- **`StatusBadge`** — Colored pill: pending (gray), active (blue), complete (green), error (red), locked (dim).
- **`MemoryWarning`** — Dismissable banner that appears when heap usage crosses threshold during long operations.

## App Architecture (Phases B & A)

### State Management

React context + `useReducer`. Three contexts:

- **`StorageContext`** — Holds decrypted IDB `Storage` instance. `null` until wallet signs in.
- **`CampaignContext`** — Active campaign state within `/campaign/:id`. Drives step locking.
- **`WalletContext`** — Reown connection state, perry mode flag, hot wallet reference.

### Step Locking

Each step declares prerequisites. A step is unlocked only when its prerequisite is satisfied:

| Step | Unlocked When |
|------|--------------|
| Campaign | Always (first step) |
| Addresses | Campaign saved (chain + token chosen) |
| Filters | At least 1 address source added |
| Amounts | Filters configured (even if empty — explicit "no filters" confirmation) |
| Wallet | Amounts set |
| Requirements | Wallet connected, requirements computed |
| Deploy & Distribute | Requirements met (sufficient balance) or perry mode bypass |

### Perry Mode (Hot/Cold Wallet Separation)

Named after Katy Perry — hot and cold.

1. Connect cold wallet via Reown → sign EIP-712 typed message → `keccak256(signature)` derives hot wallet private key
2. Cold wallet disconnects from UI (private key never touched again)
3. Hot wallet handles deploy + distribute transactions
4. `WalletBadge` shows perry mode indicator: "Operating as 0xHot, derived from 0xCold"
5. User can bypass the requirements check in perry mode (they control funding externally)

### Normal Mode

1. Connect wallet via Reown — this wallet does everything directly
2. No derivation step, no hot/cold separation
3. User approves each transaction in their wallet extension

## SDK Additions

### SDK Extraction (Phase C prerequisite)

Business logic currently trapped in `packages/tui` that both TUI and web app need. Extract to SDK, then update TUI to import from SDK.

| Function | From (TUI) | To (SDK) | Purpose |
|----------|-----------|----------|---------|
| `decimalToInteger` | `steps/amounts.ts` | `utils/amounts.ts` | Decimal string + token decimals → bigint |
| `parseVariableAmounts` | `steps/amounts.ts` | `utils/amounts.ts` | CSV amount strings → bigint array |
| `slugifyCampaignName` | `steps/distribute.ts` | `utils/campaign.ts` | Name → deterministic ID slug |
| `probeToken` | `steps/campaign.ts` | `utils/token.ts` | Read ERC-20 name/symbol/decimals from contract |
| `resolveBlockRef` | `steps/addresses.ts` | `utils/blocks.ts` | Date string or block number string → bigint block number |
| `computeResumeOffset` | `steps/distribute.ts` | `utils/resume.ts` | Confirmed batch count × batch size → skip offset |
| `alignAmountsForResume` | `steps/distribute.ts` | `utils/resume.ts` | Slice amount array to match resumed recipient offset |
| `serializeBatchResults` | `commands/distribute.ts` | `utils/serialize.ts` | BigInt batch results → JSON-safe format |

### Pure Functions (Phase C)

**`computeRequirements(config)`** — Given recipient count, amount config, batch size, and gas estimate, returns `{ gasTokenNeeded, erc20Needed }`. Pure arithmetic, no RPC.

**`aggregateSpendReport(batches)`** — Given completed `StoredBatch[]`, returns `{ totalGas, totalTokens, uniqueRecipients, costPerRecipient, perBatch[] }`. Pure aggregation.

### Explorer Integration (Phase B)

**`scanTransferEventsViaExplorer(explorerUrl, apiKey, tokenAddress, options)`** — Alternative to RPC-based `scanTransferEvents`. Uses Etherscan-compatible `tokentx` endpoint. Paginated, no range titration needed. Faster for wide block ranges.

New pipeline source type: `explorer-scan` alongside existing `block-scan` and `csv`.

### Spend Summary Persistence (Phase B)

`aggregateSpendReport` output persisted per campaign in IDB. Serves as baseline data for Phase Z analytics.

## Build Phases

### Phase C: Component Library (this plan)

- Extract shared business logic from TUI into SDK (see SDK Extraction table above)
- Update TUI to import extracted functions from SDK
- Add SDK pure functions: `computeRequirements`, `aggregateSpendReport`
- Scaffold `packages/web` (Vite + React + Tailwind + Vitest + React Testing Library)
- Build all pure components listed in Component Library section
- Each component tested in isolation with mock data

### Phase B: Distribution MVP

- Reown AppKit integration
- `StorageContext` with IDB encryption (sign-in flow)
- Single-campaign flow with step locking
- Perry mode (hot wallet derivation + cold wallet ejection)
- SDK: `scanTransferEventsViaExplorer`
- New IDB stores: `chainConfigs`, `appSettings`
- Spend summary after distribution

### Phase A: Full App

- Mission control dashboard (multi-campaign grid)
- React Router (`/`, `/campaign/:id`, `/settings`)
- Campaign CRUD (create, resume, clone, archive)
- Global settings page
- Auto-resume from last completed batch

### Phase Z: Analytics

- Post-distribution recipient behavior tracking
- ROI metrics: retention rate, sell-off rate, protocol engagement
- Campaign comparison: which pipeline configs produce better retention
- Built on explorer API + spend summary baseline data
