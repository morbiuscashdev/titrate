import { useCallback } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';

export type ChainMismatch = {
  readonly mismatched: boolean;
  readonly walletChainId: number | undefined;
  readonly campaignChainId: number | undefined;
  readonly switching: boolean;
  readonly switchError: Error | null;
  readonly switchChain: () => Promise<void>;
};

/**
 * Detects whether the wallet is on a different chain than the active campaign,
 * and exposes a helper to request a chain switch through the connected wallet.
 *
 * `mismatched` is `true` only when both chain IDs are known and differ; an
 * unconnected wallet or a zero/undefined campaign chain returns `false` so the
 * banner stays hidden until there's something actionable.
 */
export function useChainMismatch(
  campaignChainId: number | undefined,
): ChainMismatch {
  const { chainId: walletChainId } = useAccount();
  const {
    switchChainAsync,
    isPending: switching,
    error: switchError,
  } = useSwitchChain();

  const mismatched =
    typeof walletChainId === 'number' &&
    typeof campaignChainId === 'number' &&
    campaignChainId > 0 &&
    walletChainId !== campaignChainId;

  const switchChain = useCallback(async () => {
    if (typeof campaignChainId !== 'number' || campaignChainId <= 0) return;
    await switchChainAsync({ chainId: campaignChainId });
  }, [campaignChainId, switchChainAsync]);

  return {
    mismatched,
    walletChainId,
    campaignChainId,
    switching,
    switchError: switchError ?? null,
    switchChain,
  };
}
