import { intro, outro, isCancel } from '@clack/prompts';
import { campaignStep } from './steps/campaign.js';
import { addressesStep } from './steps/addresses.js';
import { filtersStep } from './steps/filters.js';
import { amountsStep } from './steps/amounts.js';
import { walletStep } from './steps/wallet.js';
import { distributeStep } from './steps/distribute.js';

/**
 * Runs the interactive Titrate wizard from start to finish.
 *
 * Steps:
 *  1. Campaign Setup
 *  2. Build Address List
 *  3. Apply Filters
 *  4. Configure Amounts
 *  5. Wallet & Contract Setup
 *  6. Review & Distribute
 *
 * Any step may be cancelled by the user (Ctrl+C or selecting cancel),
 * which terminates the wizard gracefully.
 */
export async function runWizard(): Promise<void> {
  intro('Titrate — Airdrop Wizard');

  // --- Step 1: Campaign Setup ---
  const campaign = await campaignStep();
  if (isCancel(campaign)) {
    outro('Cancelled.');
    return;
  }

  // --- Step 2: Build Address List ---
  const addresses = await addressesStep(campaign);
  if (isCancel(addresses)) {
    outro('Cancelled.');
    return;
  }

  // --- Step 3: Apply Filters ---
  const filters = await filtersStep(campaign, addresses);
  if (isCancel(filters)) {
    outro('Cancelled.');
    return;
  }

  if (filters.addressCount === 0) {
    outro('No eligible addresses after filtering. Nothing to distribute.');
    return;
  }

  // --- Step 4: Configure Amounts ---
  const amounts = await amountsStep(campaign, addresses, filters.addresses);
  if (isCancel(amounts)) {
    outro('Cancelled.');
    return;
  }

  // --- Step 5: Wallet & Contract Setup ---
  const wallet = await walletStep(campaign);
  if (isCancel(wallet)) {
    outro('Cancelled.');
    return;
  }

  // --- Step 6: Review & Distribute ---
  const result = await distributeStep(campaign, filters, amounts, wallet);
  if (isCancel(result)) {
    outro('Cancelled.');
    return;
  }

  outro('Done!');
}
