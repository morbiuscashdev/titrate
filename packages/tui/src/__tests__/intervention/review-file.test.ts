import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Address } from 'viem';
import type { ValidationIssue } from '@titrate/sdk';
import { writeReviewFile, readReviewFile } from '../../intervention/review-file.js';

const ADDR_A = '0x1111111111111111111111111111111111111111' as Address;
const ADDR_B = '0x2222222222222222222222222222222222222222' as Address;
const ADDR_C = '0x3333333333333333333333333333333333333333' as Address;

const ERROR_ISSUE: ValidationIssue = {
  severity: 'error',
  row: 0,
  field: 'address',
  value: ADDR_A,
  message: 'Duplicate of row 0',
  code: 'DUPLICATE_ADDRESS',
};

const WARN_ISSUE: ValidationIssue = {
  severity: 'warning',
  row: 1,
  field: 'amount',
  value: '0',
  message: 'Amount is zero',
  code: 'ZERO_AMOUNT',
};

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'titrate-review-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('writeReviewFile', () => {
  it('writes a file that exists on disk', async () => {
    const filePath = join(tmpDir, 'review.csv');
    await writeReviewFile(filePath, [ADDR_A, ADDR_B], [ERROR_ISSUE]);
    const content = await readFile(filePath, 'utf8');
    expect(content.length).toBeGreaterThan(0);
  });

  it('includes the REVIEW REQUIRED header comment', async () => {
    const filePath = join(tmpDir, 'review.csv');
    await writeReviewFile(filePath, [ADDR_A], [WARN_ISSUE]);
    const content = await readFile(filePath, 'utf8');
    expect(content).toContain('# REVIEW REQUIRED');
  });

  it('includes error and warning counts in comments', async () => {
    const filePath = join(tmpDir, 'review.csv');
    await writeReviewFile(filePath, [ADDR_A, ADDR_B], [ERROR_ISSUE, WARN_ISSUE]);
    const content = await readFile(filePath, 'utf8');
    expect(content).toContain('1 error');
    expect(content).toContain('1 warning');
  });

  it('includes all addresses in data rows', async () => {
    const filePath = join(tmpDir, 'review.csv');
    await writeReviewFile(filePath, [ADDR_A, ADDR_B, ADDR_C], []);
    const content = await readFile(filePath, 'utf8');
    expect(content).toContain(ADDR_A);
    expect(content).toContain(ADDR_B);
    expect(content).toContain(ADDR_C);
  });

  it('includes issue messages in the issue column', async () => {
    const filePath = join(tmpDir, 'review.csv');
    await writeReviewFile(filePath, [ADDR_A], [ERROR_ISSUE]);
    const content = await readFile(filePath, 'utf8');
    expect(content).toContain(ERROR_ISSUE.message);
  });

  it('writes amounts when provided', async () => {
    const filePath = join(tmpDir, 'review.csv');
    const amounts = [1000n, 2000n];
    await writeReviewFile(filePath, [ADDR_A, ADDR_B], [], amounts);
    const content = await readFile(filePath, 'utf8');
    expect(content).toContain('1000');
    expect(content).toContain('2000');
  });

  it('marks rows with issues as REVIEW status', async () => {
    const filePath = join(tmpDir, 'review.csv');
    await writeReviewFile(filePath, [ADDR_A, ADDR_B], [ERROR_ISSUE]);
    const content = await readFile(filePath, 'utf8');
    expect(content).toContain('REVIEW');
  });

  it('marks rows without issues as OK status', async () => {
    const filePath = join(tmpDir, 'review.csv');
    await writeReviewFile(filePath, [ADDR_A, ADDR_B], []);
    const content = await readFile(filePath, 'utf8');
    expect(content).toContain('OK');
  });
});

describe('readReviewFile', () => {
  it('reads back all addresses written', async () => {
    const filePath = join(tmpDir, 'review.csv');
    await writeReviewFile(filePath, [ADDR_A, ADDR_B, ADDR_C], []);
    const result = await readReviewFile(filePath);
    expect(result.addresses).toHaveLength(3);
    expect(result.addresses).toContain(ADDR_A);
    expect(result.addresses).toContain(ADDR_B);
    expect(result.addresses).toContain(ADDR_C);
  });

  it('reads back amounts when written', async () => {
    const filePath = join(tmpDir, 'review.csv');
    const amounts = [500n, 1500n];
    await writeReviewFile(filePath, [ADDR_A, ADDR_B], [], amounts);
    const result = await readReviewFile(filePath);
    expect(result.amounts).toBeDefined();
    expect(result.amounts).toHaveLength(2);
    expect(result.amounts?.[0]).toBe(500n);
    expect(result.amounts?.[1]).toBe(1500n);
  });

  it('returns undefined amounts when none were written', async () => {
    const filePath = join(tmpDir, 'review.csv');
    await writeReviewFile(filePath, [ADDR_A], []);
    const result = await readReviewFile(filePath);
    expect(result.amounts).toBeUndefined();
  });

  it('skips comment lines starting with #', async () => {
    const filePath = join(tmpDir, 'review.csv');
    await writeReviewFile(filePath, [ADDR_A, ADDR_B], [WARN_ISSUE]);
    const result = await readReviewFile(filePath);
    // All returned addresses must be valid hex addresses, not comment text
    for (const addr of result.addresses) {
      expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
  });

  it('skips empty lines', async () => {
    const filePath = join(tmpDir, 'review.csv');
    // Manually write a file with extra blank lines
    const content = [
      '# REVIEW REQUIRED',
      '',
      'status,address,issue',
      '',
      `OK,${ADDR_A},`,
      '',
      `OK,${ADDR_B},`,
      '',
    ].join('\n');
    await writeFile(filePath, content, 'utf8');
    const result = await readReviewFile(filePath);
    expect(result.addresses).toHaveLength(2);
  });

  it('reflects user-deleted rows — fewer addresses returned', async () => {
    const filePath = join(tmpDir, 'review.csv');
    await writeReviewFile(filePath, [ADDR_A, ADDR_B, ADDR_C], []);
    // Simulate user removing ADDR_B by rewriting without that row
    const original = await readFile(filePath, 'utf8');
    const filtered = original
      .split('\n')
      .filter((line) => !line.includes(ADDR_B))
      .join('\n');
    await writeFile(filePath, filtered, 'utf8');
    const result = await readReviewFile(filePath);
    expect(result.addresses).toHaveLength(2);
    expect(result.addresses).not.toContain(ADDR_B);
  });

  it('returns empty arrays for a file with only comments', async () => {
    const filePath = join(tmpDir, 'review.csv');
    await writeFile(filePath, '# REVIEW REQUIRED\n# 0 errors, 0 warnings\n', 'utf8');
    const result = await readReviewFile(filePath);
    expect(result.addresses).toHaveLength(0);
    expect(result.amounts).toBeUndefined();
  });
});
