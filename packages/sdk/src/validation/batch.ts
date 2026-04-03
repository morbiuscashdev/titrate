// packages/sdk/src/validation/batch.ts
import type { Address } from 'viem';
import type { ValidationIssue } from './types.js';
import { LENGTH_MISMATCH } from './types.js';
import { validateAddresses } from './addresses.js';
import { validateAmounts } from './amounts.js';

export function validateBatch(recipients: readonly Address[], amounts: readonly bigint[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (recipients.length !== amounts.length) {
    issues.push({
      severity: 'error',
      row: -1,
      field: 'batch',
      value: `${recipients.length}/${amounts.length}`,
      message: 'Recipient count does not match amount count',
      code: LENGTH_MISMATCH,
    });
  }
  issues.push(...validateAddresses(recipients), ...validateAmounts(amounts));
  const order = { error: 0, warning: 1, info: 2 } as const;
  issues.sort((a, b) => order[a.severity] - order[b.severity]);
  return issues;
}
