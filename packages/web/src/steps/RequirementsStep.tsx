import { useMemo, useCallback, useState, useEffect } from 'react';
import { formatUnits, erc20Abi } from 'viem';
import { useQuery } from '@tanstack/react-query';
import { StepPanel } from '../components/StepPanel.js';
import { RequirementsPanel } from '../components/RequirementsPanel.js';
import { Button, Card } from '../components/ui';
import { useWallet } from '../providers/WalletProvider.js';
import { useCampaign } from '../providers/CampaignProvider.js';
import { useChain } from '../providers/ChainProvider.js';
import { useStorage } from '../providers/StorageProvider.js';
import { useNativeBalance } from '../hooks/useNativeBalance.js';
import { useTokenBalance } from '../hooks/useTokenBalance.js';
import { useGasEstimate } from '../hooks/useGasEstimate.js';
import { computeRequirements } from '@titrate/sdk';
import type { Address } from 'viem';
import type { GasEstimateParams } from '../hooks/useGasEstimate.js';

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

/** Minimal ABI fragment for gas estimation of the disperse contract. */
const DISPERSE_SIMPLE_ABI = [{
  type: 'function',
  name: 'disperseSimple',
  inputs: [
    { name: 'token', type: 'address' },
    { name: 'from', type: 'address' },
    { name: 'recipients', type: 'address[]' },
    { name: 'amount', type: 'uint256' },
    { name: 'campaignId', type: 'bytes32' },
  ],
  outputs: [],
  stateMutability: 'nonpayable',
}] as const;

/**
 * Sixth campaign step: verify gas and token requirements before distribution.
 *
 * Computes requirements using the SDK, fetches balances, and shows whether
 * the active wallet (or perry mode hot wallet) has sufficient funds.
 */
export function RequirementsStep() {
  const { address, perryMode } = useWallet();
  const { activeCampaign, setActiveStep } = useCampaign();
  const { publicClient } = useChain();
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
    ? perryMode.wallets[0].address
    : address ?? null;

  const tokenAddress: Address | null = activeCampaign?.tokenAddress ?? null;
  const tokenDecimals = activeCampaign?.tokenDecimals ?? 18;
  const gasTokenSymbol = 'ETH';

  const { data: nativeBalance, isLoading: isLoadingNative } = useNativeBalance(fundingAddress);
  const { data: tokenBalance, isLoading: isLoadingToken } = useTokenBalance(tokenAddress, fundingAddress);

  const contractAddress = activeCampaign?.contractAddress as Address | null;

  // Build gas estimate params when we have sufficient campaign data
  const gasEstimateParams = useMemo((): GasEstimateParams | null => {
    if (!contractAddress) return null;
    if (!fundingAddress) return null;
    if (!activeCampaign?.tokenAddress) return null;

    return {
      address: contractAddress,
      abi: DISPERSE_SIMPLE_ABI as unknown as GasEstimateParams['abi'],
      functionName: 'disperseSimple',
      args: [
        activeCampaign.tokenAddress,
        fundingAddress,
        [fundingAddress], // 1-address sample for estimation
        BigInt(activeCampaign.uniformAmount ?? '0'),
        '0x0000000000000000000000000000000000000000000000000000000000000000',
      ],
      account: fundingAddress,
    };
  }, [contractAddress, fundingAddress, activeCampaign?.tokenAddress, activeCampaign?.uniformAmount]);

  const { data: estimatedGas } = useGasEstimate(gasEstimateParams);

  /** Per-batch gas: live estimate scaled by batch size, or the hardcoded default. */
  const gasPerBatch = estimatedGas
    ? estimatedGas * BigInt(activeCampaign?.batchSize ?? DEFAULT_BATCH_SIZE)
    : DEFAULT_GAS_PER_BATCH;

  const { data: allowance } = useQuery({
    queryKey: ['token-allowance', tokenAddress, fundingAddress, contractAddress],
    queryFn: () =>
      publicClient!.readContract({
        address: tokenAddress!,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [fundingAddress!, contractAddress!],
      }),
    enabled: !!publicClient && !!tokenAddress && !!fundingAddress && !!contractAddress,
    staleTime: 15_000,
  });

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
      gasPerBatch,
    });
  }, [activeCampaign, recipientCount, gasPerBatch]);

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

  const tokenSymbol = activeCampaign?.tokenSymbol || activeCampaign?.contractName || 'TOKEN';

  const allowanceFormatted = allowance !== undefined
    ? formatUnits(allowance, tokenDecimals)
    : '...';
  const allowanceSufficient = requirements !== null
    && allowance !== undefined
    && allowance >= requirements.erc20Needed;

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
        <p className="font-mono text-sm text-[color:var(--fg-muted)]">No active campaign selected.</p>
      )}

      {activeCampaign && (
        <div className="space-y-6">
          {isLoading && (
            <p className="font-mono text-sm text-[color:var(--fg-muted)]">Loading balances...</p>
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

          <p className="font-mono text-xs text-[color:var(--fg-muted)]">
            Gas estimate: {estimatedGas ? 'live (per-recipient \u00d7 batch size)' : 'default (300k per batch)'}
          </p>

          {contractAddress && (
            <Card>
              <div className="flex justify-between text-sm">
                <span className="font-mono text-[color:var(--fg-muted)]">Token Allowance</span>
                <span
                  data-status={allowanceSufficient ? 'ok' : 'err'}
                  className={`font-mono font-semibold ${allowanceSufficient ? 'text-[color:var(--color-ok)]' : 'text-[color:var(--color-err)]'}`}
                >
                  {allowanceFormatted} / {erc20NeededFormatted} {tokenSymbol}
                </span>
              </div>
            </Card>
          )}

          {perryMode && (
            <div className="border-2 border-[color:var(--color-info)]/30 bg-[color:var(--color-info)]/10 p-3 font-mono text-sm text-[color:var(--color-info)]">
              Requirements can be met externally in perry mode. The hot wallet can be funded from any source before distributing.
            </div>
          )}

          <Button variant="primary" onClick={handleContinue} disabled={!isSufficient && !perryMode}>
            Continue
          </Button>
        </div>
      )}
    </StepPanel>
  );
}
