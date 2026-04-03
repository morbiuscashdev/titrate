import { select, isCancel } from '@clack/prompts';
import { join } from 'node:path';
import type {
  InterventionHook,
  InterventionContext,
  InterventionAction,
  InterventionJournal,
  InterventionEntry,
} from '@titrate/sdk';
import {
  createSpotCheck,
  validateAddressSet,
  hasErrors,
  hasWarnings,
} from '@titrate/sdk';
import type { Address } from 'viem';
import { writeReviewFile, readReviewFile } from './review-file.js';
import { displaySpotCheck } from './spot-check-display.js';

// ─── public types ─────────────────────────────────────────────────────────────

export type InterventionHandlerOptions = {
  /** Directory where review CSV files are written. */
  readonly interventionDir: string;
  /** Journal for persisting every intervention decision. */
  readonly journal: InterventionJournal;
  /** Campaign identifier used for journal entries. */
  readonly campaignId: string;
  /** Base explorer URL for building address links in spot checks. */
  readonly explorerUrl: string;
  /** Optional token symbol for human-readable amount display. */
  readonly tokenSymbol?: string;
  /** Optional token decimal places for amount scaling. */
  readonly tokenDecimals?: number;
  /** Number of addresses to include in a spot check sample (default 5). */
  readonly spotCheckSampleSize?: number;
};

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Waits for the user to press Enter on stdin.
 * Used after writing a review CSV so the user can edit it externally.
 */
function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    process.stdin.once('data', () => resolve());
  });
}

/**
 * Logs an intervention decision to the journal.
 */
async function log(
  journal: InterventionJournal,
  campaignId: string,
  context: InterventionContext,
  actionType: InterventionAction['type'],
): Promise<void> {
  const entry: InterventionEntry = {
    timestamp: Date.now(),
    campaignId,
    point: context.point,
    action: actionType,
    issueCount: context.issues?.length ?? 0,
  };
  await journal.append(entry);
}

/**
 * Builds a unique review file path for a given intervention point.
 * Includes the batch index when present to avoid collisions.
 */
function reviewFilePath(
  interventionDir: string,
  context: InterventionContext,
  attempt: number,
): string {
  const suffix = context.batchIndex !== undefined ? `-batch${context.batchIndex}` : '';
  return join(interventionDir, `review-${context.point}${suffix}-attempt${attempt}.csv`);
}

// ─── full-review loop ─────────────────────────────────────────────────────────

/**
 * Writes a review CSV, waits for the user to edit it, reads it back,
 * re-validates, and loops until there are no errors.
 *
 * Returns a `replaceAll` action containing the cleaned address+amount set,
 * or `abort` if the user presses Ctrl+C during any prompt.
 */
async function runFullReviewLoop(
  context: InterventionContext,
  options: InterventionHandlerOptions,
): Promise<InterventionAction> {
  const addresses = (context.addresses ?? []) as Address[];
  const amounts = context.amounts;
  let attempt = 0;
  let currentAddresses = addresses;
  let currentAmounts = amounts;

  while (true) {
    attempt++;
    const filePath = reviewFilePath(options.interventionDir, context, attempt);

    const issues = context.issues ?? [];
    await writeReviewFile(filePath, currentAddresses, issues, currentAmounts);

    console.log(`\nReview file written to:\n  ${filePath}\n`);
    console.log('Edit the file: remove rows you want to exclude, then press Enter to continue…');

    await waitForEnter();

    const reviewed = await readReviewFile(filePath);
    currentAddresses = reviewed.addresses;
    currentAmounts = reviewed.amounts;

    // Re-validate the edited address set
    const revalidated = validateAddressSet(currentAddresses);

    if (!hasErrors(revalidated)) {
      // Clean — return the edited data
      return {
        type: 'replaceAll',
        addresses: currentAddresses,
        amounts: currentAmounts ?? [],
      };
    }

    // Still has errors — loop
    console.log(
      `\n${revalidated.filter((i) => i.severity === 'error').length} error(s) remain — please fix and try again.`,
    );
  }
}

// ─── point-specific handlers ──────────────────────────────────────────────────

/**
 * Handles validation-error and validation-warning intervention points.
 * Goes directly to the full file review loop.
 */
async function handleValidationPoint(
  context: InterventionContext,
  options: InterventionHandlerOptions,
): Promise<InterventionAction> {
  const issues = context.issues ?? [];
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warnCount = issues.filter((i) => i.severity === 'warning').length;

  console.log(`\nValidation issues found: ${errorCount} error(s), ${warnCount} warning(s).`);

  const action = await runFullReviewLoop(context, options);
  await log(options.journal, options.campaignId, context, action.type);
  return action;
}

/**
 * Handles stuck-transaction intervention: bump gas, wait, or abort.
 */
async function handleStuckTransaction(
  context: InterventionContext,
  options: InterventionHandlerOptions,
): Promise<InterventionAction> {
  const txHash = context.txHash ?? '(unknown)';
  console.log(`\nTransaction stuck: ${txHash}`);

  const choice = await select({
    message: 'Stuck transaction — what would you like to do?',
    options: [
      { value: 'bumpGas', label: 'Bump gas — resubmit with 1.2× gas multiplier' },
      { value: 'pause', label: 'Wait — leave it pending and check again later' },
      { value: 'abort', label: 'Abort — cancel the run' },
    ],
  });

  if (isCancel(choice)) {
    await log(options.journal, options.campaignId, context, 'abort');
    return { type: 'abort' };
  }

  const actionType = choice as 'bumpGas' | 'pause' | 'abort';
  await log(options.journal, options.campaignId, context, actionType);

  if (actionType === 'bumpGas') {
    return { type: 'bumpGas', multiplier: 1.2 };
  }
  if (actionType === 'pause') {
    return { type: 'pause' };
  }
  return { type: 'abort' };
}

/**
 * Handles a failed batch-result: retry, skip, or abort.
 */
async function handleBatchResult(
  context: InterventionContext,
  options: InterventionHandlerOptions,
): Promise<InterventionAction> {
  const batchLabel =
    context.batchIndex !== undefined ? `batch #${context.batchIndex}` : 'batch';
  console.log(`\n${batchLabel} failed.`);

  const choice = await select({
    message: 'Batch failed — what would you like to do?',
    options: [
      { value: 'retry', label: 'Retry — resubmit this batch' },
      { value: 'skip', label: 'Skip — mark as failed and continue' },
      { value: 'abort', label: 'Abort — cancel the run' },
    ],
  });

  if (isCancel(choice)) {
    await log(options.journal, options.campaignId, context, 'abort');
    return { type: 'abort' };
  }

  const actionType = choice as 'retry' | 'skip' | 'abort';
  await log(options.journal, options.campaignId, context, actionType);
  return { type: actionType };
}

/**
 * Handles data-review intervention points (address-review, filter-review,
 * amount-review, batch-preview).
 *
 * Shows a spot check first. The user can approve, reroll for another sample,
 * escalate to a full file review, or abort.
 */
async function handleDataReviewPoint(
  context: InterventionContext,
  options: InterventionHandlerOptions,
): Promise<InterventionAction> {
  const addresses = (context.addresses ?? []) as Address[];
  const amounts = context.amounts;
  const sampleSize = options.spotCheckSampleSize ?? 5;

  while (true) {
    const spotCheck = createSpotCheck(addresses, options.explorerUrl, {
      sampleSize,
      amounts,
    });

    const choice = await displaySpotCheck(spotCheck, options.tokenSymbol, options.tokenDecimals);

    if (choice === 'approve') {
      await log(options.journal, options.campaignId, context, 'approve');
      return { type: 'approve' };
    }

    if (choice === 'abort') {
      await log(options.journal, options.campaignId, context, 'abort');
      return { type: 'abort' };
    }

    if (choice === 'reroll') {
      // Loop again — createSpotCheck uses Math.random() without seed,
      // so each call produces a fresh sample.
      await log(options.journal, options.campaignId, context, 'reroll');
      continue;
    }

    if (choice === 'fullReview') {
      await log(options.journal, options.campaignId, context, 'fullReview');
      const action = await runFullReviewLoop(context, options);
      await log(options.journal, options.campaignId, context, action.type);
      return action;
    }
  }
}

// ─── public factory ───────────────────────────────────────────────────────────

/**
 * Creates an `InterventionHook` that orchestrates the full human-intervention
 * workflow for the Titrate TUI.
 *
 * Routing:
 * - `validation-error` / `validation-warning` → full file review loop
 * - `stuck-transaction` → bump / wait / abort prompt
 * - `batch-result` (failed) → retry / skip / abort prompt
 * - `address-review` / `filter-review` / `amount-review` / `batch-preview`
 *   → spot check with optional escalation to full review
 *
 * Every decision is recorded in the provided `InterventionJournal`.
 *
 * @param options Configuration for the handler.
 * @returns An `InterventionHook` compatible with `InterventionConfig.onIntervention`.
 */
export function createInterventionHandler(options: InterventionHandlerOptions): InterventionHook {
  return async (context: InterventionContext): Promise<InterventionAction> => {
    const { point } = context;

    if (point === 'validation-error' || point === 'validation-warning') {
      // Validate-only points always go to full review — errors must be fixed
      const issues = context.issues ?? [];
      if (hasErrors(issues) || hasWarnings(issues)) {
        return handleValidationPoint(context, options);
      }
      // Clean validation — auto-approve
      await log(options.journal, options.campaignId, context, 'approve');
      return { type: 'approve' };
    }

    if (point === 'stuck-transaction') {
      return handleStuckTransaction(context, options);
    }

    if (point === 'batch-result') {
      return handleBatchResult(context, options);
    }

    // Data review points — spot check first
    if (
      point === 'address-review' ||
      point === 'filter-review' ||
      point === 'amount-review' ||
      point === 'batch-preview'
    ) {
      return handleDataReviewPoint(context, options);
    }

    // Unknown point — approve by default so new points don't block silently
    await log(options.journal, options.campaignId, context, 'approve');
    return { type: 'approve' };
  };
}
