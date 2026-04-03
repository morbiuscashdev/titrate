# Human Interventions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add validation gates, human intervention hooks, spot checks with explorer links, and file-based review to the distribution pipeline — enabling the airdrop runner to inspect, edit, and approve data at every stage.

**Architecture:** Three layers built bottom-up. First, a pure validation module in the SDK (`packages/sdk/src/validation/`) classifying issues by severity (error=stop, warning=pause, info=log). Second, intervention types, spot check sampling, and journal interface in the SDK (`packages/sdk/src/intervention/`). Third, TUI file-based implementation (`packages/tui/src/intervention/`) — review CSV writer/reader, JSONL journal, spot check terminal display, and an orchestrating intervention handler. The SDK functions gain an optional `InterventionConfig` parameter.

**Tech Stack:** TypeScript, Viem (Address/getAddress), Vitest, @clack/prompts (TUI), Node.js fs

---

## File Structure

### New SDK files (`packages/sdk/src/validation/`)

| File | Responsibility |
|------|----------------|
| `types.ts` | `ValidationIssue`, `ValidationSeverity`, issue code constants |
| `addresses.ts` | `validateAddresses` — hex, length, prefix, checksum, duplicates |
| `amounts.ts` | `validateAmounts` — negative, zero, large threshold |
| `batch.ts` | `validateBatch` — combined address + amount pre-send check |
| `helpers.ts` | `hasErrors`, `hasWarnings`, `filterBySeverity` |
| `index.ts` | Barrel exports |

### New SDK files (`packages/sdk/src/intervention/`)

| File | Responsibility |
|------|----------------|
| `types.ts` | `InterventionPoint`, `InterventionContext`, `InterventionAction`, `InterventionConfig`, `InterventionEntry`, `InterventionJournal`, `SpotCheckSample`, `SpotCheckResult` |
| `spot-check.ts` | `createSpotCheck` — Fisher-Yates random sampling with explorer links |
| `index.ts` | Barrel exports |

### New TUI files (`packages/tui/src/intervention/`)

| File | Responsibility |
|------|----------------|
| `review-file.ts` | Write/read review CSVs with validation annotations |
| `journal.ts` | File-based JSONL `InterventionJournal` implementation |
| `spot-check-display.ts` | Render spot check box in terminal, prompt for action |
| `intervention-handler.ts` | Full `InterventionHook` implementation — orchestrates validation, spot check, file review, prompts |
| `index.ts` | Barrel exports |

### New test files

| File | Covers |
|------|--------|
| `packages/sdk/src/__tests__/validation/addresses.test.ts` | Address validation |
| `packages/sdk/src/__tests__/validation/amounts.test.ts` | Amount validation |
| `packages/sdk/src/__tests__/validation/batch.test.ts` | Batch validation |
| `packages/sdk/src/__tests__/validation/helpers.test.ts` | Helper utilities |
| `packages/sdk/src/__tests__/intervention/spot-check.test.ts` | Spot check sampling |
| `packages/tui/src/__tests__/intervention/review-file.test.ts` | CSV review file write/read |
| `packages/tui/src/__tests__/intervention/journal.test.ts` | JSONL journal |

### Modified files

| File | Change |
|------|--------|
| `packages/sdk/src/index.ts` | Add validation + intervention exports |
| `packages/sdk/src/distributor/disperse.ts` | Add `interventionConfig` to params |
| `packages/sdk/src/distributor/index.ts` | Export `InterventionConfig` |

---

### Task 1: Validation types + address validation

**Files:**
- Create: `packages/sdk/src/validation/types.ts`
- Create: `packages/sdk/src/validation/addresses.ts`
- Create: `packages/sdk/src/__tests__/validation/addresses.test.ts`

- [ ] **Step 1: Create validation types**

```typescript
// packages/sdk/src/validation/types.ts

export type ValidationSeverity = 'error' | 'warning' | 'info';

export type ValidationIssue = {
  readonly severity: ValidationSeverity;
  readonly row: number;
  readonly field: string;
  readonly value: string;
  readonly message: string;
  readonly code: string;
};

export const INVALID_HEX = 'INVALID_HEX';
export const INVALID_LENGTH = 'INVALID_LENGTH';
export const INVALID_PREFIX = 'INVALID_PREFIX';
export const NEGATIVE_AMOUNT = 'NEGATIVE_AMOUNT';
export const INVALID_AMOUNT = 'INVALID_AMOUNT';
export const CHECKSUM_MISMATCH = 'CHECKSUM_MISMATCH';
export const DUPLICATE_ADDRESS = 'DUPLICATE_ADDRESS';
export const DUPLICATE_DIFF_AMOUNT = 'DUPLICATE_DIFF_AMOUNT';
export const ZERO_AMOUNT = 'ZERO_AMOUNT';
export const LARGE_AMOUNT = 'LARGE_AMOUNT';
export const DEDUP_COUNT = 'DEDUP_COUNT';
export const FILTER_COUNT = 'FILTER_COUNT';
export const LENGTH_MISMATCH = 'LENGTH_MISMATCH';
```

- [ ] **Step 2: Write failing address validation tests**

```typescript
// packages/sdk/src/__tests__/validation/addresses.test.ts
import { describe, it, expect } from 'vitest';
import { validateAddresses } from '../../validation/addresses.js';
import { INVALID_HEX, INVALID_LENGTH, INVALID_PREFIX, DUPLICATE_ADDRESS } from '../../validation/types.js';

describe('validateAddresses', () => {
  it('returns no issues for valid lowercase addresses', () => {
    const issues = validateAddresses([
      '0x1234567890abcdef1234567890abcdef12345678',
      '0xabcdef1234567890abcdef1234567890abcdef12',
    ]);
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('detects non-hex characters', () => {
    const issues = validateAddresses(['0xGGGG567890abcdef1234567890abcdef12345678']);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe(INVALID_HEX);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].row).toBe(0);
  });

  it('detects wrong length', () => {
    const issues = validateAddresses(['0x1234']);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe(INVALID_LENGTH);
  });

  it('detects missing 0x prefix', () => {
    const issues = validateAddresses(['1234567890abcdef1234567890abcdef12345678ab']);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe(INVALID_PREFIX);
  });

  it('detects duplicate addresses as warning', () => {
    const issues = validateAddresses([
      '0x1234567890abcdef1234567890abcdef12345678',
      '0x1234567890abcdef1234567890abcdef12345678',
    ]);
    const dupes = issues.filter((i) => i.code === DUPLICATE_ADDRESS);
    expect(dupes).toHaveLength(1);
    expect(dupes[0].severity).toBe('warning');
    expect(dupes[0].row).toBe(1);
  });

  it('detects duplicates case-insensitively', () => {
    const issues = validateAddresses([
      '0x1234567890abcdef1234567890abcdef12345678',
      '0x1234567890ABCDEF1234567890ABCDEF12345678',
    ]);
    expect(issues.filter((i) => i.code === DUPLICATE_ADDRESS)).toHaveLength(1);
  });

  it('returns errors before warnings', () => {
    const issues = validateAddresses([
      '0x1234567890abcdef1234567890abcdef12345678',
      '0xGGGG',
      '0x1234567890abcdef1234567890abcdef12345678',
    ]);
    const errorIdx = issues.findIndex((i) => i.severity === 'error');
    const warnIdx = issues.findIndex((i) => i.severity === 'warning');
    if (errorIdx >= 0 && warnIdx >= 0) expect(errorIdx).toBeLessThan(warnIdx);
  });

  it('handles empty array', () => {
    expect(validateAddresses([])).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run src/__tests__/validation/addresses.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement address validation**

```typescript
// packages/sdk/src/validation/addresses.ts
import { getAddress } from 'viem';
import type { ValidationIssue } from './types.js';
import { INVALID_HEX, INVALID_LENGTH, INVALID_PREFIX, CHECKSUM_MISMATCH, DUPLICATE_ADDRESS } from './types.js';

const HEX_CHARS = /^0x[0-9a-fA-F]{40}$/;

export function validateAddresses(addresses: readonly string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Map<string, number>();

  for (let i = 0; i < addresses.length; i++) {
    const addr = addresses[i];

    if (!addr.startsWith('0x')) {
      issues.push({ severity: 'error', row: i, field: 'address', value: addr, message: 'Missing 0x prefix', code: INVALID_PREFIX });
      continue;
    }
    if (addr.length !== 42) {
      issues.push({ severity: 'error', row: i, field: 'address', value: addr, message: `Address must be 42 characters (got ${addr.length})`, code: INVALID_LENGTH });
      continue;
    }
    if (!HEX_CHARS.test(addr)) {
      issues.push({ severity: 'error', row: i, field: 'address', value: addr, message: 'Contains non-hex characters', code: INVALID_HEX });
      continue;
    }

    if (addr !== addr.toLowerCase() && addr !== addr.toUpperCase()) {
      try {
        const checksummed = getAddress(addr);
        if (checksummed !== addr) {
          issues.push({ severity: 'warning', row: i, field: 'address', value: addr, message: `Checksum mismatch (expected ${checksummed})`, code: CHECKSUM_MISMATCH });
        }
      } catch { /* already validated by hex check */ }
    }

    const lower = addr.toLowerCase();
    const firstSeen = seen.get(lower);
    if (firstSeen !== undefined) {
      issues.push({ severity: 'warning', row: i, field: 'address', value: addr, message: `Duplicate of row ${firstSeen}`, code: DUPLICATE_ADDRESS });
    } else {
      seen.set(lower, i);
    }
  }

  issues.sort((a, b) => {
    const order = { error: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });
  return issues;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run src/__tests__/validation/addresses.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/validation/types.ts packages/sdk/src/validation/addresses.ts \
  packages/sdk/src/__tests__/validation/addresses.test.ts
git commit -m "feat(sdk): add validation types and address validation"
```

---

### Task 2: Amount validation + batch validation + helpers + barrel

**Files:**
- Create: `packages/sdk/src/validation/amounts.ts`
- Create: `packages/sdk/src/validation/batch.ts`
- Create: `packages/sdk/src/validation/helpers.ts`
- Create: `packages/sdk/src/validation/index.ts`
- Create: `packages/sdk/src/__tests__/validation/amounts.test.ts`
- Create: `packages/sdk/src/__tests__/validation/batch.test.ts`
- Create: `packages/sdk/src/__tests__/validation/helpers.test.ts`

- [ ] **Step 1: Write all failing tests**

Create `amounts.test.ts`:
```typescript
// packages/sdk/src/__tests__/validation/amounts.test.ts
import { describe, it, expect } from 'vitest';
import { validateAmounts } from '../../validation/amounts.js';
import { NEGATIVE_AMOUNT, ZERO_AMOUNT, LARGE_AMOUNT } from '../../validation/types.js';

describe('validateAmounts', () => {
  it('returns no issues for valid positive amounts', () => {
    expect(validateAmounts([1000n, 2000n]).filter((i) => i.severity === 'error')).toHaveLength(0);
  });
  it('detects negative amounts as error', () => {
    const issues = validateAmounts([1000n, -500n]);
    expect(issues[0]).toMatchObject({ code: NEGATIVE_AMOUNT, severity: 'error', row: 1 });
  });
  it('detects zero amounts as warning', () => {
    const issues = validateAmounts([0n]);
    expect(issues[0]).toMatchObject({ code: ZERO_AMOUNT, severity: 'warning' });
  });
  it('detects large amounts when threshold set', () => {
    const issues = validateAmounts([1_000_001n], { largeAmountThreshold: 1_000_000n });
    expect(issues.some((i) => i.code === LARGE_AMOUNT)).toBe(true);
  });
  it('handles empty array', () => {
    expect(validateAmounts([])).toEqual([]);
  });
});
```

Create `batch.test.ts`:
```typescript
// packages/sdk/src/__tests__/validation/batch.test.ts
import { describe, it, expect } from 'vitest';
import type { Address } from 'viem';
import { validateBatch } from '../../validation/batch.js';

describe('validateBatch', () => {
  it('returns no issues for valid batch', () => {
    const r = ['0x1234567890abcdef1234567890abcdef12345678' as Address];
    expect(validateBatch(r, [1000n]).filter((i) => i.severity === 'error')).toHaveLength(0);
  });
  it('catches address errors', () => {
    expect(validateBatch(['0xGGGG' as Address], [1000n]).some((i) => i.severity === 'error')).toBe(true);
  });
  it('catches amount errors', () => {
    const r = ['0x1234567890abcdef1234567890abcdef12345678' as Address];
    expect(validateBatch(r, [-500n]).some((i) => i.severity === 'error')).toBe(true);
  });
  it('catches length mismatch', () => {
    const r = ['0x1234567890abcdef1234567890abcdef12345678' as Address, '0xabcdef1234567890abcdef1234567890abcdef12' as Address];
    expect(validateBatch(r, [1000n]).some((i) => i.code === 'LENGTH_MISMATCH')).toBe(true);
  });
});
```

Create `helpers.test.ts`:
```typescript
// packages/sdk/src/__tests__/validation/helpers.test.ts
import { describe, it, expect } from 'vitest';
import { hasErrors, hasWarnings, filterBySeverity } from '../../validation/helpers.js';
import type { ValidationIssue } from '../../validation/types.js';

const issues: ValidationIssue[] = [
  { severity: 'error', row: 0, field: 'address', value: 'x', message: 'bad', code: 'INVALID_HEX' },
  { severity: 'warning', row: 1, field: 'address', value: 'x', message: 'dup', code: 'DUPLICATE_ADDRESS' },
  { severity: 'info', row: -1, field: 'address', value: '', message: 'count', code: 'DEDUP_COUNT' },
];

describe('hasErrors', () => {
  it('returns true when errors present', () => { expect(hasErrors(issues)).toBe(true); });
  it('returns false when no errors', () => { expect(hasErrors(issues.filter((i) => i.severity !== 'error'))).toBe(false); });
  it('returns false for empty', () => { expect(hasErrors([])).toBe(false); });
});

describe('hasWarnings', () => {
  it('returns true when warnings present', () => { expect(hasWarnings(issues)).toBe(true); });
  it('returns false when no warnings', () => { expect(hasWarnings(issues.filter((i) => i.severity !== 'warning'))).toBe(false); });
});

describe('filterBySeverity', () => {
  it('filters errors', () => { expect(filterBySeverity(issues, 'error')).toHaveLength(1); });
  it('filters warnings', () => { expect(filterBySeverity(issues, 'warning')).toHaveLength(1); });
  it('returns empty for no matches', () => { expect(filterBySeverity([], 'error')).toEqual([]); });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run src/__tests__/validation/`
Expected: FAIL

- [ ] **Step 3: Implement amounts, batch, helpers, barrel**

Create `amounts.ts`:
```typescript
// packages/sdk/src/validation/amounts.ts
import type { ValidationIssue } from './types.js';
import { NEGATIVE_AMOUNT, ZERO_AMOUNT, LARGE_AMOUNT } from './types.js';

export function validateAmounts(
  amounts: readonly bigint[],
  options?: { largeAmountThreshold?: bigint },
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (let i = 0; i < amounts.length; i++) {
    const a = amounts[i];
    if (a < 0n) { issues.push({ severity: 'error', row: i, field: 'amount', value: a.toString(), message: 'Amount is negative', code: NEGATIVE_AMOUNT }); continue; }
    if (a === 0n) { issues.push({ severity: 'warning', row: i, field: 'amount', value: '0', message: 'Amount is zero', code: ZERO_AMOUNT }); }
    if (options?.largeAmountThreshold && a > options.largeAmountThreshold) {
      issues.push({ severity: 'warning', row: i, field: 'amount', value: a.toString(), message: `Amount exceeds threshold (${options.largeAmountThreshold})`, code: LARGE_AMOUNT });
    }
  }
  issues.sort((a, b) => ({ error: 0, warning: 1, info: 2 })[a.severity] - ({ error: 0, warning: 1, info: 2 })[b.severity]);
  return issues;
}
```

Create `batch.ts`:
```typescript
// packages/sdk/src/validation/batch.ts
import type { Address } from 'viem';
import type { ValidationIssue } from './types.js';
import { LENGTH_MISMATCH } from './types.js';
import { validateAddresses } from './addresses.js';
import { validateAmounts } from './amounts.js';

export function validateBatch(recipients: readonly Address[], amounts: readonly bigint[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (recipients.length !== amounts.length) {
    issues.push({ severity: 'error', row: -1, field: 'batch', value: `${recipients.length}/${amounts.length}`, message: 'Recipient count does not match amount count', code: LENGTH_MISMATCH });
  }
  issues.push(...validateAddresses(recipients), ...validateAmounts(amounts));
  issues.sort((a, b) => ({ error: 0, warning: 1, info: 2 })[a.severity] - ({ error: 0, warning: 1, info: 2 })[b.severity]);
  return issues;
}
```

Create `helpers.ts`:
```typescript
// packages/sdk/src/validation/helpers.ts
import type { ValidationIssue, ValidationSeverity } from './types.js';

export function hasErrors(issues: readonly ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}
export function hasWarnings(issues: readonly ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === 'warning');
}
export function filterBySeverity(issues: readonly ValidationIssue[], severity: ValidationSeverity): ValidationIssue[] {
  return issues.filter((i) => i.severity === severity);
}
```

Create `index.ts`:
```typescript
// packages/sdk/src/validation/index.ts
export type { ValidationIssue, ValidationSeverity } from './types.js';
export { INVALID_HEX, INVALID_LENGTH, INVALID_PREFIX, NEGATIVE_AMOUNT, INVALID_AMOUNT, CHECKSUM_MISMATCH, DUPLICATE_ADDRESS, DUPLICATE_DIFF_AMOUNT, ZERO_AMOUNT, LARGE_AMOUNT, DEDUP_COUNT, FILTER_COUNT, LENGTH_MISMATCH } from './types.js';
export { validateAddresses } from './addresses.js';
export { validateAmounts } from './amounts.js';
export { validateBatch } from './batch.js';
export { hasErrors, hasWarnings, filterBySeverity } from './helpers.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run src/__tests__/validation/`
Expected: PASS — all tests

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/validation/ packages/sdk/src/__tests__/validation/
git commit -m "feat(sdk): add amount, batch validation and helper utilities"
```

---

### Task 3: Intervention types + spot check

**Files:**
- Create: `packages/sdk/src/intervention/types.ts`
- Create: `packages/sdk/src/intervention/spot-check.ts`
- Create: `packages/sdk/src/intervention/index.ts`
- Create: `packages/sdk/src/__tests__/intervention/spot-check.test.ts`

- [ ] **Step 1: Create intervention types**

Full types file as specified in the spec: `InterventionPoint`, `InterventionContext`, `InterventionAction` (with all 13 variants including `reroll` and `fullReview`), `InterventionHook`, `InterventionConfig` (with `spotCheckSampleSize`), `InterventionEntry`, `InterventionJournal`, `SpotCheckSample`, `SpotCheckResult`.

See the spec for the complete type definitions — copy them verbatim from the spec's "SDK: Intervention Hooks" and "Spot Checks" sections into `packages/sdk/src/intervention/types.ts`.

- [ ] **Step 2: Write failing spot check tests**

```typescript
// packages/sdk/src/__tests__/intervention/spot-check.test.ts
import { describe, it, expect } from 'vitest';
import type { Address } from 'viem';
import { createSpotCheck } from '../../intervention/spot-check.js';

const addresses = Array.from({ length: 100 }, (_, i) => `0x${i.toString(16).padStart(40, '0')}` as Address);

describe('createSpotCheck', () => {
  it('returns requested sample count', () => {
    const r = createSpotCheck(addresses, 'https://etherscan.io', { sampleSize: 5 });
    expect(r.samples).toHaveLength(5);
    expect(r.totalCount).toBe(100);
  });
  it('defaults to 5 samples', () => {
    expect(createSpotCheck(addresses, 'https://etherscan.io').samples).toHaveLength(5);
  });
  it('includes explorer URLs', () => {
    const r = createSpotCheck(addresses, 'https://etherscan.io', { sampleSize: 1 });
    expect(r.samples[0].explorerUrl).toContain('https://etherscan.io/address/');
  });
  it('includes amounts when provided', () => {
    const amounts = addresses.map((_, i) => BigInt(i * 1000));
    const r = createSpotCheck(addresses, 'https://etherscan.io', { sampleSize: 3, amounts });
    for (const s of r.samples) expect(s.amount).toBeDefined();
  });
  it('produces deterministic results with seed', () => {
    const r1 = createSpotCheck(addresses, 'https://etherscan.io', { sampleSize: 3, seed: 42 });
    const r2 = createSpotCheck(addresses, 'https://etherscan.io', { sampleSize: 3, seed: 42 });
    expect(r1.samples.map((s) => s.index)).toEqual(r2.samples.map((s) => s.index));
  });
  it('produces different results with different seeds', () => {
    const r1 = createSpotCheck(addresses, 'https://etherscan.io', { sampleSize: 5, seed: 1 });
    const r2 = createSpotCheck(addresses, 'https://etherscan.io', { sampleSize: 5, seed: 2 });
    expect(r1.samples.map((s) => s.index)).not.toEqual(r2.samples.map((s) => s.index));
  });
  it('handles sampleSize larger than array', () => {
    expect(createSpotCheck(addresses.slice(0, 3), 'https://etherscan.io', { sampleSize: 10 }).samples).toHaveLength(3);
  });
  it('handles empty array', () => {
    const r = createSpotCheck([], 'https://etherscan.io');
    expect(r.samples).toHaveLength(0);
    expect(r.totalCount).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run src/__tests__/intervention/spot-check.test.ts`
Expected: FAIL

- [ ] **Step 4: Implement spot check with Fisher-Yates + seeded PRNG**

```typescript
// packages/sdk/src/intervention/spot-check.ts
import type { Address } from 'viem';
import type { SpotCheckResult, SpotCheckSample } from './types.js';

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSpotCheck(
  addresses: readonly Address[],
  explorerUrl: string,
  options?: { sampleSize?: number; amounts?: readonly bigint[]; seed?: number },
): SpotCheckResult {
  const sampleSize = Math.min(options?.sampleSize ?? 5, addresses.length);
  if (addresses.length === 0) return { samples: [], totalCount: 0, sampleSize: 0 };

  const random = options?.seed !== undefined ? mulberry32(options.seed) : () => Math.random();
  const indices = Array.from({ length: addresses.length }, (_, i) => i);
  for (let i = 0; i < sampleSize; i++) {
    const j = i + Math.floor(random() * (indices.length - i));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const baseUrl = explorerUrl.endsWith('/') ? explorerUrl.slice(0, -1) : explorerUrl;
  const samples: SpotCheckSample[] = indices.slice(0, sampleSize).map((idx) => ({
    index: idx,
    address: addresses[idx],
    amount: options?.amounts?.[idx],
    explorerUrl: `${baseUrl}/address/${addresses[idx]}`,
  }));

  return { samples, totalCount: addresses.length, sampleSize };
}
```

Create barrel:
```typescript
// packages/sdk/src/intervention/index.ts
export type { InterventionPoint, InterventionContext, InterventionAction, InterventionHook, InterventionConfig, InterventionEntry, InterventionJournal, SpotCheckSample, SpotCheckResult } from './types.js';
export { createSpotCheck } from './spot-check.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run src/__tests__/intervention/spot-check.test.ts`
Expected: PASS — all 8 tests

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/intervention/ packages/sdk/src/__tests__/intervention/
git commit -m "feat(sdk): add intervention types and spot check sampling"
```

---

### Task 4: SDK barrel exports + disperse integration

**Files:**
- Modify: `packages/sdk/src/index.ts`
- Modify: `packages/sdk/src/distributor/disperse.ts`
- Modify: `packages/sdk/src/distributor/index.ts`

- [ ] **Step 1: Add validation + intervention exports to SDK barrel**

Add to `packages/sdk/src/index.ts`:

```typescript
// Validation
export { validateAddresses as validateAddressSet, validateAmounts as validateAmountSet, validateBatch, hasErrors, hasWarnings, filterBySeverity } from './validation/index.js';
export { INVALID_HEX, INVALID_LENGTH, INVALID_PREFIX, NEGATIVE_AMOUNT, INVALID_AMOUNT, CHECKSUM_MISMATCH, DUPLICATE_ADDRESS, DUPLICATE_DIFF_AMOUNT, ZERO_AMOUNT, LARGE_AMOUNT, DEDUP_COUNT, FILTER_COUNT, LENGTH_MISMATCH } from './validation/index.js';
export type { ValidationIssue, ValidationSeverity } from './validation/index.js';

// Intervention
export { createSpotCheck } from './intervention/index.js';
export type { InterventionPoint, InterventionContext, InterventionAction, InterventionHook, InterventionConfig, InterventionEntry, InterventionJournal, SpotCheckSample, SpotCheckResult } from './intervention/index.js';
```

- [ ] **Step 2: Add interventionConfig to DisperseParams**

In `packages/sdk/src/distributor/disperse.ts`, add import and field:

```typescript
import type { InterventionConfig } from '../intervention/types.js';
```

Add `readonly interventionConfig?: InterventionConfig;` to both `DisperseParams` and `DisperseSimpleParams`.

- [ ] **Step 3: Export InterventionConfig from distributor barrel**

In `packages/sdk/src/distributor/index.ts`, add re-export if needed so the TUI can import it.

- [ ] **Step 4: Build + test**

Run: `cd packages/sdk && npx tsc --noEmit && npx vitest run`
Expected: Clean build, all tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/index.ts packages/sdk/src/distributor/disperse.ts packages/sdk/src/distributor/index.ts
git commit -m "feat(sdk): export validation and intervention, wire interventionConfig into disperse"
```

---

### Task 5: TUI review file writer/reader

**Files:**
- Create: `packages/tui/src/intervention/review-file.ts`
- Create: `packages/tui/src/__tests__/intervention/review-file.test.ts`

- [ ] **Step 1: Write failing tests**

Tests covering: write CSV with addresses + issues, include amounts, read back addresses, handle user-deleted rows, skip comments. Use `mkdtemp` for temp directories.

See the full test code in the plan spec. Create tests that write a review file, read it back, simulate user edits by modifying the file content, and verify the round-trip.

- [ ] **Step 2: Implement review-file.ts**

`writeReviewFile(filePath, addresses, issues, amounts?)` — writes annotated CSV with `# REVIEW REQUIRED` header, status/address/amount/issue columns.

`readReviewFile(filePath)` — reads CSV back, skips `#` comments and empty lines, parses addresses from column 2, optional amounts from column 3.

- [ ] **Step 3: Run tests, commit**

Run: `cd packages/tui && npx vitest run src/__tests__/intervention/review-file.test.ts`

```bash
git add packages/tui/src/intervention/review-file.ts packages/tui/src/__tests__/intervention/review-file.test.ts
git commit -m "feat(tui): add review file writer/reader for human interventions"
```

---

### Task 6: TUI journal (JSONL)

**Files:**
- Create: `packages/tui/src/intervention/journal.ts`
- Create: `packages/tui/src/__tests__/intervention/journal.test.ts`

- [ ] **Step 1: Write failing tests**

Tests covering: append and retrieve, filter by campaignId, create file on first append, empty result for non-existent campaign. Use `mkdtemp` for temp directories.

- [ ] **Step 2: Implement createFileJournal**

`createFileJournal(filePath)` returns `InterventionJournal` — `append` uses `appendFile` (JSONL), `getEntries` reads + parses + filters by campaignId.

- [ ] **Step 3: Run tests, commit**

Run: `cd packages/tui && npx vitest run src/__tests__/intervention/journal.test.ts`

```bash
git add packages/tui/src/intervention/journal.ts packages/tui/src/__tests__/intervention/journal.test.ts
git commit -m "feat(tui): add JSONL intervention journal"
```

---

### Task 7: TUI spot check display + intervention handler + barrel

**Files:**
- Create: `packages/tui/src/intervention/spot-check-display.ts`
- Create: `packages/tui/src/intervention/intervention-handler.ts`
- Create: `packages/tui/src/intervention/index.ts`

- [ ] **Step 1: Implement spot check display**

`displaySpotCheck(result, tokenSymbol?, tokenDecimals?)` — renders box with numbered samples + explorer URLs, prompts via `@clack/prompts` select for approve/reroll/fullReview/open/abort. Uses `execFile` (not `exec`) for opening URLs in browser to prevent command injection.

- [ ] **Step 2: Implement intervention handler**

`createInterventionHandler(options)` returns `InterventionHook`. Orchestrates:
- Validation errors/warnings → full file review
- Stuck transactions → bump/wait/abort prompt
- Failed batches → retry/skip/abort prompt
- Data review points → spot check first, escalate to full review
- All decisions logged to journal

- [ ] **Step 3: Create TUI intervention barrel**

Exports: `writeReviewFile`, `readReviewFile`, `createFileJournal`, `displaySpotCheck`, `createInterventionHandler`.

- [ ] **Step 4: Build TUI**

Run: `cd packages/tui && npx tsc --noEmit`
Expected: Clean

- [ ] **Step 5: Commit**

```bash
git add packages/tui/src/intervention/
git commit -m "feat(tui): add spot check display and intervention handler"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run all SDK tests**

Run: `cd packages/sdk && npx vitest run`

- [ ] **Step 2: Run all TUI tests**

Run: `cd packages/tui && npx vitest run`

- [ ] **Step 3: TypeScript check all packages**

Run: `cd packages/sdk && npx tsc --noEmit && cd ../tui && npx tsc --noEmit && cd ../web && npx tsc --noEmit`

- [ ] **Step 4: Run web tests**

Run: `cd packages/web && npx vitest run`

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve issues found during verification"
```
