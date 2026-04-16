# Titrate Interactive Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive wizard mode to the TUI. When the user runs `titrate` with no subcommand (or `titrate wizard`), they get a step-by-step guided flow using @clack/prompts.

**Architecture:** The wizard is a single `wizard.ts` file that orchestrates @clack/prompts calls and delegates to the SDK for execution. It saves campaign state via the filesystem storage adapter, enabling auto-resume. Each step is a focused function returning its result.

**Tech Stack:** @clack/prompts (already installed), @titrate/sdk, filesystem storage

---

## File Structure

```
packages/tui/src/
├── interactive/
│   ├── wizard.ts          # Main wizard orchestrator
│   ├── steps/
│   │   ├── campaign.ts    # Step 1: Campaign setup
│   │   ├── addresses.ts   # Step 2: Build address list
│   │   ├── filters.ts     # Step 3: Apply filters
│   │   ├── amounts.ts     # Step 4: Configure amounts
│   │   ├── wallet.ts      # Step 5: Wallet & contract setup
│   │   └── distribute.ts  # Step 6: Review & distribute
│   └── format.ts          # Formatting helpers for terminal output
```

---

### Task 1: Wizard Orchestrator + Campaign Step

**Files:**
- Create: `packages/tui/src/interactive/wizard.ts`
- Create: `packages/tui/src/interactive/steps/campaign.ts`
- Create: `packages/tui/src/interactive/format.ts`
- Modify: `packages/tui/src/index.ts`

The wizard orchestrator introduces the flow, runs each step in sequence, and handles cancellation. The campaign step collects: campaign name, chain selection (from SUPPORTED_CHAINS + custom), RPC URL, token address (with auto-fetch of name/decimals), and contract variant.

Campaign step should:
- Check for existing campaign by (funder, name, version) for auto-resume
- If found, ask if user wants to resume or start fresh
- Use `@clack/prompts` for: `intro`, `text`, `select`, `confirm`
- Validate token address by calling `erc20.name()` and `erc20.decimals()` on the RPC

---

### Task 2: Address List Step

**Files:**
- Create: `packages/tui/src/interactive/steps/addresses.ts`

The address list step lets the user choose between:
- CSV file path (reads and parses with SDK's `parseCSV`)
- Block scan (prompts for block range as dates or numbers, field extraction)
- Both (union)

Shows a summary: "Found X unique addresses from [source]"

For block scan, use `resolveBlockByTimestamp` when dates are entered.

---

### Task 3: Filters Step

**Files:**
- Create: `packages/tui/src/interactive/steps/filters.ts`

Multi-select of available filters:
- Remove contracts (contract-check)
- Minimum balance (prompts for threshold)
- Nonce range (prompts for min/max)
- Exclude token recipients (prompts for token address + block range)
- Exclude CSV (prompts for file path)

After selection, runs the pipeline and shows results:
```
  Applying filters...
  ├ Contract check: 250,000 → 230,000 (-20,000)
  ├ Min balance 0.05 ETH: 230,000 → 180,000 (-50,000)
  └ Token recipients: 180,000 → 150,000 (-30,000)
  Result: 150,000 eligible addresses
```

---

### Task 4: Amounts Step

**Files:**
- Create: `packages/tui/src/interactive/steps/amounts.ts`

If the CSV had an amount column, show the auto-detected format and ask to confirm/override.
If no amount column, prompt for a uniform amount.

Show:
- Total tokens needed
- Any conflicts (decimal values when integer mode selected)
- Let user choose to proceed or fix conflicts

---

### Task 5: Wallet & Contract Step

**Files:**
- Create: `packages/tui/src/interactive/steps/wallet.ts`

Prompts for:
1. Private key (or env var) — this is the cold wallet key
2. Derive hot wallet (auto-sign EIP-712, show derived address + private key)
3. Deploy contract or use existing
   - If deploying: enter contract name, choose variant
   - If existing: enter contract address
4. For full variant: set up operator allowance (approve hot wallet for the disperse method)

Show the hot wallet address and let user copy the private key.

---

### Task 6: Review & Distribute Step

**Files:**
- Create: `packages/tui/src/interactive/steps/distribute.ts`

Shows a review summary:
```
  Campaign: March HEX Airdrop v1
  Chain: Ethereum (1)
  Token: HEX (0x2b59...)
  Contract: BuyMoreHEX (0xABC...) [simple]
  Recipients: 150,000
  Amount: 1 HEX each (150,000 HEX total)
  Batch size: 200
  Batches: 750
  Hot wallet: 0x1234...
```

Asks for confirmation, then runs the distribution with the progress renderer. Shows batch-by-batch progress. Saves state after each batch for resume.

---

## Pre-flight Checklist

- [ ] @clack/prompts is installed in packages/tui
- [ ] Anvil running for any contract deployment testing
- [ ] All Phase 2 tests pass
