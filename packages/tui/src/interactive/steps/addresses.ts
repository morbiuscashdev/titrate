import { stat } from 'node:fs/promises';
import { text, select, confirm, isCancel } from '@clack/prompts';
import { parseCSV, resolveBlockRef } from '@titrate/sdk';
import type { CampaignStepResult } from './campaign.js';
import { formatCount } from '../format.js';

/** Describes how addresses will be sourced. */
export type AddressSource =
  | { readonly kind: 'csv'; readonly filePath: string; readonly mtimeMs: number }
  | { readonly kind: 'scan'; readonly startBlock: bigint; readonly endBlock: bigint; readonly extractField: 'tx.from' | 'tx.to' }
  | { readonly kind: 'both'; readonly filePath: string; readonly mtimeMs: number; readonly startBlock: bigint; readonly endBlock: bigint; readonly extractField: 'tx.from' | 'tx.to' };

/** The result of Step 2: Build Address List. */
export type AddressesStepResult = {
  readonly source: AddressSource;
  readonly addressCount: number;
};

/**
 * Counts unique addresses from a CSV file path.
 */
async function countCsvAddresses(filePath: string): Promise<number> {
  const { readFile } = await import('node:fs/promises');
  const raw = await readFile(filePath, 'utf8');
  const parsed = parseCSV(raw);
  const unique = new Set(parsed.rows.map((r) => r.address.toLowerCase()));
  return unique.size;
}

/**
 * Step 2: Build Address List.
 * Collects source configuration (CSV, block scan, or both).
 *
 * @param campaign - Result from Step 1
 * @returns Address source config and count, or a clack cancel symbol
 */
export async function addressesStep(
  campaign: CampaignStepResult,
): Promise<AddressesStepResult | symbol> {
  const sourceChoice = await select({
    message: 'Address source',
    options: [
      { value: 'csv', label: 'CSV file' },
      { value: 'scan', label: 'Block scan' },
      { value: 'both', label: 'Both — union of CSV and block scan' },
    ],
  });
  if (isCancel(sourceChoice)) return sourceChoice;

  let csvFilePath: string | null = null;
  let csvMtimeMs = 0;
  let csvCount = 0;

  if (sourceChoice === 'csv' || sourceChoice === 'both') {
    const filePath = await text({
      message: 'CSV file path',
      placeholder: './addresses.csv',
      validate: (v) => (v.trim().length === 0 ? 'File path required.' : undefined),
    });
    if (isCancel(filePath)) return filePath;

    const fp = (filePath as string).trim();

    // Validate file exists and record mtime
    try {
      const stats = await stat(fp);
      csvMtimeMs = stats.mtimeMs;
    } catch {
      return Symbol('cancel'); // file not accessible — treat as cancel-like
    }

    process.stdout.write('  Reading CSV...\n');
    csvCount = await countCsvAddresses(fp);
    process.stdout.write(`  Found ${formatCount(csvCount)} unique addresses from CSV\n`);
    csvFilePath = fp;
  }

  let startBlock: bigint | null = null;
  let endBlock: bigint | null = null;
  let extractField: 'tx.from' | 'tx.to' = 'tx.from';
  let scanCount = 0;

  if (sourceChoice === 'scan' || sourceChoice === 'both') {
    const startInput = await text({
      message: 'Scan start (block number or YYYY-MM-DD)',
      placeholder: '19000000',
      validate: (v) => (v.trim().length === 0 ? 'Required.' : undefined),
    });
    if (isCancel(startInput)) return startInput;

    const endInput = await text({
      message: 'Scan end (block number or YYYY-MM-DD)',
      placeholder: '19100000',
      validate: (v) => (v.trim().length === 0 ? 'Required.' : undefined),
    });
    if (isCancel(endInput)) return endInput;

    const extractChoice = await select({
      message: 'Extract addresses from',
      options: [
        { value: 'tx.from', label: 'tx.from — transaction senders' },
        { value: 'tx.to', label: 'tx.to — transaction recipients' },
      ],
    });
    if (isCancel(extractChoice)) return extractChoice;

    startBlock = await resolveBlockRef(startInput as string, campaign.publicClient);
    endBlock = await resolveBlockRef(endInput as string, campaign.publicClient);
    extractField = extractChoice as 'tx.from' | 'tx.to';

    // Scan count is unknown until execution — report 0 for now, updated in filters step
    process.stdout.write(
      `  Block scan configured: ${startBlock.toString()} → ${endBlock.toString()} (${extractField})\n`,
    );
  }

  let source: AddressSource;
  let addressCount: number;

  if (sourceChoice === 'csv') {
    source = { kind: 'csv', filePath: csvFilePath!, mtimeMs: csvMtimeMs };
    addressCount = csvCount;
  } else if (sourceChoice === 'scan') {
    source = {
      kind: 'scan',
      startBlock: startBlock!,
      endBlock: endBlock!,
      extractField,
    };
    addressCount = 0; // scan count resolved during pipeline execution
  } else {
    source = {
      kind: 'both',
      filePath: csvFilePath!,
      mtimeMs: csvMtimeMs,
      startBlock: startBlock!,
      endBlock: endBlock!,
      extractField,
    };
    addressCount = csvCount; // scan addresses add to this during pipeline
  }

  process.stdout.write(`  Source configured.\n`);

  return { source, addressCount };
}

/**
 * Checks if a CSV file's mtime has changed since it was last read.
 * If so, prompts the user to confirm reload.
 *
 * @param filePath - Path to the CSV file
 * @param knownMtimeMs - The mtime recorded when the file was first read
 * @returns `true` if the file should be re-read, `false` to use stale data
 */
export async function checkCsvStaleness(
  filePath: string,
  knownMtimeMs: number,
): Promise<boolean> {
  const stats = await stat(filePath);
  if (stats.mtimeMs <= knownMtimeMs) return false;

  const shouldReload = await confirm({
    message: `${filePath} has changed since last read. Reload?`,
    initialValue: true,
  });
  if (isCancel(shouldReload)) return false;
  return shouldReload as boolean;
}
