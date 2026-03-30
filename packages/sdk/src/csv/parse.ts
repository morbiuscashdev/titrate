import type { Address } from 'viem';
import type { CSVRow } from '../types.js';

export type ParsedCSV = {
  readonly rows: readonly CSVRow[];
  readonly hasAmounts: boolean;
};

const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

/** Strips a UTF-8 BOM character from the start of a string if present. */
function stripBom(content: string): string {
  return content.startsWith('\uFEFF') ? content.slice(1) : content;
}

/**
 * Detects the delimiter used in the first non-comment, non-empty line.
 * Supports comma (`,`) and semicolon (`;`). Defaults to comma.
 */
function detectDelimiter(lines: readonly string[]): ',' | ';' {
  const firstDataLine = lines.find((line) => line.length > 0 && !line.startsWith('#'));
  if (!firstDataLine) return ',';
  const semicolonCount = (firstDataLine.match(/;/g) ?? []).length;
  const commaCount = (firstDataLine.match(/,/g) ?? []).length;
  return semicolonCount > commaCount ? ';' : ',';
}

/**
 * Parses a single RFC 4180 CSV line into fields using the given delimiter.
 * Supports:
 * - Quoted fields: `"value"`
 * - Embedded delimiters inside quoted fields: `"val,ue"`
 * - Escaped double-quotes inside quoted fields: `"val""ue"` → `val"ue`
 */
function parseFields(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        // Peek at next char to detect escaped quote
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        current += char;
        i++;
      }
    } else if (char === '"') {
      inQuotes = true;
      i++;
    } else if (char === delimiter) {
      fields.push(current.trim());
      current = '';
      i++;
    } else {
      current += char;
      i++;
    }
  }

  fields.push(current.trim());
  return fields;
}

/**
 * Parses CSV content into structured rows.
 *
 * Handles:
 * - BOM prefix (`\uFEFF`)
 * - RFC 4180 quoted fields with escaped quotes
 * - Comment lines starting with `#`
 * - Mixed line endings (`\r\n`, `\r`, `\n`)
 * - Auto-detected delimiter: `,` or `;`
 * - Trailing/leading whitespace in field values
 *
 * @param rawContent - Raw CSV string content
 * @returns Parsed rows and whether an amount column is present
 */
export function parseCSV(rawContent: string): ParsedCSV {
  const content = stripBom(rawContent);

  // Normalize all line endings to \n, then split
  const lines = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith('#'));

  if (lines.length === 0) return { rows: [], hasAmounts: false };

  const delimiter = detectDelimiter(lines);

  const firstLine = lines[0].toLowerCase();
  const hasHeader = firstLine.includes('address');
  const hasAmountColumn = firstLine.includes('amount');
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const rows: CSVRow[] = [];
  for (const line of dataLines) {
    const parts = parseFields(line, delimiter);
    const rawAddress = parts[0];
    if (!ADDRESS_REGEX.test(rawAddress)) continue;
    const address = rawAddress.toLowerCase() as Address;
    const amount = hasAmountColumn && parts.length > 1 ? parts[1] : null;
    rows.push({ address, amount });
  }

  return { rows, hasAmounts: hasAmountColumn };
}
