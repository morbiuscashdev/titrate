import { text, multiselect, isCancel } from '@clack/prompts';
import { parseCSV, createPipeline } from '@titrate/sdk';
import type { Address } from 'viem';
import type { CampaignStepResult } from './campaign.js';
import type { AddressesStepResult } from './addresses.js';
import { checkCsvStaleness } from './addresses.js';
import { formatCount } from '../format.js';

/** A single filter selection from the multiselect. */
type FilterChoice =
  | 'contract-check'
  | 'min-balance'
  | 'nonce-range'
  | 'token-recipients'
  | 'csv-exclusion';

/** The result of Step 3: Apply Filters. */
export type FiltersStepResult = {
  readonly addresses: readonly Address[];
  readonly addressCount: number;
};

/**
 * Builds pipeline sources from the address source config.
 * Handles CSV file reload if the file has changed.
 */
async function buildPipelineSources(
  pipeline: ReturnType<typeof createPipeline>,
  addresses: AddressesStepResult,
): Promise<void> {
  const { source } = addresses;

  if (source.kind === 'csv' || source.kind === 'both') {
    const filePath = source.filePath;
    const shouldReload = await checkCsvStaleness(filePath, source.mtimeMs);
    if (shouldReload) {
      process.stdout.write(`  Reloading ${filePath}...\n`);
    }

    const { readFile } = await import('node:fs/promises');
    const raw = await readFile(filePath, 'utf8');
    const parsed = parseCSV(raw);
    const addrs = parsed.rows.map((r) => r.address as string);
    pipeline.addSource('csv', { addresses: addrs });
  }

  if (source.kind === 'scan' || source.kind === 'both') {
    pipeline.addSource('block-scan', {
      startBlock: source.startBlock.toString(),
      endBlock: source.endBlock.toString(),
      extract: source.extractField,
    });
  }
}

/**
 * Step 3: Apply Filters.
 * Multi-selects filter options, collects their parameters, executes pipeline,
 * and displays a step-by-step summary.
 *
 * @param campaign - Result from Step 1
 * @param addresses - Result from Step 2
 * @returns Final filtered address list or a clack cancel symbol
 */
export async function filtersStep(
  campaign: CampaignStepResult,
  addresses: AddressesStepResult,
): Promise<FiltersStepResult | symbol> {
  const selectedFilters = await multiselect({
    message: 'Select filters to apply (space to toggle, enter to confirm)',
    options: [
      { value: 'contract-check', label: 'Remove contract addresses' },
      { value: 'min-balance', label: 'Minimum native balance' },
      { value: 'nonce-range', label: 'Nonce range (filter by transaction count)' },
      { value: 'token-recipients', label: 'Exclude token recipients' },
      { value: 'csv-exclusion', label: 'Exclude addresses from CSV file' },
    ],
    required: false,
  });
  if (isCancel(selectedFilters)) return selectedFilters;

  const chosen = selectedFilters as FilterChoice[];

  // --- Collect parameters for each selected filter ---
  let minBalance: string | null = null;
  let nonceMin: string | null = null;
  let nonceMax: string | null = null;
  let excludeToken: string | null = null;
  let excludeStartBlock: string | null = null;
  let excludeEndBlock: string | null = null;
  let excludeCsvPath: string | null = null;
  let excludeAddresses: Address[] = [];

  if (chosen.includes('min-balance')) {
    const threshold = await text({
      message: 'Minimum balance threshold (in ether, e.g. 0.01)',
      placeholder: '0.01',
      validate: (v) => {
        const n = Number(v);
        return isNaN(n) || n < 0 ? 'Enter a non-negative number.' : undefined;
      },
    });
    if (isCancel(threshold)) return threshold;
    minBalance = (threshold as string).trim();
  }

  if (chosen.includes('nonce-range')) {
    const nonceMinInput = await text({
      message: 'Minimum nonce (inclusive)',
      placeholder: '1',
      validate: (v) => {
        const n = Number(v);
        return isNaN(n) || n < 0 ? 'Enter a non-negative integer.' : undefined;
      },
    });
    if (isCancel(nonceMinInput)) return nonceMinInput;

    const nonceMaxInput = await text({
      message: 'Maximum nonce (inclusive, leave blank for no upper bound)',
      placeholder: '1000',
    });
    if (isCancel(nonceMaxInput)) return nonceMaxInput;

    nonceMin = (nonceMinInput as string).trim();
    nonceMax = (nonceMaxInput as string).trim() || null;
  }

  if (chosen.includes('token-recipients')) {
    const tokenAddr = await text({
      message: 'Token address to exclude recipients of',
      placeholder: '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39',
      validate: (v) =>
        /^0x[0-9a-f]{40}$/i.test(v.trim()) ? undefined : 'Enter a valid 0x address.',
    });
    if (isCancel(tokenAddr)) return tokenAddr;

    const startBlk = await text({
      message: 'Scan start block for token transfer history',
      placeholder: '0',
      validate: (v) => (isNaN(Number(v)) ? 'Enter a block number.' : undefined),
    });
    if (isCancel(startBlk)) return startBlk;

    const endBlk = await text({
      message: 'Scan end block for token transfer history',
      placeholder: '999999999',
      validate: (v) => (isNaN(Number(v)) ? 'Enter a block number.' : undefined),
    });
    if (isCancel(endBlk)) return endBlk;

    excludeToken = (tokenAddr as string).trim();
    excludeStartBlock = (startBlk as string).trim();
    excludeEndBlock = (endBlk as string).trim();
  }

  if (chosen.includes('csv-exclusion')) {
    const csvPath = await text({
      message: 'CSV file of addresses to exclude',
      placeholder: './excluded.csv',
      validate: (v) => (v.trim().length === 0 ? 'File path required.' : undefined),
    });
    if (isCancel(csvPath)) return csvPath;

    excludeCsvPath = (csvPath as string).trim();
    const { readFile } = await import('node:fs/promises');
    const raw = await readFile(excludeCsvPath, 'utf8');
    const parsed = parseCSV(raw);
    excludeAddresses = parsed.rows.map((r) => r.address);
  }

  // --- Build and execute pipeline ---
  process.stdout.write('  Applying filters...\n');

  const pipeline = createPipeline();
  await buildPipelineSources(pipeline, addresses);

  if (chosen.includes('contract-check')) {
    pipeline.addFilter('contract-check', {});
  }
  if (chosen.includes('min-balance') && minBalance !== null) {
    pipeline.addFilter('min-balance', { minBalance });
  }
  if (chosen.includes('nonce-range')) {
    const params: Record<string, unknown> = { minNonce: Number(nonceMin) };
    if (nonceMax !== null) params['maxNonce'] = Number(nonceMax);
    pipeline.addFilter('nonce-range', params);
  }
  if (chosen.includes('token-recipients') && excludeToken !== null) {
    pipeline.addFilter('token-recipients', {
      token: excludeToken,
      startBlock: excludeStartBlock ?? '0',
      endBlock: excludeEndBlock ?? '999999999',
    });
  }
  if (chosen.includes('csv-exclusion') && excludeAddresses.length > 0) {
    pipeline.addFilter('csv-exclusion', { addresses: excludeAddresses });
  }

  // Track step-by-step progress counts for display
  let currentCount = addresses.addressCount;

  const allAddresses: Address[] = [];

  for await (const batch of pipeline.execute(campaign.publicClient, (event) => {
    if (event.type === 'filter') {
      const { filterName, inputCount, outputCount } = event;
      const removed = inputCount - outputCount;
      const isLast =
        chosen.length === 0 ||
        filterName === chosen[chosen.length - 1];
      const prefix = isLast ? '└' : '├';
      process.stdout.write(
        `  ${prefix} ${filterName}: ${formatCount(inputCount)} → ${formatCount(outputCount)} (-${formatCount(removed)})\n`,
      );
      currentCount = outputCount;
    }
    if (event.type === 'scan') {
      // Show progress for block scan source
      const { currentBlock, endBlock, addressesFound } = event;
      process.stdout.write(
        `\r  scanning... block ${currentBlock.toLocaleString()} / ${endBlock.toLocaleString()} — ${addressesFound} found`,
      );
    }
  })) {
    allAddresses.push(...batch);
  }

  // Newline after any scan progress
  process.stdout.write('\n');

  const uniqueAddresses = [...new Set(allAddresses.map((a) => a.toLowerCase()))] as Address[];
  process.stdout.write(`  Result: ${formatCount(uniqueAddresses.length)} eligible addresses\n`);

  return {
    addresses: uniqueAddresses,
    addressCount: uniqueAddresses.length,
  };
}
