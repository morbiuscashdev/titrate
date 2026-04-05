import { useState, useCallback, useEffect, useRef } from 'react';
import { useWalletClient } from 'wagmi';
import { erc20Abi, formatUnits, toFunctionSelector } from 'viem';
import type { Address, Hex } from 'viem';
import {
  deployDistributor,
  disperseTokens,
  disperseTokensSimple,
  approveOperator,
  getAllowance,
} from '@titrate/sdk';
import type { BatchResult, ProgressEvent, StoredAddress } from '@titrate/sdk';
import { StepPanel } from '../components/StepPanel.js';
import { BatchTimeline } from '../components/BatchTimeline.js';
import { SpendSummary } from '../components/SpendSummary.js';
import { useCampaign } from '../providers/CampaignProvider.js';
import { useChain } from '../providers/ChainProvider.js';
import { useStorage } from '../providers/StorageProvider.js';
import type { BatchStatusCardProps } from '../components/BatchStatusCard.js';

/**
 * Returns the TitrateFull function selector for the disperse variant
 * that matches the campaign's amount mode.
 *
 * @param amountMode - 'uniform' uses disperseSimple, 'variable' uses disperse
 * @returns The 4-byte function selector as a Hex string
 */
export function getDisperseSelector(amountMode: 'uniform' | 'variable'): Hex {
  if (amountMode === 'uniform') {
    return toFunctionSelector('disperseSimple(address,address,address[],uint256,bytes32)');
  }
  return toFunctionSelector('disperse(address,address,address[],uint256[],bytes32)');
}

/** Distribution workflow phase. */
type DistributePhase = 'ready' | 'deploying' | 'approving' | 'distributing' | 'complete';

/** Map SDK batch progress status to the UI card status. */
export function toBatchCardStatus(sdkStatus: string): BatchStatusCardProps['status'] {
  if (sdkStatus === 'confirmed') return 'confirmed';
  if (sdkStatus === 'failed') return 'failed';
  return 'pending';
}

/**
 * Seventh campaign step: deploy contract and distribute tokens.
 *
 * Integrates with the SDK's deployDistributor, disperseTokensSimple,
 * and disperseTokens to perform real on-chain distribution.
 */
export function DistributeStep() {
  const { activeCampaign, saveCampaign } = useCampaign();
  const { publicClient } = useChain();
  const { storage } = useStorage();
  const { data: walletClient } = useWalletClient();

  const [phase, setPhase] = useState<DistributePhase>('ready');
  const [batches, setBatches] = useState<readonly BatchStatusCardProps[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<readonly StoredAddress[]>([]);
  const [results, setResults] = useState<readonly BatchResult[]>([]);
  const recipientsLoadedRef = useRef(false);

  const batchSize = activeCampaign?.batchSize ?? 100;
  const tokenSymbol = activeCampaign?.contractName || 'TOKEN';
  const tokenDecimals = activeCampaign?.tokenDecimals ?? 18;
  const hasContract =
    activeCampaign?.contractAddress !== null &&
    activeCampaign?.contractAddress !== undefined;

  // Load recipients from storage when campaign is active
  useEffect(() => {
    if (!activeCampaign || !storage || recipientsLoadedRef.current) return;

    recipientsLoadedRef.current = true;
    void (async () => {
      try {
        const sets = await storage.addressSets.getByCampaign(activeCampaign.id);
        const sourceSets = sets.filter((s) => s.type === 'source');
        const allAddresses: StoredAddress[] = [];
        for (const set of sourceSets) {
          const addrs = await storage.addresses.getBySet(set.id);
          allAddresses.push(...addrs);
        }
        setRecipients(allAddresses);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to load recipients';
        setError(message);
      }
    })();
  }, [activeCampaign, storage]);

  // Reset loaded flag when campaign changes
  useEffect(() => {
    recipientsLoadedRef.current = false;
    setRecipients([]);
    setError(null);
    setBatches([]);
    setResults([]);
    setPhase('ready');
  }, [activeCampaign?.id]);

  const handleDeploy = useCallback(async () => {
    if (!activeCampaign) return;

    if (!walletClient) {
      setError('Wallet not connected. Please connect your wallet first.');
      return;
    }

    if (!publicClient) {
      setError('Chain not configured. Please select a chain first.');
      return;
    }

    setError(null);
    setPhase('deploying');

    try {
      const result = await deployDistributor({
        variant: activeCampaign.contractVariant,
        name: activeCampaign.contractName,
        walletClient,
        publicClient,
      });

      await saveCampaign({
        ...activeCampaign,
        contractAddress: result.address,
      });

      setPhase('ready');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Contract deployment failed';
      setError(message);
      setPhase('ready');
    }
  }, [activeCampaign, walletClient, publicClient, saveCampaign]);

  const handleDistribute = useCallback(async () => {
    if (!activeCampaign) return;

    if (!walletClient) {
      setError('Wallet not connected. Please connect your wallet first.');
      return;
    }

    if (!publicClient) {
      setError('Chain not configured. Please select a chain first.');
      return;
    }

    if (!activeCampaign.contractAddress) {
      setError('Contract not deployed. Please deploy the contract first.');
      return;
    }

    if (recipients.length === 0) {
      setError('No recipients loaded. Please add addresses first.');
      return;
    }

    setError(null);

    // Compute total ERC-20 needed for approval
    let totalNeeded = 0n;
    if (activeCampaign.amountMode === 'uniform') {
      totalNeeded = BigInt(activeCampaign.uniformAmount ?? '0') * BigInt(recipients.length);
    } else {
      for (const r of recipients) {
        totalNeeded += BigInt(r.amount ?? '0');
      }
    }

    // Check and request approval if needed
    if (totalNeeded > 0n) {
      setPhase('approving');
      try {
        const contractAddress = activeCampaign.contractAddress as Address;

        if (activeCampaign.contractVariant === 'simple') {
          // Standard ERC-20 approve on the token contract
          const currentAllowance = await publicClient.readContract({
            address: activeCampaign.tokenAddress,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [walletClient.account!.address, contractAddress],
          }) as bigint;

          if (currentAllowance < totalNeeded) {
            const approveHash = await walletClient.writeContract({
              address: activeCampaign.tokenAddress,
              abi: erc20Abi,
              functionName: 'approve',
              args: [contractAddress, totalNeeded],
              account: walletClient.account!,
              chain: undefined,
            });
            await publicClient.waitForTransactionReceipt({ hash: approveHash });
          }
        } else {
          // Full variant: selector-scoped approve on the Titrate contract
          const selector = getDisperseSelector(activeCampaign.amountMode);

          const currentAllowance = await getAllowance({
            contractAddress,
            owner: walletClient.account!.address,
            operator: walletClient.account!.address,
            selector,
            publicClient,
          });

          if (currentAllowance < totalNeeded) {
            await approveOperator({
              contractAddress,
              operator: walletClient.account!.address,
              selector,
              amount: totalNeeded,
              walletClient,
              publicClient,
            });
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Token approval failed';
        setError(message);
        setPhase('ready');
        return;
      }
    }

    setPhase('distributing');

    const totalBatches = Math.ceil(recipients.length / batchSize);
    const initialBatches: BatchStatusCardProps[] = Array.from(
      { length: totalBatches },
      (_, index) => ({
        batchIndex: index,
        recipientCount: Math.min(
          batchSize,
          recipients.length - index * batchSize,
        ),
        status: 'pending' as const,
      }),
    );
    setBatches(initialBatches);

    const onProgress = (event: ProgressEvent) => {
      if (event.type !== 'batch') return;

      setBatches((prev) =>
        prev.map((batch) =>
          batch.batchIndex === event.batchIndex
            ? { ...batch, status: toBatchCardStatus(event.status) }
            : batch,
        ),
      );
    };

    try {
      const recipientAddresses = recipients.map((r) => r.address);
      let batchResults: BatchResult[];

      if (activeCampaign.amountMode === 'uniform') {
        batchResults = await disperseTokensSimple({
          contractAddress: activeCampaign.contractAddress as Address,
          variant: activeCampaign.contractVariant,
          token: activeCampaign.tokenAddress,
          recipients: recipientAddresses,
          amount: BigInt(activeCampaign.uniformAmount ?? '0'),
          walletClient,
          publicClient,
          batchSize,
          onProgress,
        });
      } else {
        const amounts = recipients.map((r) => BigInt(r.amount ?? '0'));
        batchResults = await disperseTokens({
          contractAddress: activeCampaign.contractAddress as Address,
          variant: activeCampaign.contractVariant,
          token: activeCampaign.tokenAddress,
          recipients: recipientAddresses,
          amounts,
          walletClient,
          publicClient,
          batchSize,
          onProgress,
        });
      }

      setResults(batchResults);

      // Update batches with final tx hashes
      setBatches((prev) =>
        prev.map((batch) => {
          const result = batchResults.find(
            (r) => r.batchIndex === batch.batchIndex,
          );
          if (!result) return batch;
          return {
            ...batch,
            status: result.confirmedTxHash ? 'confirmed' : 'failed',
            txHash: result.confirmedTxHash ?? undefined,
          };
        }),
      );

      setPhase('complete');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Distribution failed';
      setError(message);
      setPhase('complete');
    }
  }, [
    activeCampaign,
    walletClient,
    publicClient,
    recipients,
    batchSize,
  ]);

  // Compute spend summary from results
  const summaryData = (() => {
    const recipientSet = new Set<string>();
    let totalTokensSent = 0n;
    let confirmedCount = 0;
    let failedCount = 0;

    for (const result of results) {
      if (result.confirmedTxHash) {
        confirmedCount++;
        for (const addr of result.recipients) {
          recipientSet.add(addr.toLowerCase());
        }
        for (const amount of result.amounts) {
          totalTokensSent += amount;
        }
      } else {
        failedCount++;
      }
    }

    return {
      totalTokensSent: formatUnits(totalTokensSent, tokenDecimals),
      uniqueRecipients: recipientSet.size,
      batchCount: results.length,
      confirmedBatches: confirmedCount,
      failedBatches: failedCount,
    };
  })();

  return (
    <StepPanel
      title="Distribute"
      description="Deploy the distribution contract and send tokens to recipients."
    >
      {!activeCampaign && (
        <p className="text-sm text-gray-400">No active campaign selected.</p>
      )}

      {activeCampaign && (
        <div className="space-y-6">
          {/* Error display */}
          {error && (
            <div className="rounded-md bg-red-900/20 p-3 text-sm text-red-400 ring-1 ring-red-900/30">
              {error}
            </div>
          )}

          {/* Pre-distribution summary */}
          {phase === 'ready' && (
            <div className="space-y-4">
              <div className="rounded-lg bg-gray-900 p-4 ring-1 ring-gray-800">
                <h3 className="text-sm font-semibold text-white mb-3">
                  Distribution Plan
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Campaign</span>
                    <span className="text-white">{activeCampaign.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Batch size</span>
                    <span className="text-white">{batchSize}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Amount mode</span>
                    <span className="text-white">
                      {activeCampaign.amountMode}
                    </span>
                  </div>
                  {activeCampaign.uniformAmount && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">
                        Amount per recipient
                      </span>
                      <span className="text-white">
                        {activeCampaign.uniformAmount} {tokenSymbol}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-400">Recipients</span>
                    <span className="text-white">{recipients.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Contract</span>
                    <span className="text-white">
                      {hasContract ? 'Deployed' : 'Not deployed'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                {!hasContract && (
                  <button
                    type="button"
                    onClick={handleDeploy}
                    className="bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg px-4 py-2 text-sm"
                  >
                    Deploy Contract
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleDistribute}
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-sm font-medium"
                >
                  Start Distribution
                </button>
              </div>
            </div>
          )}

          {/* Deploying state */}
          {phase === 'deploying' && (
            <div className="rounded-lg bg-gray-900 p-6 ring-1 ring-gray-800 text-center">
              <p className="text-sm text-gray-400">
                Deploying distribution contract...
              </p>
            </div>
          )}

          {/* Approving state */}
          {phase === 'approving' && (
            <div className="rounded-lg bg-gray-900 p-6 ring-1 ring-gray-800 text-center">
              <p className="text-sm text-gray-400">
                Approving token spend... Please confirm in your wallet.
              </p>
            </div>
          )}

          {/* Distribution in progress */}
          {(phase === 'distributing' || phase === 'complete') && (
            <div className="space-y-6">
              {phase === 'distributing' && (
                <div className="rounded-md bg-blue-900/20 p-3 text-sm text-blue-400 ring-1 ring-blue-900/30">
                  Distribution in progress...
                </div>
              )}

              <BatchTimeline batches={batches} />

              {phase === 'complete' && (
                <SpendSummary
                  totalGasEstimate="--"
                  totalTokensSent={summaryData.totalTokensSent}
                  tokenSymbol={tokenSymbol}
                  uniqueRecipients={summaryData.uniqueRecipients}
                  batchCount={summaryData.batchCount}
                  confirmedBatches={summaryData.confirmedBatches}
                  failedBatches={summaryData.failedBatches}
                />
              )}
            </div>
          )}
        </div>
      )}
    </StepPanel>
  );
}
