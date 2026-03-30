import { describe, it, expect } from 'vitest';
import { parseCSV, detectAmountFormat, validateAddresses, deduplicateAddresses, flagConflicts } from '../csv/index.js';
import type { CSVRow } from '../types.js';
import type { Address } from 'viem';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateAddress(index: number): string {
  return `0x${index.toString(16).padStart(40, '0')}`;
}

function generateCSV(rowCount: number, includeAmounts = false): string {
  const lines: string[] = ['address' + (includeAmounts ? ',amount' : '')];
  for (let i = 1; i <= rowCount; i++) {
    const addr = generateAddress(i);
    lines.push(includeAmounts ? `${addr},${i}` : addr);
  }
  return lines.join('\n');
}

function heapMB(): number {
  return Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
}

function assertDuration(label: string, durationMs: number, limitMs: number): void {
  if (durationMs > limitMs) {
    throw new Error(
      `${label}: exceeded time limit — took ${(durationMs / 1000).toFixed(2)}s, limit is ${(limitMs / 1000).toFixed(0)}s`,
    );
  }
}

const ROW_COUNT = 2_000_000;

// ---------------------------------------------------------------------------
// Stress tests
// ---------------------------------------------------------------------------

describe('CSV stress tests (2M rows)', { timeout: 120_000 }, () => {
  it('Test 1: parses 2M address-only rows', () => {
    const heapBefore = heapMB();
    const csv = generateCSV(ROW_COUNT, false);

    const start = Date.now();
    const result = parseCSV(csv);
    const durationMs = Date.now() - start;

    const heapAfter = heapMB();
    const heapDeltaMB = heapAfter - heapBefore;

    console.log(`[Test 1] rows=${result.rows.length} duration=${(durationMs / 1000).toFixed(2)}s heapDelta=${heapDeltaMB}MB`);

    expect(result.rows).toHaveLength(ROW_COUNT);
    expect(result.hasAmounts).toBe(false);

    // Verify no duplicates by spot-checking first and last address
    expect(result.rows[0].address).toBe(generateAddress(1).toLowerCase());
    expect(result.rows[ROW_COUNT - 1].address).toBe(generateAddress(ROW_COUNT).toLowerCase());

    assertDuration('parse address-only', durationMs, 30_000);
  });

  it('Test 2: parses 2M rows with amounts', () => {
    const heapBefore = heapMB();
    const csv = generateCSV(ROW_COUNT, true);

    const start = Date.now();
    const result = parseCSV(csv);
    const durationMs = Date.now() - start;

    const heapAfter = heapMB();
    const heapDeltaMB = heapAfter - heapBefore;

    console.log(`[Test 2] rows=${result.rows.length} hasAmounts=${result.hasAmounts} duration=${(durationMs / 1000).toFixed(2)}s heapDelta=${heapDeltaMB}MB`);

    expect(result.rows).toHaveLength(ROW_COUNT);
    expect(result.hasAmounts).toBe(true);

    // Spot-check amounts at first, middle, and last row
    expect(result.rows[0].amount).toBe('1');
    expect(result.rows[999_999].amount).toBe('1000000');
    expect(result.rows[ROW_COUNT - 1].amount).toBe(String(ROW_COUNT));

    // detectAmountFormat should return 'integer' for these integer strings
    const sampleAmounts = result.rows.slice(0, 1_000).map((r) => r.amount as string);
    const format = detectAmountFormat(sampleAmounts);
    expect(format).toBe('integer');

    assertDuration('parse with amounts', durationMs, 30_000);
  });

  it('Test 3: validates 2M addresses', () => {
    // Build rows directly to avoid CSV-parsing overhead within this timing window
    const rows: CSVRow[] = [];
    for (let i = 1; i <= ROW_COUNT; i++) {
      rows.push({ address: generateAddress(i) as Address, amount: null });
    }

    const heapBefore = heapMB();
    const start = Date.now();
    const result = validateAddresses(rows);
    const durationMs = Date.now() - start;
    const heapAfter = heapMB();

    console.log(`[Test 3] valid=${result.valid.length} invalid=${result.invalid.length} duration=${(durationMs / 1000).toFixed(2)}s heapDelta=${heapAfter - heapBefore}MB`);

    expect(result.valid).toHaveLength(ROW_COUNT);
    expect(result.invalid).toHaveLength(0);

    assertDuration('validateAddresses', durationMs, 10_000);
  });

  it('Test 4: deduplicates 2M rows with 50% duplicates', () => {
    // First 1M unique, second 1M repeat first 1M
    const rows: CSVRow[] = [];
    for (let i = 1; i <= ROW_COUNT / 2; i++) {
      rows.push({ address: generateAddress(i) as Address, amount: String(i) });
    }
    for (let i = 1; i <= ROW_COUNT / 2; i++) {
      rows.push({ address: generateAddress(i) as Address, amount: String(i + ROW_COUNT) });
    }

    const heapBefore = heapMB();
    const start = Date.now();
    const deduplicated = deduplicateAddresses(rows);
    const durationMs = Date.now() - start;
    const heapAfter = heapMB();

    console.log(`[Test 4] unique=${deduplicated.length} duration=${(durationMs / 1000).toFixed(2)}s heapDelta=${heapAfter - heapBefore}MB`);

    expect(deduplicated).toHaveLength(ROW_COUNT / 2);

    // Verify first occurrence is kept (amount should be i, not i + ROW_COUNT)
    expect(deduplicated[0].amount).toBe('1');
    expect(deduplicated[ROW_COUNT / 2 - 1].amount).toBe(String(ROW_COUNT / 2));

    assertDuration('deduplicateAddresses', durationMs, 10_000);
  });

  it('Test 5: flagConflicts on 2M rows with 100 decimal injections', () => {
    const CONFLICT_COUNT = 100;
    const rows: CSVRow[] = [];

    // Pre-compute which indices will hold decimal values
    // Spread them evenly across the 2M rows
    const conflictIndices = new Set<number>();
    for (let c = 0; c < CONFLICT_COUNT; c++) {
      conflictIndices.add(Math.floor((c * ROW_COUNT) / CONFLICT_COUNT));
    }

    for (let i = 0; i < ROW_COUNT; i++) {
      const amount = conflictIndices.has(i) ? '1.5' : String(i + 1);
      rows.push({ address: generateAddress(i + 1) as Address, amount });
    }

    const heapBefore = heapMB();
    const start = Date.now();
    const result = flagConflicts(rows, 'integer');
    const durationMs = Date.now() - start;
    const heapAfter = heapMB();

    console.log(`[Test 5] conflicts=${result.conflicts.length} duration=${(durationMs / 1000).toFixed(2)}s heapDelta=${heapAfter - heapBefore}MB`);

    expect(result.conflicts).toHaveLength(CONFLICT_COUNT);

    // Verify each conflict index matches what we injected
    const conflictIndexArray = Array.from(conflictIndices).sort((a, b) => a - b);
    const foundIndices = result.conflicts.map((c) => c.index).sort((a, b) => a - b);
    expect(foundIndices).toEqual(conflictIndexArray);

    assertDuration('flagConflicts', durationMs, 10_000);
  });

  it('Test 6: full pipeline — parse → validate → dedup → detectFormat → flagConflicts', () => {
    const DUPLICATE_FRACTION = 0.1; // 10% duplicates
    const DECIMAL_CONFLICT_COUNT = 50;
    const UNIQUE_COUNT = Math.round(ROW_COUNT * (1 - DUPLICATE_FRACTION));
    const DUPLICATE_COUNT = ROW_COUNT - UNIQUE_COUNT;

    // Build CSV: unique rows + duplicated rows (repeat first DUPLICATE_COUNT unique addresses)
    const lines: string[] = ['address,amount'];
    const decimalIndices = new Set<number>();

    // Spread decimal conflicts across unique rows
    for (let c = 0; c < DECIMAL_CONFLICT_COUNT; c++) {
      decimalIndices.add(Math.floor((c * UNIQUE_COUNT) / DECIMAL_CONFLICT_COUNT));
    }

    for (let i = 0; i < UNIQUE_COUNT; i++) {
      const addr = generateAddress(i + 1);
      const amount = decimalIndices.has(i) ? '1.5' : String(i + 1);
      lines.push(`${addr},${amount}`);
    }

    // Repeat first DUPLICATE_COUNT unique addresses
    for (let i = 0; i < DUPLICATE_COUNT; i++) {
      const addr = generateAddress(i + 1);
      lines.push(`${addr},${i + 1}`);
    }

    const csv = lines.join('\n');
    const pipelineStart = Date.now();

    // Step 1: Parse
    const t0 = Date.now();
    const parsed = parseCSV(csv);
    const parseMs = Date.now() - t0;
    console.log(`[Test 6] parse: rows=${parsed.rows.length} (${(parseMs / 1000).toFixed(2)}s)`);

    // Step 2: Validate
    const t1 = Date.now();
    const validated = validateAddresses(parsed.rows);
    const validateMs = Date.now() - t1;
    console.log(`[Test 6] validate: valid=${validated.valid.length} invalid=${validated.invalid.length} (${(validateMs / 1000).toFixed(2)}s)`);

    // Step 3: Deduplicate
    const t2 = Date.now();
    const deduped = deduplicateAddresses(validated.valid);
    const dedupMs = Date.now() - t2;
    console.log(`[Test 6] dedup: unique=${deduped.length} (${(dedupMs / 1000).toFixed(2)}s)`);

    // Step 4: Detect amount format
    const t3 = Date.now();
    const amounts = deduped.filter((r) => r.amount !== null).map((r) => r.amount as string);
    const format = detectAmountFormat(amounts);
    const detectMs = Date.now() - t3;
    console.log(`[Test 6] detectFormat: format=${format} (${(detectMs / 1000).toFixed(2)}s)`);

    // Step 5: Flag conflicts
    const t4 = Date.now();
    const conflicts = flagConflicts(deduped, 'integer');
    const conflictMs = Date.now() - t4;
    const totalMs = Date.now() - pipelineStart;
    console.log(`[Test 6] flagConflicts: conflicts=${conflicts.conflicts.length} (${(conflictMs / 1000).toFixed(2)}s)`);
    console.log(`[Test 6] TOTAL pipeline: ${(totalMs / 1000).toFixed(2)}s`);

    // --- Assertions ---

    // After parsing: all ROW_COUNT rows should be present (valid addresses)
    expect(parsed.rows).toHaveLength(ROW_COUNT);
    expect(parsed.hasAmounts).toBe(true);

    // All generated addresses are valid, so no invalids
    expect(validated.invalid).toHaveLength(0);
    expect(validated.valid).toHaveLength(ROW_COUNT);

    // After dedup: only UNIQUE_COUNT rows remain
    expect(deduped).toHaveLength(UNIQUE_COUNT);

    // detectAmountFormat: decimal conflicts exist, so should return 'decimal'
    expect(format).toBe('decimal');

    // flagConflicts with 'integer' should flag the DECIMAL_CONFLICT_COUNT decimal rows
    expect(conflicts.conflicts).toHaveLength(DECIMAL_CONFLICT_COUNT);

    // Performance bounds
    assertDuration('full pipeline parse', parseMs, 30_000);
    assertDuration('full pipeline validate', validateMs, 10_000);
    assertDuration('full pipeline dedup', dedupMs, 10_000);
    assertDuration('full pipeline total', totalMs, 60_000);
  });
});
