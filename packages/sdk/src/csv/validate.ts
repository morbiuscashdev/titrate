import type { CSVRow } from '../types.js';

const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

export type ValidationResult = {
  readonly valid: readonly CSVRow[];
  readonly invalid: readonly { readonly index: number; readonly row: CSVRow; readonly reason: string }[];
};

export function validateAddresses(rows: readonly CSVRow[]): ValidationResult {
  const valid: CSVRow[] = [];
  const invalid: { index: number; row: CSVRow; reason: string }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!ADDRESS_REGEX.test(row.address)) {
      invalid.push({ index: i, row, reason: `Invalid address: ${row.address}` });
    } else {
      valid.push(row);
    }
  }
  return { valid, invalid };
}

export function deduplicateAddresses(rows: readonly CSVRow[]): readonly CSVRow[] {
  const seen = new Set<string>();
  const result: CSVRow[] = [];
  for (const row of rows) {
    const normalized = row.address.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(row);
  }
  return result;
}
