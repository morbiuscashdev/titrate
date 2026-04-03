# Human Interventions Layer — Design Spec

## Overview

Add human intervention points throughout the distribution pipeline. At each stage, the system can pause, present data for review, accept edits, and validate before proceeding. Validation issues above a threshold force a stop — the user must fix or acknowledge before continuing.

The intervention system is SDK-level (hooks) with TUI-level implementation (file-based review). The web app will implement the same hooks with UI components later.

## Architecture

### Three Layers

1. **SDK: Validation** — shared validation functions that classify issues by severity
2. **SDK: Intervention hooks** — async callbacks at decision points, awaiting user response
3. **TUI: File-based review** — writes review files, prompts user, reads back edits, logs decisions

### Data Flow

```
Data enters (CSV, scanner, pipeline, manual)
  → Validate
  → Issues found?
    → Errors: STOP — write review file, force user to fix
    → Warnings: PAUSE — write review file, user must acknowledge
    → Clean: proceed
  → User edits review file
  → Re-validate
  → Loop until clean or user explicitly overrides warnings
  → Log decision to intervention journal
  → Continue pipeline
```

## SDK: Validation

### ValidationIssue Type

```typescript
type ValidationSeverity = 'error' | 'warning' | 'info';

type ValidationIssue = {
  readonly severity: ValidationSeverity;
  readonly row: number;           // 0-based index, -1 for set-level issues
  readonly field: string;         // 'address', 'amount', 'batch'
  readonly value: string;         // the problematic value
  readonly message: string;       // human-readable description
  readonly code: string;          // machine-readable code for programmatic handling
};
```

### Issue Codes

| Code | Severity | Field | Description |
|------|----------|-------|-------------|
| `INVALID_HEX` | error | address | Non-hex character in address |
| `INVALID_LENGTH` | error | address | Address not 42 chars (0x + 40 hex) |
| `INVALID_PREFIX` | error | address | Missing 0x prefix |
| `NEGATIVE_AMOUNT` | error | amount | Amount is negative |
| `INVALID_AMOUNT` | error | amount | Amount is not a valid number |
| `CHECKSUM_MISMATCH` | warning | address | EIP-55 checksum doesn't match |
| `DUPLICATE_ADDRESS` | warning | address | Address appears more than once |
| `DUPLICATE_DIFF_AMOUNT` | warning | address | Duplicate address with different amounts |
| `ZERO_AMOUNT` | warning | amount | Amount is zero |
| `LARGE_AMOUNT` | warning | amount | Amount exceeds a configurable threshold |
| `DEDUP_COUNT` | info | address | Number of duplicates removed |
| `FILTER_COUNT` | info | address | Number of addresses filtered out |

### Validation Functions

```typescript
/** Validates a set of addresses. Returns issues sorted by severity (errors first). */
function validateAddresses(addresses: readonly string[]): ValidationIssue[];

/** Validates amounts paired with addresses. */
function validateAmounts(
  amounts: readonly bigint[],
  options?: { largeAmountThreshold?: bigint },
): ValidationIssue[];

/** Validates a batch before sending — addresses + amounts + batch-level checks. */
function validateBatch(
  recipients: readonly Address[],
  amounts: readonly bigint[],
): ValidationIssue[];

/** Returns true if any issues have severity 'error'. */
function hasErrors(issues: readonly ValidationIssue[]): boolean;

/** Returns true if any issues have severity 'warning'. */
function hasWarnings(issues: readonly ValidationIssue[]): boolean;

/** Filters issues by severity. */
function filterBySeverity(
  issues: readonly ValidationIssue[],
  severity: ValidationSeverity,
): ValidationIssue[];
```

### Module Location

`packages/sdk/src/validation/` — new module:
- `types.ts` — ValidationIssue, ValidationSeverity, issue codes
- `addresses.ts` — validateAddresses
- `amounts.ts` — validateAmounts
- `batch.ts` — validateBatch
- `helpers.ts` — hasErrors, hasWarnings, filterBySeverity
- `index.ts` — barrel exports

## SDK: Intervention Hooks

### InterventionContext

Passed to hooks so they know what stage the pipeline is at and what data to present:

```typescript
type InterventionPoint =
  | 'address-review'        // after address collection, before filtering
  | 'filter-review'         // after filtering, before amounts
  | 'amount-review'         // after amounts assigned, before wallet
  | 'batch-preview'         // before sending each batch
  | 'batch-result'          // after each batch completes
  | 'stuck-transaction'     // transaction pending too long
  | 'validation-error'      // validation found errors
  | 'validation-warning';   // validation found warnings

type InterventionContext = {
  readonly point: InterventionPoint;
  readonly campaignId: string;
  readonly batchIndex?: number;
  readonly addresses?: readonly Address[];
  readonly amounts?: readonly bigint[];
  readonly issues?: readonly ValidationIssue[];
  readonly txHash?: Hex;
  readonly metadata?: Record<string, unknown>;
};
```

### InterventionAction

What the user decides to do:

```typescript
type InterventionAction =
  | { readonly type: 'approve' }
  | { readonly type: 'skip'; readonly addresses: readonly Address[] }
  | { readonly type: 'add'; readonly addresses: readonly Address[] }
  | { readonly type: 'remove'; readonly addresses: readonly Address[] }
  | { readonly type: 'adjustAmounts'; readonly adjustments: readonly { address: Address; newAmount: bigint }[] }
  | { readonly type: 'replaceAll'; readonly addresses: readonly Address[]; readonly amounts?: readonly bigint[] }
  | { readonly type: 'pause' }
  | { readonly type: 'abort' }
  | { readonly type: 'retry' }
  | { readonly type: 'bumpGas' }
  | { readonly type: 'overrideWarnings' };
```

### InterventionHook

```typescript
type InterventionHook = (
  context: InterventionContext,
) => Promise<InterventionAction>;
```

### InterventionConfig

Passed to distributor/pipeline functions to enable interventions:

```typescript
type InterventionConfig = {
  readonly onIntervention?: InterventionHook;
  readonly reviewBeforeEachBatch?: boolean;      // default false — pause before every batch
  readonly autoApproveClean?: boolean;            // default true — skip hook if no issues
  readonly stuckTransactionTimeout?: number;      // ms before flagging a pending tx, default 120_000
};
```

### Where Hooks Fire

| Point | Trigger | Required? |
|-------|---------|-----------|
| `validation-error` | Validation returns errors | Always — cannot skip |
| `validation-warning` | Validation returns warnings | Always — must acknowledge |
| `address-review` | After address collection | If `onIntervention` is set |
| `filter-review` | After filtering | If `onIntervention` is set |
| `amount-review` | After amounts assignment | If `onIntervention` is set |
| `batch-preview` | Before each batch send | If `reviewBeforeEachBatch` is true |
| `batch-result` | After each batch completes | If batch had issues (failed, reverted) |
| `stuck-transaction` | Tx pending longer than `stuckTransactionTimeout` | Always — system must handle |

When `autoApproveClean` is true (default), the hook only fires if there are issues. Clean data flows through without interruption.

## SDK: Intervention Journal

### InterventionEntry

Every intervention decision is logged:

```typescript
type InterventionEntry = {
  readonly timestamp: number;
  readonly campaignId: string;
  readonly point: InterventionPoint;
  readonly action: InterventionAction;
  readonly issueCount: { errors: number; warnings: number; info: number };
  readonly metadata?: Record<string, unknown>;
};
```

### InterventionJournal

Interface for logging — the TUI implements with files, web app with IDB:

```typescript
type InterventionJournal = {
  append(entry: InterventionEntry): Promise<void>;
  getEntries(campaignId: string): Promise<readonly InterventionEntry[]>;
};
```

## TUI: File-Based Implementation

### Directory Structure

```
{storage-dir}/{campaign-slug}/
  interventions/
    journal.jsonl                    # chronological decision log
    address-review.csv               # addresses for user review
    filter-review.csv                # filtered addresses for review
    amount-review.csv                # address+amount pairs for review
    batch-{NNN}-preview.csv          # batch preview before send
    batch-{NNN}-result.json          # batch result after send
```

### Review File Format

CSV with validation annotations as comments:

```csv
# REVIEW REQUIRED — 2 errors, 1 warning
# Fix or remove error rows. Acknowledge warnings to continue.
# Save this file and press Enter in the terminal.
#
# status | address | amount | issue
ok,0x1234567890abcdef1234567890abcdef12345678,1000000,
error,0xGGGG567890abcdef1234567890abcdef12345678,,non-hex character at position 2
ok,0xabcdef1234567890abcdef1234567890abcdef12,1000000,
warning,0x1234567890abcdef1234567890abcdef12345678,2000000,duplicate address with different amount
```

### TUI Flow

1. **Data arrives** at an intervention point
2. **Validate** using SDK validation functions
3. **If clean and `autoApproveClean`**: auto-approve, log to journal, continue
4. **If issues**: write review CSV to interventions directory
5. **Prompt user**: "Review file written to `interventions/address-review.csv`. Edit and press Enter, or type 'skip'/'abort'."
6. **User edits** the file in their editor (removes bad rows, fixes amounts)
7. **Read back** the edited file
8. **Re-validate** the edited data
9. **Loop** until clean (errors resolved) or user types 'override' for warnings
10. **Log** the decision (what changed, what was approved) to journal.jsonl
11. **Continue** pipeline with the validated data

### Stuck Transaction Handling

When a transaction is pending longer than `stuckTransactionTimeout`:

1. Write `batch-{NNN}-stuck.json` with tx hash, current gas params, time elapsed
2. Prompt: "Transaction 0xabc... pending for 2m. [b]ump gas / [w]ait / [a]bort?"
3. **Bump**: fire replacement tx with 112% fee bump (same pattern as hex-airdrop)
4. **Wait**: extend timeout, check again later
5. **Abort**: mark batch as dropped, move to next

### Journal Format (JSONL)

Each line is a JSON object:

```jsonl
{"timestamp":1711929600,"campaignId":"march-hex","point":"address-review","action":{"type":"remove","addresses":["0xbad..."]},"issueCount":{"errors":1,"warnings":0,"info":2}}
{"timestamp":1711929660,"campaignId":"march-hex","point":"batch-preview","action":{"type":"approve"},"issueCount":{"errors":0,"warnings":0,"info":0}}
{"timestamp":1711929720,"campaignId":"march-hex","point":"stuck-transaction","action":{"type":"bumpGas"},"issueCount":{"errors":0,"warnings":0,"info":0},"metadata":{"txHash":"0xabc...","bumpedFrom":"30gwei","bumpedTo":"33.6gwei"}}
```

## Integration Points

### Pipeline

The pipeline's `execute()` function gains an optional `InterventionConfig`. When set:
- After sources complete → `address-review` hook
- After each filter → `filter-review` hook (with before/after counts)
- Validation runs automatically at each point

### Distributor

`disperseTokens` and `disperseTokensSimple` gain `InterventionConfig`. When set:
- Before each batch → `batch-preview` hook (if `reviewBeforeEachBatch`)
- After each batch → `batch-result` hook (if batch failed)
- Pending tx timeout → `stuck-transaction` hook
- Validation runs on batch recipients before sending

### Interactive Wizard

The TUI wizard's distribute step integrates the file-based intervention implementation. The wizard creates the interventions directory and passes the hook to the SDK functions.

## Updated Types in SDK

Add to `packages/sdk/src/types.ts`:

```typescript
export type ValidationSeverity = 'error' | 'warning' | 'info';
```

Update `DisperseParams` and `DisperseSimpleParams`:

```typescript
readonly interventionConfig?: InterventionConfig;
```

## Testing Strategy

### Validation Tests (unit, no mocks needed)
- `validateAddresses`: valid, invalid hex, wrong length, missing prefix, checksum mismatch, duplicates
- `validateAmounts`: valid, negative, zero, large threshold
- `validateBatch`: combined address + amount validation
- `hasErrors`, `hasWarnings`, `filterBySeverity`: helper coverage

### Intervention Hook Tests (unit, mock hook)
- Hook fires on errors, fires on warnings, skips on clean (autoApproveClean)
- Each action type processed correctly (approve, skip, remove, add, adjustAmounts)
- Abort stops pipeline
- Pause and resume

### TUI File Tests (integration)
- Review file written with correct format
- Edited file read back and re-validated
- Journal entries appended correctly
- Stuck transaction prompt flow

### Journal Tests (unit)
- Append and retrieve entries
- Filter by campaign ID
- JSONL format roundtrip
