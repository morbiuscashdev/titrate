import type { Address } from 'viem';
import type { CSVRow } from '../types.js';

export type ParsedCSV = {
  readonly rows: readonly CSVRow[];
  readonly hasAmounts: boolean;
};

const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

export function parseCSV(content: string): ParsedCSV {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length === 0) return { rows: [], hasAmounts: false };

  const firstLine = lines[0].toLowerCase();
  const hasHeader = firstLine.includes('address');
  const hasAmountColumn = firstLine.includes('amount');
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const rows: CSVRow[] = [];
  for (const line of dataLines) {
    const parts = line.split(',').map((p) => p.trim());
    const rawAddress = parts[0];
    if (!ADDRESS_REGEX.test(rawAddress)) continue;
    const address = rawAddress.toLowerCase() as Address;
    const amount = hasAmountColumn && parts.length > 1 ? parts[1] : null;
    rows.push({ address, amount });
  }

  return { rows, hasAmounts: hasAmountColumn };
}
