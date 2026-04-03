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
