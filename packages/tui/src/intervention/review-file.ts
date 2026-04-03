import { readFile, writeFile } from 'node:fs/promises';
import type { Address } from 'viem';
import type { ValidationIssue } from '@titrate/sdk';

/** Status label for a data row in the review CSV. */
type RowStatus = 'OK' | 'REVIEW';

/** Result of reading back a review CSV file. */
export type ReviewFileResult = {
  readonly addresses: Address[];
  readonly amounts?: bigint[];
};

/**
 * Determines which rows have associated validation issues.
 * Returns a Set of row indices that need review.
 */
function buildReviewRowSet(issues: readonly ValidationIssue[]): Set<number> {
  const set = new Set<number>();
  for (const issue of issues) {
    if (issue.row >= 0) {
      set.add(issue.row);
    }
  }
  return set;
}

/**
 * Collects issue messages keyed by row index.
 */
function buildIssueMessageMap(issues: readonly ValidationIssue[]): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (const issue of issues) {
    if (issue.row < 0) continue;
    const existing = map.get(issue.row);
    if (existing !== undefined) {
      existing.push(issue.message);
    } else {
      map.set(issue.row, [issue.message]);
    }
  }
  return map;
}

/**
 * Escapes a CSV field — wraps in quotes when the value contains a comma,
 * double-quote, or newline.
 */
function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Builds the header comment block summarising issue counts.
 */
function buildHeaderComments(issues: readonly ValidationIssue[]): string {
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  const lines = [
    '# REVIEW REQUIRED',
    `# ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}`,
    '# Remove rows you want to exclude. Do not edit comment lines.',
  ];
  return lines.join('\n');
}

/**
 * Writes an annotated CSV review file.
 *
 * Format:
 *   - Comment block with error/warning counts
 *   - Column header row: status,address[,amount],issue
 *   - One data row per address; status = REVIEW when the row has issues, OK otherwise
 *
 * @param filePath  Destination file path.
 * @param addresses Addresses to write.
 * @param issues    Validation issues to annotate — matched to rows by `issue.row`.
 * @param amounts   Optional parallel amounts array.
 */
export async function writeReviewFile(
  filePath: string,
  addresses: readonly Address[],
  issues: readonly ValidationIssue[],
  amounts?: readonly bigint[],
): Promise<void> {
  const reviewRows = buildReviewRowSet(issues);
  const issueMessages = buildIssueMessageMap(issues);
  const hasAmounts = amounts !== undefined && amounts.length > 0;

  const headerComment = buildHeaderComments(issues);
  const columnHeader = hasAmounts ? 'status,address,amount,issue' : 'status,address,issue';

  const dataRows = addresses.map((address, index) => {
    const status: RowStatus = reviewRows.has(index) ? 'REVIEW' : 'OK';
    const messages = issueMessages.get(index) ?? [];
    const issueText = escapeCsvField(messages.join('; '));

    if (hasAmounts) {
      const amount = amounts![index] ?? 0n;
      return `${status},${address},${amount},${issueText}`;
    }
    return `${status},${address},${issueText}`;
  });

  const content = [headerComment, columnHeader, ...dataRows].join('\n') + '\n';
  await writeFile(filePath, content, 'utf8');
}

/**
 * Reads a review CSV file back, skipping comment lines (`#`) and empty lines.
 *
 * Parses addresses from column index 1 (zero-based) and optional amounts from
 * column index 2 when the header declares an `amount` column.
 *
 * @param filePath Source file path.
 * @returns Parsed addresses and optional amounts.
 */
export async function readReviewFile(filePath: string): Promise<ReviewFileResult> {
  const raw = await readFile(filePath, 'utf8');
  const lines = raw.split('\n');

  let hasAmountColumn = false;
  const addresses: Address[] = [];
  const amounts: bigint[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comment lines and empty lines
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // Detect the column header row — never contains a 0x address in col 1
    if (trimmed.startsWith('status,')) {
      hasAmountColumn = trimmed.includes(',amount,') || trimmed.endsWith(',amount');
      continue;
    }

    // Data row: split on first few commas only
    const parts = trimmed.split(',');
    const address = parts[1]?.trim() as Address | undefined;

    if (address === undefined || !address.startsWith('0x')) continue;

    addresses.push(address);

    if (hasAmountColumn) {
      const rawAmount = parts[2]?.trim() ?? '0';
      amounts.push(BigInt(rawAmount));
    }
  }

  if (!hasAmountColumn) {
    return { addresses };
  }
  return { addresses, amounts };
}
