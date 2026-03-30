import { select, confirm, text, isCancel } from '@clack/prompts';
import { detectAmountFormat, parseCSV, decimalToInteger, parseVariableAmounts } from '@titrate/sdk';
import type { Address } from 'viem';
import type { AddressesStepResult } from './addresses.js';
import type { CampaignStepResult } from './campaign.js';
import { formatCount, formatToken } from '../format.js';
import { checkCsvStaleness } from './addresses.js';

/** Describes the resolved amount configuration. */
export type AmountsStepResult =
  | {
      readonly mode: 'variable';
      readonly amounts: readonly bigint[];
      readonly format: 'integer' | 'decimal';
      readonly totalAmount: bigint;
    }
  | {
      readonly mode: 'uniform';
      readonly uniformAmount: bigint;
      readonly format: 'integer' | 'decimal';
      readonly totalAmount: bigint;
    };

/**
 * Step 4: Configure Amounts.
 * Detects variable amounts from CSV or prompts for a uniform amount.
 *
 * @param campaign - Result from Step 1
 * @param addresses - Result from Step 2 (for CSV re-read)
 * @param filteredAddresses - Final address list from Step 3
 * @returns Amount config or a clack cancel symbol
 */
export async function amountsStep(
  campaign: CampaignStepResult,
  addresses: AddressesStepResult,
  filteredAddresses: readonly Address[],
): Promise<AmountsStepResult | symbol> {
  const { tokenDecimals, tokenSymbol } = campaign;
  const { source } = addresses;

  // Check if CSV source had an amount column
  let csvAmounts: readonly (string | null)[] = [];
  let hasCsvAmounts = false;

  if (source.kind === 'csv' || source.kind === 'both') {
    const filePath = source.filePath;
    const shouldReload = await checkCsvStaleness(filePath, source.mtimeMs);
    if (shouldReload) {
      process.stdout.write(`  Reloading ${filePath}...\n`);
    }

    const { readFile } = await import('node:fs/promises');
    const raw = await readFile(filePath, 'utf8');
    const parsed = parseCSV(raw);

    const amountsFromCsv = parsed.rows.map((r) => r.amount);
    hasCsvAmounts = amountsFromCsv.some((a) => a !== null);

    if (hasCsvAmounts) {
      csvAmounts = amountsFromCsv;
    }
  }

  if (hasCsvAmounts) {
    // --- Variable amounts path ---
    const nonNull = (csvAmounts as readonly (string | null)[]).filter((a): a is string => a !== null);
    const detected = detectAmountFormat(nonNull);
    const decimalCount = nonNull.filter((a) => a.includes('.')).length;

    process.stdout.write(`  Detected format: ${detected} (${decimalCount} row${decimalCount !== 1 ? 's' : ''} have decimals)\n`);

    const useDecimal = await confirm({
      message: `Use decimal format? (${detected === 'decimal' ? 'recommended' : 'not recommended — most values are integers'})`,
      initialValue: detected === 'decimal',
    });
    if (isCancel(useDecimal)) return useDecimal;

    const format: 'integer' | 'decimal' = (useDecimal as boolean) ? 'decimal' : 'integer';

    // Detect conflicts: rows with decimals when integer mode selected
    if (format === 'integer') {
      const conflictCount = nonNull.filter((a) => a.includes('.')).length;
      if (conflictCount > 0) {
        process.stdout.write(
          `  Warning: ${conflictCount} row${conflictCount !== 1 ? 's' : ''} have decimal values but integer mode is selected.\n`,
        );
        const proceed = await confirm({
          message: 'Continue anyway? (decimal parts will be truncated)',
          initialValue: false,
        });
        if (isCancel(proceed)) return proceed;
        if (!(proceed as boolean)) return Symbol('cancel');
      }
    }

    const amounts = parseVariableAmounts(csvAmounts, format, tokenDecimals);
    const totalAmount = amounts.reduce((sum, a) => sum + a, 0n);

    process.stdout.write(
      `  Total: ${formatToken(totalAmount, tokenDecimals, tokenSymbol)} across ${formatCount(filteredAddresses.length)} recipients\n`,
    );

    return { mode: 'variable', amounts, format, totalAmount };
  }

  // --- Uniform amount path ---
  const rawAmount = await text({
    message: 'Amount per recipient',
    placeholder: '1',
    validate: (v) => (v.trim().length === 0 ? 'Amount required.' : undefined),
  });
  if (isCancel(rawAmount)) return rawAmount;

  const amountFormat = await select({
    message: 'Is this amount in integer (raw units) or decimal (human readable)?',
    options: [
      {
        value: 'decimal',
        label: `Decimal — e.g. "1" means 1 ${tokenSymbol} (${tokenDecimals} decimals applied)`,
      },
      {
        value: 'integer',
        label: `Integer — raw smallest units (e.g. 1 = 10^-${tokenDecimals} ${tokenSymbol})`,
      },
    ],
  });
  if (isCancel(amountFormat)) return amountFormat;

  const format = amountFormat as 'integer' | 'decimal';
  const rawStr = (rawAmount as string).trim();

  const uniformAmount =
    format === 'decimal'
      ? decimalToInteger(rawStr, tokenDecimals)
      : BigInt(rawStr);

  const totalAmount = uniformAmount * BigInt(filteredAddresses.length);

  process.stdout.write(
    `  ${formatToken(uniformAmount, tokenDecimals, tokenSymbol)} × ${formatCount(filteredAddresses.length)} recipients = ${formatToken(totalAmount, tokenDecimals, tokenSymbol)} total\n`,
  );

  return { mode: 'uniform', uniformAmount, format, totalAmount };
}
