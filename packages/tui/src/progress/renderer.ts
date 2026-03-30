import type { ProgressCallback, ProgressEvent } from '@titrate/sdk';

/**
 * Creates a ProgressCallback that renders progress events to stderr.
 *
 * - scan events: carriage-return progress bar (block counter + percentage)
 * - filter events: line-based input → output counts
 * - batch events: per-batch status (signing / confirmed / failed)
 * - tx events: warning line for dropped/reverted attempts
 *
 * @returns A ProgressCallback suitable for passing to SDK pipeline and disperse functions
 */
export function createProgressRenderer(): ProgressCallback {
  return (event: ProgressEvent): void => {
    switch (event.type) {
      case 'scan': {
        const { currentBlock, endBlock, addressesFound } = event;
        const total = endBlock - currentBlock > 0n ? endBlock : currentBlock;
        const pct =
          total > 0n ? Number((currentBlock * 100n) / total).toFixed(1) : '100.0';
        process.stderr.write(
          `\r  scanning blocks... ${currentBlock.toLocaleString()} / ${endBlock.toLocaleString()} (${pct}%) — ${addressesFound} addresses found`,
        );
        break;
      }

      case 'filter': {
        const { filterName, inputCount, outputCount } = event;
        const kept = outputCount;
        const removed = inputCount - outputCount;
        console.error(
          `  filter [${filterName}]: ${inputCount} → ${kept} (removed ${removed})`,
        );
        break;
      }

      case 'batch': {
        const { batchIndex, totalBatches, status } = event;
        const label = `batch ${batchIndex + 1}/${totalBatches}`;
        if (status === 'signing') {
          process.stderr.write(`\r  ${label}: signing...`);
        } else if (status === 'confirmed') {
          console.error(`  ${label}: ✓ confirmed`);
        } else if (status === 'failed') {
          console.error(`  ${label}: ✗ failed`);
        }
        break;
      }

      case 'tx': {
        const { batchIndex, attempt } = event;
        if (attempt.outcome === 'dropped' || attempt.outcome === 'reverted') {
          console.error(
            `  ! batch ${batchIndex} tx warning: ${attempt.outcome} (hash: ${attempt.txHash})`,
          );
        }
        break;
      }
    }
  };
}
