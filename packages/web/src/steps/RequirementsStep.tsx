import { useMemo, useCallback, useState, useEffect } from 'react';
import { formatUnits } from 'viem';
import { StepPanel } from '../components/StepPanel.js';
import { RequirementsPanel } from '../components/RequirementsPanel.js';
import { useWallet } from '../providers/WalletProvider.js';
import { useCampaign } from '../providers/CampaignProvider.js';
import { useChain } from '../providers/ChainProvider.js';
import { useStorage } from '../providers/StorageProvider.js';
import { useNativeBalance } from '../hooks/useNativeBalance.js';
import { useTokenBalance } from '../hooks/useTokenBalance.js';
import { computeRequirements } from '@titrate/sdk';
import type { Address } from 'viem';

/**
 * Count the total addresses across all 'source'-type address sets.
 */
export function countSourceAddresses(
  sets: readonly { type: string; addressCount: number }[],
): number {
  let total = 0;
  for (const set of sets) {
    if (set.type === 'source') total += set.addressCount;
  }
  return total;
}

/** Default gas estimate per batch when no live estimate is available. */
const DEFAULT_GAS_PER_BATCH = 300_000n;

/** Default batch size when campaign lacks one. */
const DEFAULT_BATCH_SIZE = 100;

/**
 * Sixth campaign step: verify gas and token requirements before distribution.
 *
 * Computes requirements using the SDK, fetches balances, and shows whether
 * the active wallet (or perry mode hot wallet) has sufficient funds.
 */
export function RequirementsStep() {
  const { address, perryMode } = useWallet();
  const { activeCampaign, setActiveStep } = useCampaign();
  const { chainConfig } = useChain();
  const { storage } = useStorage();

  // Load recipient count from storage
  const [recipientCount, setRecipientCount] = useState(0);
  useEffect(() => {
    if (!storage || !activeCampaign) return;
    void (async () => {
      const sets = await storage.addressSets.getByCampaign(activeCampaign.id);
      setRecipientCount(countSourceAddresses(sets));
    })();
  }, [storage, activeCampaign]);

  /** The address that will fund distribution (hot wallet if perry mode, otherwise connected). */
  const fundingAddress: Address | null = perryMode
    ? perryMode.hotAddress
    : address ?? null;

  const tokenAddress: Address | null = activeCampaign?.tokenAddress ?? null;
  const tokenDecimals = activeCampaign?.tokenDecimals ?? 18;
  const gasTokenSymbol = 'ETH';

  const { data: nativeBalance, isLoading: isLoadingNative } = useNativeBalance(fundingAddress);
  const { data: tokenBalance, isLoading: isLoadingToken } = useTokenBalance(tokenAddress, fundingAddress);

  const requirements = useMemo(() => {
    if (!activeCampaign) {
      return null;
    }

    const batchSize = activeCampaign.batchSize || DEFAULT_BATCH_SIZE;
    const amountPerRecipient = activeCampaign.uniformAmount
      ? BigInt(activeCampaign.uniformAmount)
      : 0n;

    return computeRequirements({
      recipientCount,
      batchSize,
      amountPerRecipient,
      gasPerBatch: DEFAULT_GAS_PER_BATCH,
    });
  }, [activeCampaign]);

  const gasNeededFormatted = requirements
    ? formatUnits(requirements.gasTokenNeeded, 18)
    : '0';
  const erc20NeededFormatted = requirements
    ? formatUnits(requirements.erc20Needed, tokenDecimals)
    : '0';
  const gasBalanceFormatted = nativeBalance !== undefined
    ? formatUnits(nativeBalance, 18)
    : '...';
  const tokenBalanceFormatted = tokenBalance !== undefined
    ? formatUnits(tokenBalance, tokenDecimals)
    : '...';

  const tokenSymbol = activeCampaign?.contractName || 'TOKEN';

  const isSufficient = useMemo(() => {
    if (!requirements || nativeBalance === undefined || tokenBalance === undefined) {
      return false;
    }
    return (
      nativeBalance >= requirements.gasTokenNeeded &&
      tokenBalance >= requirements.erc20Needed
    );
  }, [requirements, nativeBalance, tokenBalance]);

  const isLoading = isLoadingNative || isLoadingToken;

  const handleContinue = useCallback(() => {
    setActiveStep('distribute');
  }, [setActiveStep]);

  return (
    <StepPanel title="Requirements" description="Verify your wallet has sufficient funds for distribution.">
      {!activeCampaign && (
        <p className="text-sm text-gray-400">No active campaign selected.</p>
      )}

      {activeCampaign && (
        <div className="space-y-6">
          {isLoading && (
            <p className="text-sm text-gray-500">Loading balances...</p>
          )}

          <RequirementsPanel
            gasTokenNeeded={gasNeededFormatted}
            gasTokenBalance={gasBalanceFormatted}
            gasTokenSymbol={gasTokenSymbol}
            erc20Needed={erc20NeededFormatted}
            erc20Balance={tokenBalanceFormatted}
            tokenSymbol={tokenSymbol}
            batchCount={requirements?.batchCount ?? 0}
            isSufficient={isSufficient}
          />

          {perryMode && (
            <div className="rounded-md bg-purple-900/20 p-3 text-sm text-purple-400 ring-1 ring-purple-900/30">
              Requirements can be met externally in perry mode. The hot wallet can be funded from any source before distributing.
            </div>
          )}

          <button
            type="button"
            onClick={handleContinue}
            disabled={!isSufficient && !perryMode}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 text-sm font-medium"
          >
            Continue
          </button>
        </div>
      )}
    </StepPanel>
  );
}
