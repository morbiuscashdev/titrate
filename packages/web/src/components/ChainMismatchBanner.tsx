import { Button } from './ui/Button.js';
import type { ChainMismatch } from '../hooks/useChainMismatch.js';

export type ChainMismatchBannerProps = {
  readonly mismatch: ChainMismatch;
  readonly campaignChainName?: string;
};

/**
 * Warns the user their wallet is connected to a chain that doesn't match the
 * active campaign. Renders a prominent banner + a one-click switch button.
 *
 * The banner returns `null` when there's no mismatch, so consumers can render
 * it unconditionally at the top of a step.
 */
export function ChainMismatchBanner({
  mismatch,
  campaignChainName,
}: ChainMismatchBannerProps) {
  if (!mismatch.mismatched) return null;

  const { walletChainId, campaignChainId, switching, switchError, switchChain } =
    mismatch;
  const campaignLabel = campaignChainName
    ? `${campaignChainName} (chain ${campaignChainId})`
    : `chain ${campaignChainId}`;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="border-2 border-[color:var(--color-err)] bg-[color:var(--color-err)]/10 p-4 font-mono"
    >
      <p className="text-sm text-[color:var(--color-err)] font-bold uppercase tracking-[0.1em]">
        Wrong chain
      </p>
      <p className="mt-2 text-sm text-[color:var(--fg-primary)]">
        Your wallet is on chain {walletChainId}. This campaign requires{' '}
        {campaignLabel}. Signatures and transactions will fail until you switch.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            void switchChain();
          }}
          disabled={switching}
        >
          {switching ? 'Switching…' : `Switch to ${campaignLabel}`}
        </Button>
        {switchError && (
          <span className="text-xs text-[color:var(--color-err)]">
            {switchError.message}
          </span>
        )}
      </div>
    </div>
  );
}
