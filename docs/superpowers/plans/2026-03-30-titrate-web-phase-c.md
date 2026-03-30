# Titrate Web App — Phase C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract shared business logic from TUI into SDK, add requirements/spend calculation, scaffold `packages/web`, and build a pure component library tested in isolation.

**Architecture:** SDK gains 8 new utility modules extracted from the TUI (amounts, slugify, token probe, block ref, resume, serialization) plus 2 new pure functions (requirements, spend report). The web package is scaffolded with Vite + React 19 + Tailwind v4 + Vitest. All 15 React components are pure — `(props) => JSX` with no hooks, state, or context. Each is colocated with a `.test.tsx` using React Testing Library.

**Tech Stack:** TypeScript, Viem, Vitest, React 19, Tailwind CSS v4, React Testing Library, jsdom

---

## File Structure

### SDK additions (`packages/sdk/src/`)

| File | Responsibility |
|------|----------------|
| `utils/amounts.ts` | `decimalToInteger`, `parseVariableAmounts` |
| `utils/campaign.ts` | `slugifyCampaignName` |
| `utils/token.ts` | `probeToken` (ERC-20 metadata via RPC) |
| `utils/blocks.ts` | `resolveBlockRef` (date or block number string → bigint) |
| `utils/resume.ts` | `computeResumeOffset`, `alignAmountsForResume` |
| `utils/serialize.ts` | `serializeBatchResults` |
| `utils/requirements.ts` | `computeRequirements` |
| `utils/spend.ts` | `aggregateSpendReport` |
| `index.ts` | Updated barrel exports |

### SDK tests (`packages/sdk/src/__tests__/`)

| File | Covers |
|------|--------|
| `amounts.test.ts` | Amount conversion and parsing |
| `campaign-utils.test.ts` | Slug generation |
| `token.test.ts` | Token probing with mocked client |
| `blocks-ref.test.ts` | Block ref resolution with mocked client |
| `resume.test.ts` | Resume offset and amount alignment |
| `serialize.test.ts` | Batch result serialization |
| `requirements.test.ts` | Distribution requirements calculation |
| `spend.test.ts` | Spend report aggregation |

### TUI modifications (`packages/tui/src/`)

| File | Change |
|------|--------|
| `interactive/steps/amounts.ts` | Remove `decimalToInteger`, `parseVariableAmounts`; import from SDK |
| `interactive/steps/distribute.ts` | Remove `slugifyCampaignName`; import from SDK. Use `computeResumeOffset`, `alignAmountsForResume` |
| `interactive/steps/campaign.ts` | Remove `probeToken`; import from SDK |
| `interactive/steps/addresses.ts` | Remove `resolveBlockRef`; import from SDK |
| `commands/distribute.ts` | Remove `serializeResults`; import `serializeBatchResults` from SDK |

### Web package (`packages/web/`)

| File | Responsibility |
|------|----------------|
| `package.json` | Dependencies |
| `tsconfig.json` | TypeScript config extending base |
| `vite.config.ts` | Vite + React + Tailwind |
| `vitest.config.ts` | Vitest with jsdom |
| `index.html` | Entry HTML |
| `src/main.tsx` | React root mount |
| `src/App.tsx` | Placeholder app shell |
| `src/index.css` | Tailwind import |
| `src/test-setup.ts` | RTL jest-dom matchers |

### Web components (`packages/web/src/components/`)

| File | Pure component |
|------|----------------|
| `StatusBadge.tsx` | Colored status pill |
| `ProgressRing.tsx` | SVG circular progress |
| `MemoryWarning.tsx` | Dismissable heap warning banner |
| `TimelineRail.tsx` | Vertical step indicators |
| `StepPanel.tsx` | Content area for active step |
| `AppShell.tsx` | Responsive layout wrapper |
| `CampaignCard.tsx` | Mission control tile |
| `AddressTable.tsx` | Paginated address list |
| `BatchStatusCard.tsx` | Single batch display |
| `BatchTimeline.tsx` | Vertical batch list |
| `SpendSummary.tsx` | Post-distribution report |
| `RequirementsPanel.tsx` | Pre-distribution checklist |
| `ChainSelector.tsx` | Chain dropdown |
| `AmountConfig.tsx` | Amount mode/format/value form |
| `WalletBadge.tsx` | Connected wallet display |
| `PipelineStepEditor.tsx` | Pipeline step config form |

Each component has a colocated `.test.tsx` file.

---

### Task 1: SDK — Amount utilities

**Files:**
- Create: `packages/sdk/src/utils/amounts.ts`
- Create: `packages/sdk/src/__tests__/amounts.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/sdk/src/__tests__/amounts.test.ts
import { describe, it, expect } from 'vitest';
import { decimalToInteger, parseVariableAmounts } from '../utils/amounts.js';

describe('decimalToInteger', () => {
  it('converts whole number with 18 decimals', () => {
    expect(decimalToInteger('1', 18)).toBe(1_000_000_000_000_000_000n);
  });

  it('converts decimal with 18 decimals', () => {
    expect(decimalToInteger('1.5', 18)).toBe(1_500_000_000_000_000_000n);
  });

  it('truncates excess decimal places', () => {
    expect(decimalToInteger('1.123456789', 6)).toBe(1_123_456n);
  });

  it('pads short fractional parts', () => {
    expect(decimalToInteger('1.1', 6)).toBe(1_100_000n);
  });

  it('handles zero', () => {
    expect(decimalToInteger('0', 18)).toBe(0n);
  });

  it('handles no fractional part', () => {
    expect(decimalToInteger('100', 8)).toBe(10_000_000_000n);
  });
});

describe('parseVariableAmounts', () => {
  it('parses integer format', () => {
    const result = parseVariableAmounts(['1000', '2000', '3000'], 'integer', 18);
    expect(result).toEqual([1000n, 2000n, 3000n]);
  });

  it('parses decimal format', () => {
    const result = parseVariableAmounts(['1.5', '2.0'], 'decimal', 18);
    expect(result).toEqual([1_500_000_000_000_000_000n, 2_000_000_000_000_000_000n]);
  });

  it('treats null as zero', () => {
    const result = parseVariableAmounts([null, '100', null], 'integer', 18);
    expect(result).toEqual([0n, 100n, 0n]);
  });

  it('handles empty array', () => {
    expect(parseVariableAmounts([], 'integer', 18)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run src/__tests__/amounts.test.ts`
Expected: FAIL — module `../utils/amounts.js` not found

- [ ] **Step 3: Implement the functions**

```typescript
// packages/sdk/src/utils/amounts.ts

/**
 * Converts a decimal string (e.g., "1.5") to a bigint with the given number of decimals.
 * Truncates excess decimal places; pads short fractional parts with zeros.
 */
export function decimalToInteger(decimalStr: string, decimals: number): bigint {
  const [wholePart, fracPart = ''] = decimalStr.split('.');
  const paddedFrac = fracPart.slice(0, decimals).padEnd(decimals, '0');
  return BigInt(wholePart) * 10n ** BigInt(decimals) + BigInt(paddedFrac || '0');
}

/**
 * Converts an array of raw amount strings (from CSV) to bigint[].
 * Null entries become 0n. Decimal strings are converted using the token's decimal count.
 */
export function parseVariableAmounts(
  rawAmounts: readonly (string | null)[],
  format: 'integer' | 'decimal',
  decimals: number,
): bigint[] {
  return rawAmounts.map((raw) => {
    if (!raw) return 0n;
    if (format === 'decimal') return decimalToInteger(raw, decimals);
    return BigInt(raw);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run src/__tests__/amounts.test.ts`
Expected: PASS — all 10 tests

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/utils/amounts.ts packages/sdk/src/__tests__/amounts.test.ts
git commit -m "feat(sdk): add amount conversion utilities"
```

---

### Task 2: SDK — Campaign slug + batch serialization

**Files:**
- Create: `packages/sdk/src/utils/campaign.ts`
- Create: `packages/sdk/src/utils/serialize.ts`
- Create: `packages/sdk/src/__tests__/campaign-utils.test.ts`
- Create: `packages/sdk/src/__tests__/serialize.test.ts`

- [ ] **Step 1: Write failing tests for slugifyCampaignName**

```typescript
// packages/sdk/src/__tests__/campaign-utils.test.ts
import { describe, it, expect } from 'vitest';
import { slugifyCampaignName } from '../utils/campaign.js';

describe('slugifyCampaignName', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugifyCampaignName('March HEX Airdrop')).toBe('march-hex-airdrop');
  });

  it('strips leading and trailing hyphens', () => {
    expect(slugifyCampaignName('--hello--')).toBe('hello');
  });

  it('collapses consecutive non-alphanumeric characters', () => {
    expect(slugifyCampaignName('hello!!!world')).toBe('hello-world');
  });

  it('truncates to 64 characters', () => {
    const long = 'a'.repeat(100);
    expect(slugifyCampaignName(long).length).toBe(64);
  });

  it('handles single word', () => {
    expect(slugifyCampaignName('test')).toBe('test');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run src/__tests__/campaign-utils.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement slugifyCampaignName**

```typescript
// packages/sdk/src/utils/campaign.ts

/**
 * Converts a campaign name to a deterministic URL-safe slug.
 * Lowercases, replaces non-alphanumeric runs with hyphens, trims edges, max 64 chars.
 */
export function slugifyCampaignName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run src/__tests__/campaign-utils.test.ts`
Expected: PASS — all 5 tests

- [ ] **Step 5: Write failing tests for serializeBatchResults**

```typescript
// packages/sdk/src/__tests__/serialize.test.ts
import { describe, it, expect } from 'vitest';
import type { BatchResult } from '../types.js';
import { serializeBatchResults } from '../utils/serialize.js';

describe('serializeBatchResults', () => {
  const batch: BatchResult = {
    batchIndex: 0,
    recipients: ['0xabc' as `0x${string}`],
    amounts: [1_000_000_000_000_000_000n],
    attempts: [
      {
        txHash: '0xdef' as `0x${string}`,
        nonce: 1,
        gasEstimate: 500_000n,
        maxFeePerGas: 30_000_000_000n,
        maxPriorityFeePerGas: 1_000_000_000n,
        timestamp: 1700000000,
        outcome: 'confirmed' as const,
      },
    ],
    confirmedTxHash: '0xdef' as `0x${string}`,
    blockNumber: 19_000_000n,
  };

  it('converts bigint amounts to strings', () => {
    const result = serializeBatchResults([batch]) as Record<string, unknown>[];
    expect((result[0] as Record<string, unknown>).amounts).toEqual(['1000000000000000000']);
  });

  it('converts blockNumber to string', () => {
    const result = serializeBatchResults([batch]) as Record<string, unknown>[];
    expect((result[0] as Record<string, unknown>).blockNumber).toBe('19000000');
  });

  it('converts attempt gas fields to strings', () => {
    const result = serializeBatchResults([batch]) as Record<string, unknown>[];
    const attempts = (result[0] as Record<string, unknown>).attempts as Record<string, unknown>[];
    expect(attempts[0].gasEstimate).toBe('500000');
    expect(attempts[0].maxFeePerGas).toBe('30000000000');
    expect(attempts[0].maxPriorityFeePerGas).toBe('1000000000');
  });

  it('handles null blockNumber', () => {
    const nullBlock = { ...batch, blockNumber: null };
    const result = serializeBatchResults([nullBlock]) as Record<string, unknown>[];
    expect((result[0] as Record<string, unknown>).blockNumber).toBeNull();
  });

  it('preserves non-bigint fields', () => {
    const result = serializeBatchResults([batch]) as Record<string, unknown>[];
    expect((result[0] as Record<string, unknown>).batchIndex).toBe(0);
    expect((result[0] as Record<string, unknown>).confirmedTxHash).toBe('0xdef');
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run src/__tests__/serialize.test.ts`
Expected: FAIL — module not found

- [ ] **Step 7: Implement serializeBatchResults**

```typescript
// packages/sdk/src/utils/serialize.ts
import type { BatchResult } from '../types.js';

/**
 * Converts BatchResult[] to a JSON-serializable format.
 * All bigint fields (amounts, blockNumber, gas values) become strings.
 */
export function serializeBatchResults(results: readonly BatchResult[]): unknown {
  return results.map((r) => ({
    ...r,
    amounts: r.amounts.map((a) => a.toString()),
    blockNumber: r.blockNumber !== null ? r.blockNumber.toString() : null,
    attempts: r.attempts.map((a) => ({
      ...a,
      gasEstimate: a.gasEstimate.toString(),
      maxFeePerGas: a.maxFeePerGas.toString(),
      maxPriorityFeePerGas: a.maxPriorityFeePerGas.toString(),
    })),
  }));
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run src/__tests__/serialize.test.ts`
Expected: PASS — all 5 tests

- [ ] **Step 9: Commit**

```bash
git add packages/sdk/src/utils/campaign.ts packages/sdk/src/utils/serialize.ts \
  packages/sdk/src/__tests__/campaign-utils.test.ts packages/sdk/src/__tests__/serialize.test.ts
git commit -m "feat(sdk): add campaign slug and batch serialization utilities"
```

---

### Task 3: SDK — Token probe + block ref resolution

**Files:**
- Create: `packages/sdk/src/utils/token.ts`
- Create: `packages/sdk/src/utils/blocks.ts`
- Create: `packages/sdk/src/__tests__/token.test.ts`
- Create: `packages/sdk/src/__tests__/blocks-ref.test.ts`

- [ ] **Step 1: Write failing tests for probeToken**

```typescript
// packages/sdk/src/__tests__/token.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { PublicClient } from 'viem';
import { probeToken } from '../utils/token.js';

function mockClient(responses: { name: string; symbol: string; decimals: number }): PublicClient {
  return {
    readContract: vi.fn().mockImplementation(({ functionName }: { functionName: string }) => {
      if (functionName === 'name') return Promise.resolve(responses.name);
      if (functionName === 'symbol') return Promise.resolve(responses.symbol);
      if (functionName === 'decimals') return Promise.resolve(responses.decimals);
      return Promise.reject(new Error('unknown function'));
    }),
  } as unknown as PublicClient;
}

describe('probeToken', () => {
  it('returns token metadata on success', async () => {
    const client = mockClient({ name: 'USD Coin', symbol: 'USDC', decimals: 6 });
    const result = await probeToken(client, '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`);
    expect(result).toEqual({ name: 'USD Coin', symbol: 'USDC', decimals: 6 });
  });

  it('returns null when contract calls fail', async () => {
    const client = {
      readContract: vi.fn().mockRejectedValue(new Error('not a contract')),
    } as unknown as PublicClient;
    const result = await probeToken(client, '0x0000000000000000000000000000000000000000' as `0x${string}`);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run src/__tests__/token.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement probeToken**

```typescript
// packages/sdk/src/utils/token.ts
import type { Address, PublicClient } from 'viem';

export type TokenMetadata = {
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
};

const erc20Abi = [
  { type: 'function', name: 'name', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'symbol', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
] as const;

/**
 * Reads ERC-20 name, symbol, and decimals from a token contract.
 * Returns null if any call fails (not a valid ERC-20).
 */
export async function probeToken(
  client: PublicClient,
  address: Address,
): Promise<TokenMetadata | null> {
  try {
    const [name, symbol, decimals] = await Promise.all([
      client.readContract({ address, abi: erc20Abi, functionName: 'name' }),
      client.readContract({ address, abi: erc20Abi, functionName: 'symbol' }),
      client.readContract({ address, abi: erc20Abi, functionName: 'decimals' }),
    ]);
    return { name: name as string, symbol: symbol as string, decimals: Number(decimals) };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run src/__tests__/token.test.ts`
Expected: PASS — all 2 tests

- [ ] **Step 5: Write failing tests for resolveBlockRef**

```typescript
// packages/sdk/src/__tests__/blocks-ref.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { PublicClient } from 'viem';
import { resolveBlockRef } from '../utils/blocks.js';

describe('resolveBlockRef', () => {
  it('parses a raw block number string', async () => {
    const client = {} as PublicClient;
    const result = await resolveBlockRef('19000000', client);
    expect(result).toBe(19_000_000n);
  });

  it('resolves an ISO date via resolveBlockByTimestamp', async () => {
    // Mock the scanner's resolveBlockByTimestamp by mocking the module
    const client = {} as PublicClient;
    // We need to mock the import. Use vi.mock at top level.
    const result = await resolveBlockRef('2025-01-15', client);
    // The mock should return a block number
    expect(typeof result).toBe('bigint');
  });

  it('trims whitespace', async () => {
    const client = {} as PublicClient;
    const result = await resolveBlockRef('  19000000  ', client);
    expect(result).toBe(19_000_000n);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run src/__tests__/blocks-ref.test.ts`
Expected: FAIL — module not found

- [ ] **Step 7: Implement resolveBlockRef**

```typescript
// packages/sdk/src/utils/blocks.ts
import type { PublicClient } from 'viem';
import { resolveBlockByTimestamp } from '../scanner/index.js';

/**
 * Resolves a user-provided string to a block number.
 * Accepts either a raw block number ("19000000") or an ISO date ("2025-01-15").
 * ISO dates are resolved via binary search on-chain.
 */
export async function resolveBlockRef(
  input: string,
  client: PublicClient,
): Promise<bigint> {
  const trimmed = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(`${trimmed}T00:00:00Z`);
    const ts = Math.floor(date.getTime() / 1000);
    return resolveBlockByTimestamp(client, ts);
  }
  return BigInt(trimmed);
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run src/__tests__/blocks-ref.test.ts`
Expected: PASS — the raw block number tests pass; the date test needs `resolveBlockByTimestamp` to be mocked. If it fails because the mock isn't wired, add `vi.mock('../scanner/index.js', () => ({ resolveBlockByTimestamp: vi.fn().mockResolvedValue(19_000_000n) }))` at the top of the test file and re-run.

- [ ] **Step 9: Commit**

```bash
git add packages/sdk/src/utils/token.ts packages/sdk/src/utils/blocks.ts \
  packages/sdk/src/__tests__/token.test.ts packages/sdk/src/__tests__/blocks-ref.test.ts
git commit -m "feat(sdk): add token probe and block ref resolution utilities"
```

---

### Task 4: SDK — Resume utilities

**Files:**
- Create: `packages/sdk/src/utils/resume.ts`
- Create: `packages/sdk/src/__tests__/resume.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/sdk/src/__tests__/resume.test.ts
import { describe, it, expect } from 'vitest';
import { computeResumeOffset, alignAmountsForResume } from '../utils/resume.js';
import type { StoredBatch } from '../storage/index.js';

function makeBatch(status: 'confirmed' | 'failed'): StoredBatch {
  return {
    id: `batch-${Math.random()}`,
    campaignId: 'test',
    batchIndex: 0,
    recipients: [],
    amounts: [],
    status,
    attempts: [],
    confirmedTxHash: null,
    confirmedBlock: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe('computeResumeOffset', () => {
  it('returns zero for no batches', () => {
    expect(computeResumeOffset([], 200)).toBe(0);
  });

  it('computes offset from confirmed batches', () => {
    const batches = [makeBatch('confirmed'), makeBatch('confirmed'), makeBatch('failed')];
    expect(computeResumeOffset(batches, 200)).toBe(400);
  });

  it('ignores failed batches', () => {
    const batches = [makeBatch('failed'), makeBatch('failed')];
    expect(computeResumeOffset(batches, 100)).toBe(0);
  });

  it('works with different batch sizes', () => {
    const batches = [makeBatch('confirmed')];
    expect(computeResumeOffset(batches, 500)).toBe(500);
  });
});

describe('alignAmountsForResume', () => {
  const amounts = [100n, 200n, 300n, 400n, 500n];

  it('slices from offset for given count', () => {
    expect(alignAmountsForResume(amounts, 2, 3)).toEqual([300n, 400n, 500n]);
  });

  it('returns zeros for out-of-bounds indices', () => {
    expect(alignAmountsForResume(amounts, 3, 4)).toEqual([400n, 500n, 0n, 0n]);
  });

  it('handles zero offset', () => {
    expect(alignAmountsForResume(amounts, 0, 2)).toEqual([100n, 200n]);
  });

  it('handles empty source', () => {
    expect(alignAmountsForResume([], 0, 3)).toEqual([0n, 0n, 0n]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run src/__tests__/resume.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the functions**

```typescript
// packages/sdk/src/utils/resume.ts
import type { StoredBatch } from '../storage/index.js';

/**
 * Computes how many recipients to skip when resuming a distribution.
 * Counts confirmed batches and multiplies by batch size.
 */
export function computeResumeOffset(
  batches: readonly StoredBatch[],
  batchSize: number,
): number {
  const confirmedCount = batches.filter((b) => b.status === 'confirmed').length;
  return confirmedCount * batchSize;
}

/**
 * Slices a variable-amounts array to align with resumed recipients.
 * Returns `count` amounts starting at `offset`. Out-of-bounds indices yield 0n.
 */
export function alignAmountsForResume(
  amounts: readonly bigint[],
  offset: number,
  count: number,
): bigint[] {
  return Array.from({ length: count }, (_, i) => amounts[offset + i] ?? 0n);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run src/__tests__/resume.test.ts`
Expected: PASS — all 8 tests

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/utils/resume.ts packages/sdk/src/__tests__/resume.test.ts
git commit -m "feat(sdk): add resume offset and amount alignment utilities"
```

---

### Task 5: SDK — Requirements calculator + spend report

**Files:**
- Create: `packages/sdk/src/utils/requirements.ts`
- Create: `packages/sdk/src/utils/spend.ts`
- Create: `packages/sdk/src/__tests__/requirements.test.ts`
- Create: `packages/sdk/src/__tests__/spend.test.ts`

- [ ] **Step 1: Write failing tests for computeRequirements**

```typescript
// packages/sdk/src/__tests__/requirements.test.ts
import { describe, it, expect } from 'vitest';
import { computeRequirements } from '../utils/requirements.js';

describe('computeRequirements', () => {
  it('computes for uniform amounts', () => {
    const result = computeRequirements({
      recipientCount: 1000,
      batchSize: 200,
      amountPerRecipient: 1_000_000n,
      gasPerBatch: 500_000n,
    });
    expect(result.batchCount).toBe(5);
    expect(result.gasTokenNeeded).toBe(2_500_000n);
    expect(result.erc20Needed).toBe(1_000_000_000n);
  });

  it('uses totalAmount when provided (variable amounts)', () => {
    const result = computeRequirements({
      recipientCount: 3,
      batchSize: 2,
      amountPerRecipient: 0n,
      totalAmount: 5_000_000n,
      gasPerBatch: 300_000n,
    });
    expect(result.batchCount).toBe(2);
    expect(result.gasTokenNeeded).toBe(600_000n);
    expect(result.erc20Needed).toBe(5_000_000n);
  });

  it('handles single batch', () => {
    const result = computeRequirements({
      recipientCount: 50,
      batchSize: 200,
      amountPerRecipient: 100n,
      gasPerBatch: 1_000_000n,
    });
    expect(result.batchCount).toBe(1);
    expect(result.gasTokenNeeded).toBe(1_000_000n);
    expect(result.erc20Needed).toBe(5_000n);
  });

  it('handles zero recipients', () => {
    const result = computeRequirements({
      recipientCount: 0,
      batchSize: 200,
      amountPerRecipient: 100n,
      gasPerBatch: 500_000n,
    });
    expect(result.batchCount).toBe(0);
    expect(result.gasTokenNeeded).toBe(0n);
    expect(result.erc20Needed).toBe(0n);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run src/__tests__/requirements.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement computeRequirements**

```typescript
// packages/sdk/src/utils/requirements.ts

export type DistributionRequirements = {
  readonly gasTokenNeeded: bigint;
  readonly erc20Needed: bigint;
  readonly batchCount: number;
};

/**
 * Computes how much gas token and ERC-20 a distribution will need.
 * For uniform amounts: erc20 = amountPerRecipient × recipientCount.
 * For variable amounts: provide totalAmount directly.
 */
export function computeRequirements(params: {
  readonly recipientCount: number;
  readonly batchSize: number;
  readonly amountPerRecipient: bigint;
  readonly totalAmount?: bigint;
  readonly gasPerBatch: bigint;
}): DistributionRequirements {
  const { recipientCount, batchSize, amountPerRecipient, totalAmount, gasPerBatch } = params;
  const batchCount = recipientCount === 0 ? 0 : Math.ceil(recipientCount / batchSize);
  const gasTokenNeeded = gasPerBatch * BigInt(batchCount);
  const erc20Needed = totalAmount ?? amountPerRecipient * BigInt(recipientCount);
  return { gasTokenNeeded, erc20Needed, batchCount };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run src/__tests__/requirements.test.ts`
Expected: PASS — all 4 tests

- [ ] **Step 5: Write failing tests for aggregateSpendReport**

```typescript
// packages/sdk/src/__tests__/spend.test.ts
import { describe, it, expect } from 'vitest';
import type { StoredBatch } from '../storage/index.js';
import type { BatchAttempt } from '../types.js';
import { aggregateSpendReport } from '../utils/spend.js';

function makeBatch(overrides: Partial<StoredBatch> & { status: StoredBatch['status'] }): StoredBatch {
  return {
    id: `b-${Math.random()}`,
    campaignId: 'c1',
    batchIndex: 0,
    recipients: [],
    amounts: [],
    attempts: [],
    confirmedTxHash: null,
    confirmedBlock: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

const confirmedAttempt: BatchAttempt = {
  txHash: '0xabc' as `0x${string}`,
  nonce: 0,
  gasEstimate: 400_000n,
  maxFeePerGas: 30_000_000_000n,
  maxPriorityFeePerGas: 1_000_000_000n,
  timestamp: Date.now(),
  outcome: 'confirmed',
};

describe('aggregateSpendReport', () => {
  it('aggregates confirmed batches', () => {
    const batches = [
      makeBatch({
        status: 'confirmed',
        recipients: ['0xaaa' as `0x${string}`, '0xbbb' as `0x${string}`],
        amounts: ['1000', '2000'],
        attempts: [confirmedAttempt],
      }),
      makeBatch({
        status: 'confirmed',
        recipients: ['0xccc' as `0x${string}`],
        amounts: ['3000'],
        attempts: [confirmedAttempt],
      }),
    ];

    const report = aggregateSpendReport(batches);
    expect(report.uniqueRecipients).toBe(3);
    expect(report.totalTokensSent).toBe(6000n);
    expect(report.confirmedBatches).toBe(2);
    expect(report.failedBatches).toBe(0);
    expect(report.batchCount).toBe(2);
  });

  it('counts failed batches separately', () => {
    const batches = [
      makeBatch({ status: 'confirmed', recipients: ['0xaaa' as `0x${string}`], amounts: ['100'], attempts: [confirmedAttempt] }),
      makeBatch({ status: 'failed' }),
    ];

    const report = aggregateSpendReport(batches);
    expect(report.confirmedBatches).toBe(1);
    expect(report.failedBatches).toBe(1);
  });

  it('deduplicates recipients across batches', () => {
    const batches = [
      makeBatch({ status: 'confirmed', recipients: ['0xaaa' as `0x${string}`], amounts: ['100'], attempts: [confirmedAttempt] }),
      makeBatch({ status: 'confirmed', recipients: ['0xaaa' as `0x${string}`], amounts: ['200'], attempts: [confirmedAttempt] }),
    ];

    const report = aggregateSpendReport(batches);
    expect(report.uniqueRecipients).toBe(1);
    expect(report.totalTokensSent).toBe(300n);
  });

  it('returns zeros for empty input', () => {
    const report = aggregateSpendReport([]);
    expect(report.uniqueRecipients).toBe(0);
    expect(report.totalTokensSent).toBe(0n);
    expect(report.totalGasEstimate).toBe(0n);
    expect(report.batchCount).toBe(0);
  });

  it('sums gas estimates from confirmed attempts', () => {
    const batches = [
      makeBatch({
        status: 'confirmed',
        recipients: ['0xaaa' as `0x${string}`],
        amounts: ['100'],
        attempts: [confirmedAttempt, { ...confirmedAttempt, outcome: 'replaced' as const }],
      }),
    ];

    const report = aggregateSpendReport(batches);
    // Only the 'confirmed' attempt's gas should count
    expect(report.totalGasEstimate).toBe(400_000n);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run src/__tests__/spend.test.ts`
Expected: FAIL — module not found

- [ ] **Step 7: Implement aggregateSpendReport**

```typescript
// packages/sdk/src/utils/spend.ts
import type { StoredBatch } from '../storage/index.js';

export type SpendReport = {
  readonly totalGasEstimate: bigint;
  readonly totalTokensSent: bigint;
  readonly uniqueRecipients: number;
  readonly batchCount: number;
  readonly confirmedBatches: number;
  readonly failedBatches: number;
};

/**
 * Aggregates completed batches into a spend report.
 * Amounts are stored as strings in StoredBatch; this function parses them to bigint for summation.
 * Gas is approximated from confirmed attempt gas estimates (actual usage requires receipt lookup).
 */
export function aggregateSpendReport(batches: readonly StoredBatch[]): SpendReport {
  const recipientSet = new Set<string>();
  let totalGasEstimate = 0n;
  let totalTokensSent = 0n;
  let confirmedBatches = 0;
  let failedBatches = 0;

  for (const batch of batches) {
    if (batch.status === 'confirmed') {
      confirmedBatches++;
      for (const addr of batch.recipients) {
        recipientSet.add(addr.toLowerCase());
      }
      for (const amount of batch.amounts) {
        totalTokensSent += BigInt(amount);
      }
      for (const attempt of batch.attempts) {
        if (attempt.outcome === 'confirmed') {
          totalGasEstimate += attempt.gasEstimate;
        }
      }
    } else {
      failedBatches++;
    }
  }

  return {
    totalGasEstimate,
    totalTokensSent,
    uniqueRecipients: recipientSet.size,
    batchCount: batches.length,
    confirmedBatches,
    failedBatches,
  };
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run src/__tests__/spend.test.ts`
Expected: PASS — all 5 tests

- [ ] **Step 9: Commit**

```bash
git add packages/sdk/src/utils/requirements.ts packages/sdk/src/utils/spend.ts \
  packages/sdk/src/__tests__/requirements.test.ts packages/sdk/src/__tests__/spend.test.ts
git commit -m "feat(sdk): add requirements calculator and spend report aggregation"
```

---

### Task 6: SDK barrel exports + TUI import refactor

**Files:**
- Modify: `packages/sdk/src/index.ts`
- Modify: `packages/tui/src/interactive/steps/amounts.ts`
- Modify: `packages/tui/src/interactive/steps/distribute.ts`
- Modify: `packages/tui/src/interactive/steps/campaign.ts`
- Modify: `packages/tui/src/interactive/steps/addresses.ts`
- Modify: `packages/tui/src/commands/distribute.ts`

- [ ] **Step 1: Update SDK barrel exports**

Add these lines to `packages/sdk/src/index.ts`:

```typescript
// Amounts
export { decimalToInteger, parseVariableAmounts } from './utils/amounts.js';

// Campaign
export { slugifyCampaignName } from './utils/campaign.js';

// Token
export { probeToken } from './utils/token.js';
export type { TokenMetadata } from './utils/token.js';

// Blocks
export { resolveBlockRef } from './utils/blocks.js';

// Resume
export { computeResumeOffset, alignAmountsForResume } from './utils/resume.js';

// Serialize
export { serializeBatchResults } from './utils/serialize.js';

// Requirements
export { computeRequirements } from './utils/requirements.js';
export type { DistributionRequirements } from './utils/requirements.js';

// Spend
export { aggregateSpendReport } from './utils/spend.js';
export type { SpendReport } from './utils/spend.js';
```

- [ ] **Step 2: Build SDK to verify exports compile**

Run: `cd packages/sdk && npx tsc`
Expected: Clean compilation with no errors

- [ ] **Step 3: Update TUI amounts.ts — remove local functions, import from SDK**

In `packages/tui/src/interactive/steps/amounts.ts`:

Remove the `decimalToInteger` and `parseVariableAmounts` function definitions. Add import:

```typescript
import { decimalToInteger, parseVariableAmounts } from '@titrate/sdk';
```

- [ ] **Step 4: Update TUI campaign.ts — remove probeToken, import from SDK**

In `packages/tui/src/interactive/steps/campaign.ts`:

Remove the `probeToken` function definition and its inline ABI constants. Add import:

```typescript
import { probeToken } from '@titrate/sdk';
```

- [ ] **Step 5: Update TUI addresses.ts — remove resolveBlockRef, import from SDK**

In `packages/tui/src/interactive/steps/addresses.ts`:

Remove the `resolveBlockRef` function definition. Add import:

```typescript
import { resolveBlockRef } from '@titrate/sdk';
```

Note: The TUI version had a `label` parameter that was only used for error messages. The SDK version drops it — adjust callers to not pass `label`.

- [ ] **Step 6: Update TUI distribute.ts — remove slugifyCampaignName, use SDK resume utilities**

In `packages/tui/src/interactive/steps/distribute.ts`:

Remove the `slugifyCampaignName` function definition. Add imports:

```typescript
import { slugifyCampaignName, computeResumeOffset, alignAmountsForResume } from '@titrate/sdk';
```

Replace the inline resume offset calculation:
```typescript
// Before:
const confirmedCount = existingBatches.filter((b) => b.status === 'confirmed').length;
const startOffset = confirmedCount * batchSize;

// After:
const startOffset = computeResumeOffset(existingBatches, batchSize);
```

Replace the inline amount alignment:
```typescript
// Before:
const alignedAmounts = recipients.map((_, i) => amountList[startOffset + i] ?? 0n);

// After:
const alignedAmounts = alignAmountsForResume(amountList, startOffset, recipients.length);
```

- [ ] **Step 7: Update TUI commands/distribute.ts — remove serializeResults, import from SDK**

In `packages/tui/src/commands/distribute.ts`:

Remove the `serializeResults` function definition. Add import:

```typescript
import { serializeBatchResults } from '@titrate/sdk';
```

Rename the call from `serializeResults(results)` to `serializeBatchResults(results)`.

- [ ] **Step 8: Build TUI and run all tests**

Run: `cd packages/tui && npx tsc && npx vitest run`
Expected: Clean build and all tests pass

Run: `cd packages/sdk && npx vitest run`
Expected: All SDK tests pass (existing + new)

- [ ] **Step 9: Commit**

```bash
git add packages/sdk/src/index.ts \
  packages/tui/src/interactive/steps/amounts.ts \
  packages/tui/src/interactive/steps/distribute.ts \
  packages/tui/src/interactive/steps/campaign.ts \
  packages/tui/src/interactive/steps/addresses.ts \
  packages/tui/src/commands/distribute.ts
git commit -m "refactor: extract shared business logic from TUI into SDK"
```

---

### Task 7: Scaffold packages/web

**Files:**
- Create: `packages/web/package.json`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/vite.config.ts`
- Create: `packages/web/vitest.config.ts`
- Create: `packages/web/index.html`
- Create: `packages/web/src/main.tsx`
- Create: `packages/web/src/App.tsx`
- Create: `packages/web/src/index.css`
- Create: `packages/web/src/test-setup.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@titrate/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@titrate/sdk": "0.0.1",
    "@titrate/storage-idb": "0.0.1",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.3.0",
    "@tailwindcss/vite": "^4.1.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.4.0",
    "jsdom": "^25.0.0",
    "tailwindcss": "^4.1.0",
    "typescript": "^5.7.3",
    "vitest": "^4.1.1"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx",
    "noEmit": true
  },
  "include": ["src"],
  "exclude": ["dist"]
}
```

- [ ] **Step 3: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

- [ ] **Step 4: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
```

- [ ] **Step 5: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Titrate</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create src files**

`packages/web/src/index.css`:
```css
@import "tailwindcss";
```

`packages/web/src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`packages/web/src/App.tsx`:
```tsx
export function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <h1 className="text-3xl font-bold">Titrate</h1>
    </div>
  );
}
```

`packages/web/src/test-setup.ts`:
```typescript
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 7: Install dependencies and verify build**

Run: `cd /Users/michaelmclaughlin/Documents/morbius/github/airdrop && npm install`
Run: `cd packages/web && npx tsc --noEmit && npx vite build`
Expected: Clean build

- [ ] **Step 8: Verify dev server starts**

Run: `cd packages/web && npx vite --port 5173 &` then open `http://localhost:5173` to confirm "Titrate" renders. Kill the server.

- [ ] **Step 9: Commit**

```bash
git add packages/web/
git commit -m "feat(web): scaffold web package with Vite, React, Tailwind, Vitest"
```

---

### Task 8: Feedback components — StatusBadge, ProgressRing, MemoryWarning

**Files:**
- Create: `packages/web/src/components/StatusBadge.tsx`
- Create: `packages/web/src/components/StatusBadge.test.tsx`
- Create: `packages/web/src/components/ProgressRing.tsx`
- Create: `packages/web/src/components/ProgressRing.test.tsx`
- Create: `packages/web/src/components/MemoryWarning.tsx`
- Create: `packages/web/src/components/MemoryWarning.test.tsx`

- [ ] **Step 1: Write failing tests for StatusBadge**

```tsx
// packages/web/src/components/StatusBadge.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatusBadge } from './StatusBadge.js';

describe('StatusBadge', () => {
  it('renders the label text', () => {
    render(<StatusBadge status="complete" label="Done" />);
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('renders status as label when no label prop given', () => {
    render(<StatusBadge status="pending" />);
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('applies green styling for complete status', () => {
    render(<StatusBadge status="complete" />);
    const badge = screen.getByText('complete');
    expect(badge.className).toContain('green');
  });

  it('applies red styling for error status', () => {
    render(<StatusBadge status="error" />);
    const badge = screen.getByText('error');
    expect(badge.className).toContain('red');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/web && npx vitest run src/components/StatusBadge.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement StatusBadge**

```tsx
// packages/web/src/components/StatusBadge.tsx

export type StatusBadgeProps = {
  readonly status: 'pending' | 'active' | 'complete' | 'error' | 'locked';
  readonly label?: string;
};

const statusStyles: Record<StatusBadgeProps['status'], string> = {
  pending: 'bg-gray-400/10 text-gray-400 ring-gray-400/20',
  active: 'bg-blue-400/10 text-blue-400 ring-blue-400/20',
  complete: 'bg-green-400/10 text-green-400 ring-green-400/20',
  error: 'bg-red-400/10 text-red-400 ring-red-400/20',
  locked: 'bg-gray-700/10 text-gray-600 ring-gray-700/20',
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${statusStyles[status]}`}
    >
      {label ?? status}
    </span>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/web && npx vitest run src/components/StatusBadge.test.tsx`
Expected: PASS — all 4 tests

- [ ] **Step 5: Write failing tests for ProgressRing**

```tsx
// packages/web/src/components/ProgressRing.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ProgressRing } from './ProgressRing.js';

describe('ProgressRing', () => {
  it('displays the percentage', () => {
    render(<ProgressRing percent={75} />);
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('displays a label when provided', () => {
    render(<ProgressRing percent={50} label="Scanning" />);
    expect(screen.getByText('Scanning')).toBeInTheDocument();
  });

  it('clamps percent to 0-100 range', () => {
    render(<ProgressRing percent={150} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('renders an SVG element', () => {
    const { container } = render(<ProgressRing percent={50} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Implement ProgressRing**

```tsx
// packages/web/src/components/ProgressRing.tsx

export type ProgressRingProps = {
  readonly percent: number;
  readonly size?: number;
  readonly label?: string;
};

export function ProgressRing({ percent, size = 64, label }: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-gray-700"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-blue-500 transition-all duration-300"
        />
      </svg>
      <span className="text-sm font-medium text-gray-300">{clamped}%</span>
      {label && <span className="text-xs text-gray-500">{label}</span>}
    </div>
  );
}
```

- [ ] **Step 7: Run ProgressRing tests**

Run: `cd packages/web && npx vitest run src/components/ProgressRing.test.tsx`
Expected: PASS — all 4 tests

- [ ] **Step 8: Write failing tests for MemoryWarning**

```tsx
// packages/web/src/components/MemoryWarning.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryWarning } from './MemoryWarning.js';

describe('MemoryWarning', () => {
  it('displays heap usage info', () => {
    render(<MemoryWarning heapUsedMB={3200} heapLimitMB={4096} usagePercent={78} />);
    expect(screen.getByText(/78%/)).toBeInTheDocument();
    expect(screen.getByText(/3200/)).toBeInTheDocument();
  });

  it('calls onDismiss when close button is clicked', () => {
    const onDismiss = vi.fn();
    render(<MemoryWarning heapUsedMB={3200} heapLimitMB={4096} usagePercent={78} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('does not render close button without onDismiss', () => {
    render(<MemoryWarning heapUsedMB={3200} heapLimitMB={4096} usagePercent={78} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
```

- [ ] **Step 9: Implement MemoryWarning**

```tsx
// packages/web/src/components/MemoryWarning.tsx

export type MemoryWarningProps = {
  readonly heapUsedMB: number;
  readonly heapLimitMB: number;
  readonly usagePercent: number;
  readonly onDismiss?: () => void;
};

export function MemoryWarning({ heapUsedMB, heapLimitMB, usagePercent, onDismiss }: MemoryWarningProps) {
  return (
    <div className="rounded-md bg-yellow-400/10 p-4 ring-1 ring-inset ring-yellow-400/20">
      <div className="flex items-start gap-3">
        <span className="text-yellow-400 text-lg">!</span>
        <div className="flex-1 text-sm text-yellow-300">
          <p className="font-medium">High memory usage</p>
          <p className="mt-1 text-yellow-400/80">
            Heap at {usagePercent}% ({heapUsedMB}MB / {heapLimitMB}MB).
            Consider increasing with --max-old-space-size.
          </p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-yellow-400 hover:text-yellow-300"
          >
            &times;
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Run all feedback component tests**

Run: `cd packages/web && npx vitest run src/components/`
Expected: PASS — all 11 tests

- [ ] **Step 11: Commit**

```bash
git add packages/web/src/components/StatusBadge.tsx packages/web/src/components/StatusBadge.test.tsx \
  packages/web/src/components/ProgressRing.tsx packages/web/src/components/ProgressRing.test.tsx \
  packages/web/src/components/MemoryWarning.tsx packages/web/src/components/MemoryWarning.test.tsx
git commit -m "feat(web): add StatusBadge, ProgressRing, and MemoryWarning components"
```

---

### Task 9: TimelineRail

**Files:**
- Create: `packages/web/src/components/TimelineRail.tsx`
- Create: `packages/web/src/components/TimelineRail.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/web/src/components/TimelineRail.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TimelineRail } from './TimelineRail.js';
import type { TimelineStep } from './TimelineRail.js';

const steps: TimelineStep[] = [
  { id: 'campaign', label: 'Campaign', status: 'complete', summary: 'Base · USDC' },
  { id: 'addresses', label: 'Addresses', status: 'active' },
  { id: 'filters', label: 'Filters', status: 'locked' },
];

describe('TimelineRail', () => {
  it('renders all step labels', () => {
    render(<TimelineRail steps={steps} />);
    expect(screen.getByText('Campaign')).toBeInTheDocument();
    expect(screen.getByText('Addresses')).toBeInTheDocument();
    expect(screen.getByText('Filters')).toBeInTheDocument();
  });

  it('renders summary for complete steps', () => {
    render(<TimelineRail steps={steps} />);
    expect(screen.getByText('Base · USDC')).toBeInTheDocument();
  });

  it('calls onStepClick with step ID for non-locked steps', () => {
    const onClick = vi.fn();
    render(<TimelineRail steps={steps} onStepClick={onClick} />);
    fireEvent.click(screen.getByText('Campaign'));
    expect(onClick).toHaveBeenCalledWith('campaign');
  });

  it('does not call onStepClick for locked steps', () => {
    const onClick = vi.fn();
    render(<TimelineRail steps={steps} onStepClick={onClick} />);
    fireEvent.click(screen.getByText('Filters'));
    expect(onClick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/web && npx vitest run src/components/TimelineRail.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement TimelineRail**

```tsx
// packages/web/src/components/TimelineRail.tsx

export type TimelineStep = {
  readonly id: string;
  readonly label: string;
  readonly status: 'complete' | 'active' | 'locked';
  readonly summary?: string;
};

export type TimelineRailProps = {
  readonly steps: readonly TimelineStep[];
  readonly onStepClick?: (stepId: string) => void;
};

const dotStyles: Record<TimelineStep['status'], string> = {
  complete: 'bg-green-500',
  active: 'bg-blue-500 ring-4 ring-blue-500/20',
  locked: 'bg-gray-600',
};

export function TimelineRail({ steps, onStepClick }: TimelineRailProps) {
  return (
    <nav className="flex flex-col gap-0">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-start gap-3">
          {/* Connector line + dot */}
          <div className="flex flex-col items-center">
            <div className={`h-3 w-3 rounded-full shrink-0 mt-1 ${dotStyles[step.status]}`} />
            {i < steps.length - 1 && <div className="w-px flex-1 min-h-8 bg-gray-700" />}
          </div>

          {/* Label + summary */}
          <button
            type="button"
            disabled={step.status === 'locked'}
            onClick={() => step.status !== 'locked' && onStepClick?.(step.id)}
            className={`text-left pb-6 ${
              step.status === 'locked'
                ? 'text-gray-600 cursor-not-allowed'
                : 'text-gray-200 hover:text-white cursor-pointer'
            } ${step.status === 'active' ? 'font-semibold' : ''}`}
          >
            <span className="text-sm">{step.label}</span>
            {step.summary && step.status === 'complete' && (
              <span className="block text-xs text-gray-500 mt-0.5">{step.summary}</span>
            )}
          </button>
        </div>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/web && npx vitest run src/components/TimelineRail.test.tsx`
Expected: PASS — all 4 tests

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/TimelineRail.tsx packages/web/src/components/TimelineRail.test.tsx
git commit -m "feat(web): add TimelineRail component"
```

---

### Task 10: StepPanel + AppShell

**Files:**
- Create: `packages/web/src/components/StepPanel.tsx`
- Create: `packages/web/src/components/StepPanel.test.tsx`
- Create: `packages/web/src/components/AppShell.tsx`
- Create: `packages/web/src/components/AppShell.test.tsx`

- [ ] **Step 1: Write failing tests for StepPanel**

```tsx
// packages/web/src/components/StepPanel.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StepPanel } from './StepPanel.js';

describe('StepPanel', () => {
  it('renders title', () => {
    render(<StepPanel title="Configure Filters"><p>content</p></StepPanel>);
    expect(screen.getByText('Configure Filters')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<StepPanel title="Filters" description="Set up address filters"><p>content</p></StepPanel>);
    expect(screen.getByText('Set up address filters')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(<StepPanel title="Filters"><p>child content</p></StepPanel>);
    expect(screen.getByText('child content')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement StepPanel**

```tsx
// packages/web/src/components/StepPanel.tsx
import type { ReactNode } from 'react';

export type StepPanelProps = {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
};

export function StepPanel({ title, description, children }: StepPanelProps) {
  return (
    <div className="flex-1 p-6">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {description && <p className="mt-1 text-sm text-gray-400">{description}</p>}
      <div className="mt-6">{children}</div>
    </div>
  );
}
```

- [ ] **Step 3: Run StepPanel tests**

Run: `cd packages/web && npx vitest run src/components/StepPanel.test.tsx`
Expected: PASS — all 3 tests

- [ ] **Step 4: Write failing tests for AppShell**

```tsx
// packages/web/src/components/AppShell.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AppShell } from './AppShell.js';
import type { TimelineStep } from './TimelineRail.js';

const steps: TimelineStep[] = [
  { id: 'campaign', label: 'Campaign', status: 'complete' },
  { id: 'addresses', label: 'Addresses', status: 'active' },
];

describe('AppShell', () => {
  it('renders the timeline rail', () => {
    render(<AppShell steps={steps} activeStepId="addresses"><p>content</p></AppShell>);
    expect(screen.getByText('Campaign')).toBeInTheDocument();
    expect(screen.getByText('Addresses')).toBeInTheDocument();
  });

  it('renders children in the content area', () => {
    render(<AppShell steps={steps} activeStepId="addresses"><p>panel content</p></AppShell>);
    expect(screen.getByText('panel content')).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Implement AppShell**

```tsx
// packages/web/src/components/AppShell.tsx
import type { ReactNode } from 'react';
import { TimelineRail } from './TimelineRail.js';
import type { TimelineStep } from './TimelineRail.js';

export type AppShellProps = {
  readonly steps: readonly TimelineStep[];
  readonly activeStepId: string;
  readonly onStepClick?: (stepId: string) => void;
  readonly children: ReactNode;
};

export function AppShell({ steps, activeStepId: _activeStepId, onStepClick, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Desktop: side-by-side. Mobile: stacked. */}
      <div className="mx-auto max-w-5xl px-4 py-8 lg:flex lg:gap-8">
        {/* Timeline rail — fixed width on desktop, horizontal on mobile */}
        <aside className="hidden lg:block lg:w-56 lg:shrink-0">
          <TimelineRail steps={steps} onStepClick={onStepClick} />
        </aside>

        {/* Mobile progress bar */}
        <div className="lg:hidden mb-6">
          <div className="flex gap-2">
            {steps.map((step) => (
              <div
                key={step.id}
                className={`h-1 flex-1 rounded-full ${
                  step.status === 'complete'
                    ? 'bg-green-500'
                    : step.status === 'active'
                      ? 'bg-blue-500'
                      : 'bg-gray-700'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content area */}
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run AppShell tests**

Run: `cd packages/web && npx vitest run src/components/AppShell.test.tsx`
Expected: PASS — all 2 tests

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/components/StepPanel.tsx packages/web/src/components/StepPanel.test.tsx \
  packages/web/src/components/AppShell.tsx packages/web/src/components/AppShell.test.tsx
git commit -m "feat(web): add StepPanel and AppShell layout components"
```

---

### Task 11: CampaignCard

**Files:**
- Create: `packages/web/src/components/CampaignCard.tsx`
- Create: `packages/web/src/components/CampaignCard.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// packages/web/src/components/CampaignCard.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CampaignCard } from './CampaignCard.js';

describe('CampaignCard', () => {
  const props = {
    name: 'March Airdrop',
    chainName: 'Base',
    tokenSymbol: 'USDC',
    addressCount: 48291,
    batchProgress: { completed: 3, total: 10 },
    status: 'distributing' as const,
  };

  it('renders campaign name', () => {
    render(<CampaignCard {...props} />);
    expect(screen.getByText('March Airdrop')).toBeInTheDocument();
  });

  it('renders chain and token', () => {
    render(<CampaignCard {...props} />);
    expect(screen.getByText('Base')).toBeInTheDocument();
    expect(screen.getByText('USDC')).toBeInTheDocument();
  });

  it('renders address count', () => {
    render(<CampaignCard {...props} />);
    expect(screen.getByText(/48,291/)).toBeInTheDocument();
  });

  it('renders batch progress', () => {
    render(<CampaignCard {...props} />);
    expect(screen.getByText('3 / 10')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<CampaignCard {...props} onClick={onClick} />);
    fireEvent.click(screen.getByText('March Airdrop'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders status badge', () => {
    render(<CampaignCard {...props} />);
    expect(screen.getByText('distributing')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement CampaignCard**

```tsx
// packages/web/src/components/CampaignCard.tsx
import { StatusBadge } from './StatusBadge.js';

export type CampaignCardProps = {
  readonly name: string;
  readonly chainName: string;
  readonly tokenSymbol: string;
  readonly addressCount: number;
  readonly batchProgress: { readonly completed: number; readonly total: number };
  readonly status: 'draft' | 'ready' | 'distributing' | 'complete';
  readonly onClick?: () => void;
};

const statusMap: Record<CampaignCardProps['status'], 'pending' | 'active' | 'complete' | 'error' | 'locked'> = {
  draft: 'pending',
  ready: 'active',
  distributing: 'active',
  complete: 'complete',
};

export function CampaignCard({
  name, chainName, tokenSymbol, addressCount, batchProgress, status, onClick,
}: CampaignCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      className="rounded-lg bg-gray-900 p-4 ring-1 ring-gray-800 hover:ring-gray-700 cursor-pointer transition-colors"
    >
      <div className="flex items-start justify-between">
        <h3 className="text-sm font-semibold text-white">{name}</h3>
        <StatusBadge status={statusMap[status]} label={status} />
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
        <span>{chainName}</span>
        <span>&middot;</span>
        <span>{tokenSymbol}</span>
        <span>&middot;</span>
        <span>{addressCount.toLocaleString()} addresses</span>
      </div>
      <div className="mt-3">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Batches</span>
          <span>{batchProgress.completed} / {batchProgress.total}</span>
        </div>
        <div className="h-1.5 bg-gray-800 rounded-full">
          <div
            className="h-1.5 bg-blue-500 rounded-full transition-all"
            style={{ width: batchProgress.total > 0 ? `${(batchProgress.completed / batchProgress.total) * 100}%` : '0%' }}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run tests**

Run: `cd packages/web && npx vitest run src/components/CampaignCard.test.tsx`
Expected: PASS — all 6 tests

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/CampaignCard.tsx packages/web/src/components/CampaignCard.test.tsx
git commit -m "feat(web): add CampaignCard component"
```

---

### Task 12: AddressTable

**Files:**
- Create: `packages/web/src/components/AddressTable.tsx`
- Create: `packages/web/src/components/AddressTable.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// packages/web/src/components/AddressTable.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AddressTable } from './AddressTable.js';

const rows = [
  { address: '0xaaaa…1111', amount: '1000' },
  { address: '0xbbbb…2222', amount: '2000' },
  { address: '0xcccc…3333' },
];

describe('AddressTable', () => {
  it('renders address rows', () => {
    render(<AddressTable rows={rows} page={0} pageSize={10} totalRows={3} />);
    expect(screen.getByText('0xaaaa…1111')).toBeInTheDocument();
    expect(screen.getByText('0xbbbb…2222')).toBeInTheDocument();
  });

  it('renders amounts when showAmounts is true', () => {
    render(<AddressTable rows={rows} page={0} pageSize={10} totalRows={3} showAmounts />);
    expect(screen.getByText('1000')).toBeInTheDocument();
    expect(screen.getByText('2000')).toBeInTheDocument();
  });

  it('hides amount column when showAmounts is false', () => {
    render(<AddressTable rows={rows} page={0} pageSize={10} totalRows={3} />);
    expect(screen.queryByText('Amount')).toBeNull();
  });

  it('highlights conflicting rows', () => {
    const conflictRows = [{ address: '0xaaaa…1111', conflict: true }];
    const { container } = render(<AddressTable rows={conflictRows} page={0} pageSize={10} totalRows={1} />);
    expect(container.querySelector('.bg-red-900\\/20')).toBeInTheDocument();
  });

  it('renders pagination info', () => {
    render(<AddressTable rows={rows} page={0} pageSize={2} totalRows={3} />);
    expect(screen.getByText(/1–2 of 3/)).toBeInTheDocument();
  });

  it('calls onPageChange when next is clicked', () => {
    const onPageChange = vi.fn();
    render(<AddressTable rows={rows} page={0} pageSize={2} totalRows={5} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByText('Next'));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Implement AddressTable**

```tsx
// packages/web/src/components/AddressTable.tsx

export type AddressTableRow = {
  readonly address: string;
  readonly amount?: string;
  readonly conflict?: boolean;
};

export type AddressTableProps = {
  readonly rows: readonly AddressTableRow[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalRows: number;
  readonly onPageChange?: (page: number) => void;
  readonly showAmounts?: boolean;
};

export function AddressTable({ rows, page, pageSize, totalRows, onPageChange, showAmounts }: AddressTableProps) {
  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, totalRows);
  const totalPages = Math.ceil(totalRows / pageSize);

  return (
    <div>
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase">
            <th className="pb-2 font-medium">Address</th>
            {showAmounts && <th className="pb-2 font-medium">Amount</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.address}
              className={`border-b border-gray-800/50 ${row.conflict ? 'bg-red-900/20' : ''}`}
            >
              <td className="py-2 font-mono text-gray-300">{row.address}</td>
              {showAmounts && <td className="py-2 text-gray-400">{row.amount ?? '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
        <span>{start}–{end} of {totalRows}</span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => onPageChange?.(page - 1)}
            className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <button
            type="button"
            disabled={page >= totalPages - 1}
            onClick={() => onPageChange?.(page + 1)}
            className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run tests**

Run: `cd packages/web && npx vitest run src/components/AddressTable.test.tsx`
Expected: PASS — all 6 tests

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/AddressTable.tsx packages/web/src/components/AddressTable.test.tsx
git commit -m "feat(web): add AddressTable component with pagination"
```

---

### Task 13: BatchStatusCard + BatchTimeline

**Files:**
- Create: `packages/web/src/components/BatchStatusCard.tsx`
- Create: `packages/web/src/components/BatchStatusCard.test.tsx`
- Create: `packages/web/src/components/BatchTimeline.tsx`
- Create: `packages/web/src/components/BatchTimeline.test.tsx`

- [ ] **Step 1: Write failing tests for BatchStatusCard**

```tsx
// packages/web/src/components/BatchStatusCard.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BatchStatusCard } from './BatchStatusCard.js';

describe('BatchStatusCard', () => {
  it('renders batch index and recipient count', () => {
    render(<BatchStatusCard batchIndex={0} recipientCount={200} status="confirmed" />);
    expect(screen.getByText('Batch #1')).toBeInTheDocument();
    expect(screen.getByText(/200 recipients/)).toBeInTheDocument();
  });

  it('renders tx hash as link when explorer URL is provided', () => {
    render(
      <BatchStatusCard
        batchIndex={0}
        recipientCount={100}
        status="confirmed"
        txHash="0xabc123"
        explorerUrl="https://etherscan.io"
      />
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://etherscan.io/tx/0xabc123');
  });

  it('renders status badge', () => {
    render(<BatchStatusCard batchIndex={0} recipientCount={100} status="failed" />);
    expect(screen.getByText('failed')).toBeInTheDocument();
  });

  it('renders gas estimate when provided', () => {
    render(<BatchStatusCard batchIndex={0} recipientCount={100} status="confirmed" gasEstimate="500,000" />);
    expect(screen.getByText(/500,000/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement BatchStatusCard**

```tsx
// packages/web/src/components/BatchStatusCard.tsx
import { StatusBadge } from './StatusBadge.js';

export type BatchStatusCardProps = {
  readonly batchIndex: number;
  readonly recipientCount: number;
  readonly status: 'pending' | 'confirmed' | 'failed';
  readonly txHash?: string;
  readonly explorerUrl?: string;
  readonly gasEstimate?: string;
};

const statusToBadge: Record<BatchStatusCardProps['status'], 'pending' | 'complete' | 'error'> = {
  pending: 'pending',
  confirmed: 'complete',
  failed: 'error',
};

export function BatchStatusCard({
  batchIndex, recipientCount, status, txHash, explorerUrl, gasEstimate,
}: BatchStatusCardProps) {
  return (
    <div className="rounded-lg bg-gray-900 p-3 ring-1 ring-gray-800">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white">Batch #{batchIndex + 1}</span>
        <StatusBadge status={statusToBadge[status]} label={status} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
        <span>{recipientCount} recipients</span>
        {gasEstimate && <span>Gas: {gasEstimate}</span>}
        {txHash && explorerUrl && (
          <a
            href={`${explorerUrl}/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 font-mono"
          >
            {txHash.slice(0, 10)}…
          </a>
        )}
        {txHash && !explorerUrl && (
          <span className="font-mono">{txHash.slice(0, 10)}…</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run BatchStatusCard tests**

Run: `cd packages/web && npx vitest run src/components/BatchStatusCard.test.tsx`
Expected: PASS — all 4 tests

- [ ] **Step 4: Write failing tests for BatchTimeline**

```tsx
// packages/web/src/components/BatchTimeline.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BatchTimeline } from './BatchTimeline.js';

describe('BatchTimeline', () => {
  it('renders multiple batch cards', () => {
    const batches = [
      { batchIndex: 0, recipientCount: 200, status: 'confirmed' as const },
      { batchIndex: 1, recipientCount: 200, status: 'confirmed' as const },
      { batchIndex: 2, recipientCount: 150, status: 'pending' as const },
    ];
    render(<BatchTimeline batches={batches} />);
    expect(screen.getByText('Batch #1')).toBeInTheDocument();
    expect(screen.getByText('Batch #2')).toBeInTheDocument();
    expect(screen.getByText('Batch #3')).toBeInTheDocument();
  });

  it('renders empty state', () => {
    render(<BatchTimeline batches={[]} />);
    expect(screen.getByText(/no batches/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Implement BatchTimeline**

```tsx
// packages/web/src/components/BatchTimeline.tsx
import { BatchStatusCard } from './BatchStatusCard.js';
import type { BatchStatusCardProps } from './BatchStatusCard.js';

export type BatchTimelineProps = {
  readonly batches: readonly BatchStatusCardProps[];
};

export function BatchTimeline({ batches }: BatchTimelineProps) {
  if (batches.length === 0) {
    return <p className="text-sm text-gray-500">No batches yet</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {batches.map((batch) => (
        <BatchStatusCard key={batch.batchIndex} {...batch} />
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Run all batch component tests**

Run: `cd packages/web && npx vitest run src/components/Batch`
Expected: PASS — all 6 tests

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/components/BatchStatusCard.tsx packages/web/src/components/BatchStatusCard.test.tsx \
  packages/web/src/components/BatchTimeline.tsx packages/web/src/components/BatchTimeline.test.tsx
git commit -m "feat(web): add BatchStatusCard and BatchTimeline components"
```

---

### Task 14: SpendSummary + RequirementsPanel

**Files:**
- Create: `packages/web/src/components/SpendSummary.tsx`
- Create: `packages/web/src/components/SpendSummary.test.tsx`
- Create: `packages/web/src/components/RequirementsPanel.tsx`
- Create: `packages/web/src/components/RequirementsPanel.test.tsx`

- [ ] **Step 1: Write failing tests for SpendSummary**

```tsx
// packages/web/src/components/SpendSummary.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SpendSummary } from './SpendSummary.js';

describe('SpendSummary', () => {
  const props = {
    totalGasEstimate: '0.45 ETH',
    totalTokensSent: '1,000,000 USDC',
    tokenSymbol: 'USDC',
    uniqueRecipients: 4829,
    batchCount: 25,
    confirmedBatches: 24,
    failedBatches: 1,
  };

  it('renders total tokens sent', () => {
    render(<SpendSummary {...props} />);
    expect(screen.getByText('1,000,000 USDC')).toBeInTheDocument();
  });

  it('renders gas estimate', () => {
    render(<SpendSummary {...props} />);
    expect(screen.getByText('0.45 ETH')).toBeInTheDocument();
  });

  it('renders recipient count', () => {
    render(<SpendSummary {...props} />);
    expect(screen.getByText('4,829')).toBeInTheDocument();
  });

  it('renders batch counts', () => {
    render(<SpendSummary {...props} />);
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement SpendSummary**

```tsx
// packages/web/src/components/SpendSummary.tsx

export type SpendSummaryProps = {
  readonly totalGasEstimate: string;
  readonly totalTokensSent: string;
  readonly tokenSymbol: string;
  readonly uniqueRecipients: number;
  readonly batchCount: number;
  readonly confirmedBatches: number;
  readonly failedBatches: number;
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-900 rounded-lg p-4 ring-1 ring-gray-800">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{typeof value === 'number' ? value.toLocaleString() : value}</p>
    </div>
  );
}

export function SpendSummary({
  totalGasEstimate, totalTokensSent, tokenSymbol: _tokenSymbol, uniqueRecipients,
  batchCount: _batchCount, confirmedBatches, failedBatches,
}: SpendSummaryProps) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-white mb-4">Distribution Summary</h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Tokens sent" value={totalTokensSent} />
        <Stat label="Gas (est.)" value={totalGasEstimate} />
        <Stat label="Recipients" value={uniqueRecipients} />
        <Stat label="Confirmed" value={confirmedBatches} />
      </div>
      {failedBatches > 0 && (
        <div className="mt-3 rounded-md bg-red-900/20 p-3 text-sm text-red-400 ring-1 ring-red-900/30">
          {failedBatches} batch{failedBatches > 1 ? 'es' : ''} failed
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run SpendSummary tests**

Run: `cd packages/web && npx vitest run src/components/SpendSummary.test.tsx`
Expected: PASS — all 4 tests

- [ ] **Step 4: Write failing tests for RequirementsPanel**

```tsx
// packages/web/src/components/RequirementsPanel.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RequirementsPanel } from './RequirementsPanel.js';

describe('RequirementsPanel', () => {
  it('renders gas token requirements', () => {
    render(
      <RequirementsPanel
        gasTokenNeeded="0.5 ETH"
        gasTokenBalance="1.0 ETH"
        gasTokenSymbol="ETH"
        erc20Needed="10,000 USDC"
        erc20Balance="50,000 USDC"
        tokenSymbol="USDC"
        batchCount={5}
        isSufficient
      />
    );
    expect(screen.getByText('0.5 ETH')).toBeInTheDocument();
    expect(screen.getByText('1.0 ETH')).toBeInTheDocument();
  });

  it('renders ERC-20 requirements', () => {
    render(
      <RequirementsPanel
        gasTokenNeeded="0.5 ETH"
        gasTokenBalance="1.0 ETH"
        gasTokenSymbol="ETH"
        erc20Needed="10,000 USDC"
        erc20Balance="50,000 USDC"
        tokenSymbol="USDC"
        batchCount={5}
        isSufficient
      />
    );
    expect(screen.getByText('10,000 USDC')).toBeInTheDocument();
  });

  it('shows warning when insufficient', () => {
    render(
      <RequirementsPanel
        gasTokenNeeded="2.0 ETH"
        gasTokenBalance="0.1 ETH"
        gasTokenSymbol="ETH"
        erc20Needed="10,000 USDC"
        erc20Balance="50,000 USDC"
        tokenSymbol="USDC"
        batchCount={5}
        isSufficient={false}
      />
    );
    expect(screen.getByText(/insufficient/i)).toBeInTheDocument();
  });

  it('shows ready state when sufficient', () => {
    render(
      <RequirementsPanel
        gasTokenNeeded="0.5 ETH"
        gasTokenBalance="1.0 ETH"
        gasTokenSymbol="ETH"
        erc20Needed="10,000 USDC"
        erc20Balance="50,000 USDC"
        tokenSymbol="USDC"
        batchCount={5}
        isSufficient
      />
    );
    expect(screen.getByText(/ready/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Implement RequirementsPanel**

```tsx
// packages/web/src/components/RequirementsPanel.tsx

export type RequirementsPanelProps = {
  readonly gasTokenNeeded: string;
  readonly gasTokenBalance: string;
  readonly gasTokenSymbol: string;
  readonly erc20Needed: string;
  readonly erc20Balance: string;
  readonly tokenSymbol: string;
  readonly batchCount: number;
  readonly isSufficient: boolean;
};

function Requirement({ label, needed, balance }: { label: string; needed: string; balance: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-800">
      <span className="text-sm text-gray-400">{label}</span>
      <div className="text-right">
        <span className="text-sm font-medium text-white">{needed}</span>
        <span className="text-xs text-gray-500 ml-2">(have: {balance})</span>
      </div>
    </div>
  );
}

export function RequirementsPanel({
  gasTokenNeeded, gasTokenBalance, gasTokenSymbol,
  erc20Needed, erc20Balance, tokenSymbol,
  batchCount, isSufficient,
}: RequirementsPanelProps) {
  return (
    <div className="rounded-lg bg-gray-900 p-4 ring-1 ring-gray-800">
      <h3 className="text-sm font-semibold text-white mb-3">Distribution Requirements</h3>
      <Requirement label={`${gasTokenSymbol} for gas`} needed={gasTokenNeeded} balance={gasTokenBalance} />
      <Requirement label={`${tokenSymbol} tokens`} needed={erc20Needed} balance={erc20Balance} />
      <div className="flex items-center justify-between py-2">
        <span className="text-sm text-gray-400">Batches</span>
        <span className="text-sm font-medium text-white">{batchCount}</span>
      </div>
      <div className={`mt-3 rounded-md p-3 text-sm ${
        isSufficient
          ? 'bg-green-900/20 text-green-400 ring-1 ring-green-900/30'
          : 'bg-red-900/20 text-red-400 ring-1 ring-red-900/30'
      }`}>
        {isSufficient ? 'Ready to distribute' : 'Insufficient balance — fund wallet before proceeding'}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run all tests**

Run: `cd packages/web && npx vitest run src/components/SpendSummary.test.tsx src/components/RequirementsPanel.test.tsx`
Expected: PASS — all 8 tests

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/components/SpendSummary.tsx packages/web/src/components/SpendSummary.test.tsx \
  packages/web/src/components/RequirementsPanel.tsx packages/web/src/components/RequirementsPanel.test.tsx
git commit -m "feat(web): add SpendSummary and RequirementsPanel components"
```

---

### Task 15: Form components — ChainSelector, AmountConfig, WalletBadge

**Files:**
- Create: `packages/web/src/components/ChainSelector.tsx`
- Create: `packages/web/src/components/ChainSelector.test.tsx`
- Create: `packages/web/src/components/AmountConfig.tsx`
- Create: `packages/web/src/components/AmountConfig.test.tsx`
- Create: `packages/web/src/components/WalletBadge.tsx`
- Create: `packages/web/src/components/WalletBadge.test.tsx`

- [ ] **Step 1: Write failing tests for ChainSelector**

```tsx
// packages/web/src/components/ChainSelector.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChainSelector } from './ChainSelector.js';

const chains = [
  { chainId: 1, name: 'Ethereum' },
  { chainId: 8453, name: 'Base' },
  { chainId: 42161, name: 'Arbitrum' },
];

describe('ChainSelector', () => {
  it('renders all chain options', () => {
    render(<ChainSelector chains={chains} selectedChainId={null} />);
    expect(screen.getByText('Ethereum')).toBeInTheDocument();
    expect(screen.getByText('Base')).toBeInTheDocument();
    expect(screen.getByText('Arbitrum')).toBeInTheDocument();
  });

  it('highlights selected chain', () => {
    render(<ChainSelector chains={chains} selectedChainId={8453} />);
    const base = screen.getByText('Base').closest('button');
    expect(base?.className).toContain('ring-blue');
  });

  it('calls onSelect with chainId', () => {
    const onSelect = vi.fn();
    render(<ChainSelector chains={chains} selectedChainId={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Base'));
    expect(onSelect).toHaveBeenCalledWith(8453);
  });
});
```

- [ ] **Step 2: Implement ChainSelector**

```tsx
// packages/web/src/components/ChainSelector.tsx

export type ChainOption = {
  readonly chainId: number;
  readonly name: string;
};

export type ChainSelectorProps = {
  readonly chains: readonly ChainOption[];
  readonly selectedChainId: number | null;
  readonly onSelect?: (chainId: number) => void;
};

export function ChainSelector({ chains, selectedChainId, onSelect }: ChainSelectorProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {chains.map((chain) => {
        const isSelected = chain.chainId === selectedChainId;
        return (
          <button
            key={chain.chainId}
            type="button"
            onClick={() => onSelect?.(chain.chainId)}
            className={`rounded-lg px-3 py-2 text-sm text-left transition-colors ring-1 ${
              isSelected
                ? 'bg-blue-500/10 text-blue-400 ring-blue-500/30'
                : 'bg-gray-900 text-gray-300 ring-gray-800 hover:ring-gray-700'
            }`}
          >
            {chain.name}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Run ChainSelector tests**

Run: `cd packages/web && npx vitest run src/components/ChainSelector.test.tsx`
Expected: PASS — all 3 tests

- [ ] **Step 4: Write failing tests for AmountConfig**

```tsx
// packages/web/src/components/AmountConfig.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AmountConfig } from './AmountConfig.js';

describe('AmountConfig', () => {
  it('renders mode toggle', () => {
    render(<AmountConfig mode="uniform" format="integer" uniformAmount="" />);
    expect(screen.getByText('Uniform')).toBeInTheDocument();
    expect(screen.getByText('Variable')).toBeInTheDocument();
  });

  it('renders amount input for uniform mode', () => {
    render(<AmountConfig mode="uniform" format="integer" uniformAmount="1000" />);
    expect(screen.getByDisplayValue('1000')).toBeInTheDocument();
  });

  it('hides amount input for variable mode', () => {
    render(<AmountConfig mode="variable" format="integer" uniformAmount="" />);
    expect(screen.queryByPlaceholderText(/amount/i)).toBeNull();
  });

  it('calls onModeChange', () => {
    const onModeChange = vi.fn();
    render(<AmountConfig mode="uniform" format="integer" uniformAmount="" onModeChange={onModeChange} />);
    fireEvent.click(screen.getByText('Variable'));
    expect(onModeChange).toHaveBeenCalledWith('variable');
  });

  it('calls onAmountChange', () => {
    const onAmountChange = vi.fn();
    render(<AmountConfig mode="uniform" format="integer" uniformAmount="" onAmountChange={onAmountChange} />);
    fireEvent.change(screen.getByPlaceholderText(/amount/i), { target: { value: '500' } });
    expect(onAmountChange).toHaveBeenCalledWith('500');
  });
});
```

- [ ] **Step 5: Implement AmountConfig**

```tsx
// packages/web/src/components/AmountConfig.tsx

export type AmountConfigProps = {
  readonly mode: 'uniform' | 'variable';
  readonly format: 'integer' | 'decimal';
  readonly uniformAmount: string;
  readonly onModeChange?: (mode: 'uniform' | 'variable') => void;
  readonly onFormatChange?: (format: 'integer' | 'decimal') => void;
  readonly onAmountChange?: (amount: string) => void;
};

function Toggle({ options, selected, onChange }: {
  options: readonly { value: string; label: string }[];
  selected: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-gray-800 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange?.(opt.value)}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            selected === opt.value
              ? 'bg-gray-700 text-white'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function AmountConfig({ mode, format, uniformAmount, onModeChange, onFormatChange, onAmountChange }: AmountConfigProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Toggle
          options={[{ value: 'uniform', label: 'Uniform' }, { value: 'variable', label: 'Variable' }]}
          selected={mode}
          onChange={(v) => onModeChange?.(v as 'uniform' | 'variable')}
        />
        <Toggle
          options={[{ value: 'integer', label: 'Integer' }, { value: 'decimal', label: 'Decimal' }]}
          selected={format}
          onChange={(v) => onFormatChange?.(v as 'integer' | 'decimal')}
        />
      </div>
      {mode === 'uniform' && (
        <input
          type="text"
          value={uniformAmount}
          onChange={(e) => onAmountChange?.(e.target.value)}
          placeholder="Enter amount per recipient"
          className="w-full rounded-lg bg-gray-900 px-3 py-2 text-sm text-white ring-1 ring-gray-800 placeholder:text-gray-600 focus:ring-blue-500 focus:outline-none"
        />
      )}
      {mode === 'variable' && (
        <p className="text-xs text-gray-500">Amounts will be read from the CSV file.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Run AmountConfig tests**

Run: `cd packages/web && npx vitest run src/components/AmountConfig.test.tsx`
Expected: PASS — all 5 tests

- [ ] **Step 7: Write failing tests for WalletBadge**

```tsx
// packages/web/src/components/WalletBadge.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { WalletBadge } from './WalletBadge.js';

describe('WalletBadge', () => {
  it('renders address and chain', () => {
    render(<WalletBadge address="0xabc…def" chainName="Ethereum" />);
    expect(screen.getByText('0xabc…def')).toBeInTheDocument();
    expect(screen.getByText('Ethereum')).toBeInTheDocument();
  });

  it('renders balance when provided', () => {
    render(<WalletBadge address="0xabc…def" chainName="Base" balance="1.5" balanceSymbol="ETH" />);
    expect(screen.getByText('1.5 ETH')).toBeInTheDocument();
  });

  it('renders perry mode indicator', () => {
    render(
      <WalletBadge
        address="0xhot…addr"
        chainName="Base"
        perryMode={{ hotAddress: '0xhot…addr', coldAddress: '0xcold…addr' }}
      />
    );
    expect(screen.getByText(/perry/i)).toBeInTheDocument();
    expect(screen.getByText(/0xcold…addr/)).toBeInTheDocument();
  });

  it('does not show perry mode when not provided', () => {
    render(<WalletBadge address="0xabc…def" chainName="Ethereum" />);
    expect(screen.queryByText(/perry/i)).toBeNull();
  });
});
```

- [ ] **Step 8: Implement WalletBadge**

```tsx
// packages/web/src/components/WalletBadge.tsx

export type WalletBadgeProps = {
  readonly address: string;
  readonly chainName: string;
  readonly balance?: string;
  readonly balanceSymbol?: string;
  readonly perryMode?: {
    readonly hotAddress: string;
    readonly coldAddress: string;
  };
};

export function WalletBadge({ address, chainName, balance, balanceSymbol, perryMode }: WalletBadgeProps) {
  return (
    <div className="rounded-lg bg-gray-900 px-4 py-3 ring-1 ring-gray-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-sm font-mono text-gray-300">{address}</span>
        </div>
        <span className="text-xs text-gray-500">{chainName}</span>
      </div>
      {balance && balanceSymbol && (
        <p className="mt-1 text-xs text-gray-400">{balance} {balanceSymbol}</p>
      )}
      {perryMode && (
        <div className="mt-2 rounded-md bg-purple-900/20 px-2 py-1 text-xs text-purple-400 ring-1 ring-purple-900/30">
          Perry mode — derived from {perryMode.coldAddress}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 9: Run all form component tests**

Run: `cd packages/web && npx vitest run src/components/ChainSelector.test.tsx src/components/AmountConfig.test.tsx src/components/WalletBadge.test.tsx`
Expected: PASS — all 12 tests

- [ ] **Step 10: Commit**

```bash
git add packages/web/src/components/ChainSelector.tsx packages/web/src/components/ChainSelector.test.tsx \
  packages/web/src/components/AmountConfig.tsx packages/web/src/components/AmountConfig.test.tsx \
  packages/web/src/components/WalletBadge.tsx packages/web/src/components/WalletBadge.test.tsx
git commit -m "feat(web): add ChainSelector, AmountConfig, and WalletBadge form components"
```

---

### Task 16: PipelineStepEditor

**Files:**
- Create: `packages/web/src/components/PipelineStepEditor.tsx`
- Create: `packages/web/src/components/PipelineStepEditor.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// packages/web/src/components/PipelineStepEditor.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PipelineStepEditor } from './PipelineStepEditor.js';

describe('PipelineStepEditor', () => {
  it('renders source type selector for source steps', () => {
    render(
      <PipelineStepEditor
        stepType="source"
        sourceType="csv"
        params={{ fileName: 'addresses.csv' }}
      />
    );
    expect(screen.getByText('CSV')).toBeInTheDocument();
    expect(screen.getByText('Block Scan')).toBeInTheDocument();
    expect(screen.getByText('Explorer')).toBeInTheDocument();
  });

  it('renders CSV params for CSV source', () => {
    render(
      <PipelineStepEditor
        stepType="source"
        sourceType="csv"
        params={{ fileName: 'list.csv' }}
      />
    );
    expect(screen.getByDisplayValue('list.csv')).toBeInTheDocument();
  });

  it('renders block scan params', () => {
    render(
      <PipelineStepEditor
        stepType="source"
        sourceType="block-scan"
        params={{ startBlock: '19000000', endBlock: '19100000' }}
      />
    );
    expect(screen.getByDisplayValue('19000000')).toBeInTheDocument();
    expect(screen.getByDisplayValue('19100000')).toBeInTheDocument();
  });

  it('renders filter type selector for filter steps', () => {
    render(
      <PipelineStepEditor
        stepType="filter"
        filterType="min-balance"
        params={{ minBalance: '0.1' }}
      />
    );
    expect(screen.getByText('Min Balance')).toBeInTheDocument();
    expect(screen.getByText('Exclude Contracts')).toBeInTheDocument();
  });

  it('renders min-balance param field', () => {
    render(
      <PipelineStepEditor
        stepType="filter"
        filterType="min-balance"
        params={{ minBalance: '0.1' }}
      />
    );
    expect(screen.getByDisplayValue('0.1')).toBeInTheDocument();
  });

  it('calls onParamsChange when a field changes', () => {
    const onParamsChange = vi.fn();
    render(
      <PipelineStepEditor
        stepType="filter"
        filterType="min-balance"
        params={{ minBalance: '0.1' }}
        onParamsChange={onParamsChange}
      />
    );
    fireEvent.change(screen.getByDisplayValue('0.1'), { target: { value: '0.5' } });
    expect(onParamsChange).toHaveBeenCalledWith({ minBalance: '0.5' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/web && npx vitest run src/components/PipelineStepEditor.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement PipelineStepEditor**

```tsx
// packages/web/src/components/PipelineStepEditor.tsx

export type PipelineStepEditorProps = {
  readonly stepType: 'source' | 'filter';
  readonly sourceType?: 'csv' | 'block-scan' | 'explorer-scan';
  readonly filterType?: 'contract-check' | 'min-balance' | 'nonce-range' | 'token-recipients' | 'csv-exclusion';
  readonly params: Record<string, string>;
  readonly onParamsChange?: (params: Record<string, string>) => void;
  readonly onTypeChange?: (type: string) => void;
};

const sourceTypes = [
  { value: 'csv', label: 'CSV' },
  { value: 'block-scan', label: 'Block Scan' },
  { value: 'explorer-scan', label: 'Explorer' },
];

const filterTypes = [
  { value: 'contract-check', label: 'Exclude Contracts' },
  { value: 'min-balance', label: 'Min Balance' },
  { value: 'nonce-range', label: 'Nonce Range' },
  { value: 'token-recipients', label: 'Token Recipients' },
  { value: 'csv-exclusion', label: 'CSV Exclusion' },
];

function ParamField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-white ring-1 ring-gray-700 placeholder:text-gray-600 focus:ring-blue-500 focus:outline-none"
      />
    </div>
  );
}

function SourceParams({ sourceType, params, onParamsChange }: {
  sourceType: string;
  params: Record<string, string>;
  onParamsChange?: (params: Record<string, string>) => void;
}) {
  const update = (key: string, value: string) => onParamsChange?.({ ...params, [key]: value });

  if (sourceType === 'csv') {
    return <ParamField label="File name" value={params.fileName ?? ''} onChange={(v) => update('fileName', v)} />;
  }
  if (sourceType === 'block-scan' || sourceType === 'explorer-scan') {
    return (
      <div className="space-y-3">
        <ParamField label="Start block" value={params.startBlock ?? ''} onChange={(v) => update('startBlock', v)} />
        <ParamField label="End block" value={params.endBlock ?? ''} onChange={(v) => update('endBlock', v)} />
      </div>
    );
  }
  return null;
}

function FilterParams({ filterType, params, onParamsChange }: {
  filterType: string;
  params: Record<string, string>;
  onParamsChange?: (params: Record<string, string>) => void;
}) {
  const update = (key: string, value: string) => onParamsChange?.({ ...params, [key]: value });

  if (filterType === 'min-balance') {
    return <ParamField label="Minimum balance (ETH)" value={params.minBalance ?? ''} onChange={(v) => update('minBalance', v)} />;
  }
  if (filterType === 'nonce-range') {
    return (
      <div className="space-y-3">
        <ParamField label="Min nonce" value={params.minNonce ?? ''} onChange={(v) => update('minNonce', v)} />
        <ParamField label="Max nonce" value={params.maxNonce ?? ''} onChange={(v) => update('maxNonce', v)} />
      </div>
    );
  }
  if (filterType === 'token-recipients') {
    return <ParamField label="Token address" value={params.tokenAddress ?? ''} onChange={(v) => update('tokenAddress', v)} />;
  }
  if (filterType === 'csv-exclusion') {
    return <ParamField label="Exclusion CSV" value={params.fileName ?? ''} onChange={(v) => update('fileName', v)} />;
  }
  return <p className="text-xs text-gray-500">No additional configuration needed.</p>;
}

export function PipelineStepEditor({
  stepType, sourceType, filterType, params, onParamsChange, onTypeChange,
}: PipelineStepEditorProps) {
  const types = stepType === 'source' ? sourceTypes : filterTypes;
  const selectedType = stepType === 'source' ? sourceType : filterType;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {types.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => onTypeChange?.(t.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ring-1 transition-colors ${
              selectedType === t.value
                ? 'bg-blue-500/10 text-blue-400 ring-blue-500/30'
                : 'bg-gray-900 text-gray-400 ring-gray-800 hover:ring-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {stepType === 'source' && sourceType && (
        <SourceParams sourceType={sourceType} params={params} onParamsChange={onParamsChange} />
      )}
      {stepType === 'filter' && filterType && (
        <FilterParams filterType={filterType} params={params} onParamsChange={onParamsChange} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/web && npx vitest run src/components/PipelineStepEditor.test.tsx`
Expected: PASS — all 6 tests

- [ ] **Step 5: Run the full web test suite**

Run: `cd packages/web && npx vitest run`
Expected: PASS — all component tests (should be ~60+ tests total)

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/PipelineStepEditor.tsx packages/web/src/components/PipelineStepEditor.test.tsx
git commit -m "feat(web): add PipelineStepEditor component"
```

---

### Task 17: Final verification — full test suite

**Files:** None (verification only)

- [ ] **Step 1: Run full SDK tests**

Run: `cd packages/sdk && npx vitest run`
Expected: All existing + new tests pass (should be ~190+ tests)

- [ ] **Step 2: Run full TUI tests**

Run: `cd packages/tui && npx vitest run`
Expected: All tests pass (imports updated to SDK)

- [ ] **Step 3: Run full web tests**

Run: `cd packages/web && npx vitest run`
Expected: All component tests pass

- [ ] **Step 4: Run monorepo-wide tests**

Run: `cd /Users/michaelmclaughlin/Documents/morbius/github/airdrop && npm test`
Expected: All packages pass

- [ ] **Step 5: TypeScript check across all packages**

Run: `cd packages/sdk && npx tsc --noEmit && cd ../tui && npx tsc --noEmit && cd ../web && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 6: Commit any remaining changes**

If the verification uncovered issues that were fixed, commit them:

```bash
git add -A
git commit -m "fix: resolve issues found during full verification"
```
