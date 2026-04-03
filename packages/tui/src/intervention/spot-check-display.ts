import { select, isCancel } from '@clack/prompts';
import { execFile } from 'node:child_process';
import type { SpotCheckResult } from '@titrate/sdk';

/** Result returned from the spot-check prompt. */
export type SpotCheckChoice = 'approve' | 'reroll' | 'fullReview' | 'abort';

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Truncates an address to the first and last 6 hex chars, e.g. 0x1234...5678. */
function truncateAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

/**
 * Formats a bigint amount for display.
 * When decimals are provided the amount is scaled to a human-readable float.
 */
function formatAmount(amount: bigint, tokenSymbol?: string, tokenDecimals?: number): string {
  if (tokenDecimals !== undefined && tokenDecimals > 0) {
    const divisor = 10n ** BigInt(tokenDecimals);
    const whole = amount / divisor;
    const frac = amount % divisor;
    const fracStr = frac.toString().padStart(tokenDecimals, '0').slice(0, 4).replace(/0+$/, '');
    const formatted = fracStr.length > 0 ? `${whole}.${fracStr}` : whole.toString();
    return tokenSymbol !== undefined ? `${formatted} ${tokenSymbol}` : formatted;
  }
  return tokenSymbol !== undefined ? `${amount} ${tokenSymbol}` : amount.toString();
}

/**
 * Opens a URL in the system default browser.
 * Uses execFile (not exec) to prevent command injection.
 */
function openUrl(url: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  // fire and forget — ignore errors (browser launch is best-effort)
  execFile(cmd, [url], () => {});
}

/** Prints the spot-check box to stdout. */
function printSpotCheckBox(
  result: SpotCheckResult,
  tokenSymbol?: string,
  tokenDecimals?: number,
): void {
  const width = 72;
  const line = '─'.repeat(width);
  const header = `Spot Check — ${result.sampleSize} of ${result.totalCount} addresses`;

  console.log(`\n┌${line}┐`);
  console.log(`│  ${header.padEnd(width - 1)}│`);
  console.log(`├${line}┤`);

  for (let i = 0; i < result.samples.length; i++) {
    const sample = result.samples[i];
    const num = String(i + 1).padStart(2, ' ');
    const addr = truncateAddress(sample.address);
    const amountPart =
      sample.amount !== undefined
        ? `  ${formatAmount(sample.amount, tokenSymbol, tokenDecimals)}`
        : '';
    const label = `${num}. ${addr}${amountPart}`;
    console.log(`│  ${label.padEnd(width - 1)}│`);
    console.log(`│     ${sample.explorerUrl.padEnd(width - 4)}│`);
    if (i < result.samples.length - 1) {
      console.log(`│${' '.repeat(width)}│`);
    }
  }

  console.log(`└${line}┘\n`);
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Displays a spot-check box in the terminal and prompts the user for an action.
 *
 * Options:
 * - **Approve** — accept the current data as-is
 * - **Reroll** — pick a new random sample
 * - **Full review** — write a review CSV and inspect every row
 * - **Open in browser** — open all sample URLs, then re-prompt
 * - **Abort** — cancel the run
 *
 * Uses `execFile` (not `exec`) when opening URLs to prevent command injection.
 *
 * @param result        The spot-check result containing sampled addresses.
 * @param tokenSymbol   Optional token symbol for amount display.
 * @param tokenDecimals Optional decimal precision for amount scaling.
 * @returns The user's choice.
 */
export async function displaySpotCheck(
  result: SpotCheckResult,
  tokenSymbol?: string,
  tokenDecimals?: number,
): Promise<SpotCheckChoice> {
  printSpotCheckBox(result, tokenSymbol, tokenDecimals);

  // Loop to support "open in browser then re-prompt"
  while (true) {
    const choice = await select({
      message: 'Spot check — what would you like to do?',
      options: [
        { value: 'approve', label: 'Approve — looks good, continue' },
        { value: 'reroll', label: 'Reroll — show a different sample' },
        { value: 'fullReview', label: 'Full review — inspect every row in a CSV file' },
        { value: 'open', label: 'Open in browser — view sample addresses on the explorer' },
        { value: 'abort', label: 'Abort — cancel the run' },
      ],
    });

    if (isCancel(choice)) {
      return 'abort';
    }

    if (choice === 'open') {
      for (const sample of result.samples) {
        openUrl(sample.explorerUrl);
      }
      // Re-print the box so the URLs are visible after the prompt clears
      printSpotCheckBox(result, tokenSymbol, tokenDecimals);
      continue;
    }

    return choice as SpotCheckChoice;
  }
}
