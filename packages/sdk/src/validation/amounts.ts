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
    if (a < 0n) {
      issues.push({ severity: 'error', row: i, field: 'amount', value: a.toString(), message: 'Amount is negative', code: NEGATIVE_AMOUNT });
      continue;
    }
    if (a === 0n) {
      issues.push({ severity: 'warning', row: i, field: 'amount', value: '0', message: 'Amount is zero', code: ZERO_AMOUNT });
    }
    if (options?.largeAmountThreshold !== undefined && a > options.largeAmountThreshold) {
      issues.push({ severity: 'warning', row: i, field: 'amount', value: a.toString(), message: `Amount exceeds threshold (${options.largeAmountThreshold})`, code: LARGE_AMOUNT });
    }
  }
  const order = { error: 0, warning: 1, info: 2 } as const;
  issues.sort((a, b) => order[a.severity] - order[b.severity]);
  return issues;
}
