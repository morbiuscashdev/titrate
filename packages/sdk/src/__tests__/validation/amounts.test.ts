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
