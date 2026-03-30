import type { CSVRow, AmountFormat } from '../types.js';

export function detectAmountFormat(values: readonly string[]): AmountFormat {
  if (values.length === 0) return 'integer';
  return values.some((v) => v.includes('.')) ? 'decimal' : 'integer';
}

export type ConflictResult = {
  readonly conflicts: readonly { readonly index: number; readonly value: string; readonly reason: string }[];
};

export function flagConflicts(rows: readonly CSVRow[], format: AmountFormat): ConflictResult {
  const conflicts: { index: number; value: string; reason: string }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const amount = rows[i].amount;
    if (amount === null) continue;
    if (format === 'integer' && amount.includes('.')) {
      conflicts.push({ index: i, value: amount, reason: `Expected integer but found decimal value: ${amount}` });
    }
    if (format === 'decimal' && !/^\d+(\.\d+)?$/.test(amount)) {
      conflicts.push({ index: i, value: amount, reason: `Invalid decimal format: ${amount}` });
    }
  }
  return { conflicts };
}
