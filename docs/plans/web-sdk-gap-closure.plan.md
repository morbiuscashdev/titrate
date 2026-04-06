# Plan: Web App SDK Gap Closure

- **Status**: COMPLETE
- **Created**: 2026-04-06
- **Source**: Gap analysis — SDK features not yet exposed in web app

## Context

**Goal**: Close the functional gaps between the SDK and web app so the web UI is a fully capable distribution client, not just a wizard that stores config and fires transactions.

**Source docs**: Gap analysis from session start (15 gaps, 5 priority tiers)

**Code explored**:
- `packages/sdk/src/types.ts` — `CampaignConfig.campaignId: Hex | null`
- `packages/sdk/src/distributor/disperse.ts` — `ZERO_BYTES32` default, campaignId passed to TitrateFull
- `packages/sdk/src/distributor/registry.ts` — `checkRecipients()` needs non-null campaignId
- `packages/sdk/src/validation/` — `validateAddresses`, `validateAmounts`, `validateBatch`
- `packages/sdk/src/pipeline/pipeline.ts` — `createPipeline().execute()` async generator
- `packages/sdk/src/intervention/spot-check.ts` — `createSpotCheck()` random sample with explorer links
- `packages/sdk/src/distributor/verify.ts` — `verifyContract()` + `pollVerificationStatus()`
- `packages/sdk/src/sets/index.ts` — `union`, `intersect`, `difference`, `symmetricDifference`
- `packages/sdk/src/distributor/disperse-parallel.ts` — `disperseParallel()` multi-wallet
- `packages/web/src/steps/CampaignStep.tsx:135` — `campaignId: null` always
- `packages/web/src/steps/RequirementsStep.tsx:29` — `DEFAULT_GAS_PER_BATCH = 300_000n` hardcoded
- `packages/web/src/steps/DistributeStep.tsx:200` — `composeLiveFilters(registryFilter)` only
- `packages/web/src/steps/FiltersStep.tsx:87` — saves to IDB, never executes
- `packages/web/src/hooks/useLiveFilter.ts` — registry filter only, no pipeline integration
- `packages/web/src/hooks/useGasEstimate.ts` — implemented, unused

---

## Phase 1: Wiring Fixes — Planned: yes

Small, high-impact fixes that connect existing SDK functions to existing UI surfaces. No new components needed.

### Task 1.1: Generate campaignId from campaign name

- **Status**: complete
- **Type**: deterministic
- **Action**: In `CampaignStep.tsx`, when creating or saving a campaign with `contractVariant === 'full'`, derive `campaignId` as `keccak256(toHex(campaignName))`. For `simple` variant, keep `null` (no registry). Import `keccak256` and `toHex` from viem. Update both the create path (line 135) and the update path (line 107-117).
- **Files**:
  - Modify: `packages/web/src/steps/CampaignStep.tsx`
  - Modify: `packages/web/src/steps/CampaignStep.test.tsx` (add tests for campaignId derivation)
- **Dependencies**: none

### Task 1.2: Wire useGasEstimate into RequirementsStep

- **Status**: complete
- **Type**: deterministic
- **Action**: Replace `DEFAULT_GAS_PER_BATCH` usage with the existing `useGasEstimate` hook. The hook needs a `GasEstimateParams` object — construct it from `activeCampaign.contractAddress`, `activeCampaign.contractVariant`, `activeCampaign.tokenAddress`, and recipient/amount data. Fall back to `DEFAULT_GAS_PER_BATCH` when the hook returns `undefined` (no contract deployed yet or estimation fails). Show the gas source (estimated vs default) in the UI.
- **Files**:
  - Modify: `packages/web/src/steps/RequirementsStep.tsx`
  - Modify: `packages/web/src/steps/RequirementsStep.test.tsx`
- **Dependencies**: none

### Task 1.3: Add pre-distribution validation

- **Status**: complete
- **Type**: deterministic
- **Action**: In `DistributeStep.tsx`, before entering the `distributing` phase (around line 365), call `validateBatch(recipientAddresses, amounts)` from `@titrate/sdk`. If any `severity === 'error'` issues are returned, set error state and abort. If only warnings, trigger an intervention point (`validation-warning`) so the user can review and override. Import `validateBatch` from SDK.
- **Files**:
  - Modify: `packages/web/src/steps/DistributeStep.tsx`
  - Modify: `packages/web/src/steps/DistributeStep.test.tsx`
- **Dependencies**: none

### Task 1.4: Compose pipeline filters into live filter chain

- **Status**: complete
- **Type**: deterministic
- **Action**: In `DistributeStep.tsx`, the `pipelineConfig` is already loaded from IDB (line 262-268) but never used. Create a `usePipelineLiveFilter(pipelineConfig)` hook that converts the stored `PipelineConfig` steps into a `LiveFilter` function by calling `createPipeline(config).execute(publicClient)` to get the filtered address set, then using that set as a whitelist filter. Compose it with `registryFilter` via `composeLiveFilters(registryFilter, pipelineFilter)`. The pipeline filter should run once when distribution starts and cache the result set, then filter each batch against it.
- **Files**:
  - Create: `packages/web/src/hooks/usePipelineLiveFilter.ts`
  - Create: `packages/web/src/hooks/usePipelineLiveFilter.test.ts`
  - Modify: `packages/web/src/steps/DistributeStep.tsx` (compose both filters)
- **Dependencies**: none

---

## Phase 2: Pipeline Execution in FiltersStep — Planned: yes (complete)

Make FiltersStep actually run the pipeline against loaded addresses to show a live preview of filter results before the user continues. This gives immediate feedback on how many addresses survive each filter.

- Run `createPipeline(config).execute(publicClient)` in a `useEffect` when filters change
- Show filtered count vs total count
- Optionally save the filtered address set as a `derived-filter` type address set in IDB
- Add progress indicator for long-running filters (e.g., contract-check requires RPC calls)
- Handle filter errors gracefully (show which filter failed and why)

**Open questions:**
- Should the filtered set be persisted or re-computed at distribution time?
- Should we show a sample of excluded addresses for transparency?
- Do we need cancellation support for long-running pipeline execution?

---

## Phase 3: Contract Verification + Intervention Journal + Spot Checks — Planned: yes (complete)

Complete the post-deployment and during-distribution workflow.

- **Contract verification**: Add a "Verify Contract" button in DistributeStep (ready phase, after deploy). Call `verifyContract()` from SDK, show polling status and explorer link on success. Store verification status on the campaign.
- **Intervention journal**: Persist every intervention decision (point, action, timestamp, context) to IDB. Add a journal viewer accessible from the distribute step's complete phase. The TUI already does this — the web needs parity.
- **Spot checks**: Integrate `createSpotCheck()` into the `batch-preview` intervention modal. Show random address samples with explorer links before the user approves a batch. Requires explorer base URL derivation (already have `deriveExplorerBaseUrl`).

**Open questions:**
- Where should the journal be stored? New IDB store or as metadata on batches?
- Should spot check sample size be configurable per campaign?

---

## Phase 4: Address Collection Sources + Set Operations — Planned: yes (complete)

This is the biggest new UI surface — a wizard step or sub-panel for collecting addresses from on-chain sources rather than just CSV/paste.

- **Block scan source**: UI for entering block range, contract address. Calls `createPipeline().addSource('block-scan', params)`.
- **Explorer scan source**: UI for entering explorer API params. Calls `addSource('explorer-scan', params)`.
- **TrueBlocks source**: UI for TrueBlocks endpoint. Calls `addSource('trueblocks-scan', params)`.
- **Set operations**: UI for combining multiple address sets with union/intersect/difference/symmetricDifference. Likely a new component in AddressesStep or a dedicated sub-step.

**Open questions:**
- Should sources be run eagerly (collect addresses now) or deferred to distribution time?
- How should source progress be displayed for long-running block scans?
- Should set operations be a separate step or part of AddressesStep?
- Does the address set model need extending to track source provenance?

---

## Phase 5: TrueBlocks Integration + Integrations — Planned: yes (partial)

Advanced features for power users.

- **Multi-wallet distribution**: UI for connecting multiple wallet clients, configuring `disperseParallel()`. Requires WalletStep changes to support multiple wallets and DistributeStep changes to call `disperseParallel` instead of `disperseTokensSimple`/`disperseTokens`.
- **TrueBlocks config**: Wire the empty TrueBlocks fields in SettingsPage to chainConfig storage.
- **Explorer bus scan**: Wire explorer config fields to source execution.
- **Memory monitor**: Connect existing `MemoryWarning` component to the memory monitor utility.

**Open questions:**
- How should wallet assignment work? Round-robin or user-configured?
- Should parallel distribution show per-wallet progress?
- Is nonce window configurable per wallet in parallel mode?

---

## Design Decisions

1. **campaignId derived from name, not user-entered**: Users shouldn't need to understand bytes32 hex. Deriving from campaign name is deterministic, reproducible, and collision-resistant for practical purposes. If the same name is reused, that's the same campaign — which is the correct semantic for double-send protection.

2. **Pipeline filter runs once and caches**: Rather than re-executing the pipeline for every batch, we run it once when distribution starts and use the result set as a whitelist. This avoids N RPC calls per batch for on-chain filters like `contract-check`.

3. **Validation gates distribution, not just warns**: Hard errors (length mismatch, invalid addresses) block distribution entirely. Warnings (duplicates, checksums) go through the intervention system so the user can review and override. This matches the TUI behavior.

4. **Phase 1 is wiring only**: No new UI components in Phase 1. Every task connects existing SDK functions to existing UI surfaces. This minimizes risk and maximizes impact per line of code changed.

---

## Verification

- [ ] `npx vitest run` passes in `packages/web`
- [ ] campaignId is non-null for Full variant campaigns
- [ ] RequirementsStep shows estimated gas (not just 300k default) when contract is deployed
- [ ] Distribution with invalid addresses shows validation errors before any tx is sent
- [ ] Pipeline filters from FiltersStep are applied during distribution
- [ ] `npm test` passes from monorepo root

---

## Post-Completion Log

### Deferred Scope
- **Multi-wallet distribution (disperseParallel)**: Requires multiple concurrent wallet connections via wagmi, per-wallet progress UI, and wallet assignment strategy. Complex UX — deserves its own plan.
- **increaseOperatorAllowance (top-up vs replace)**: Low priority, simple variant doesn't need it
- **Memory monitor wiring**: Low priority, cosmetic
- **token-recipients filter startBlock/endBlock**: Missing params in PipelineStepEditor, not blocking
