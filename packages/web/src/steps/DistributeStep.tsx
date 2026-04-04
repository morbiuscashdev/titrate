import { useState, useCallback } from 'react';
import { StepPanel } from '../components/StepPanel.js';
import { BatchTimeline } from '../components/BatchTimeline.js';
import { SpendSummary } from '../components/SpendSummary.js';
import { useCampaign } from '../providers/CampaignProvider.js';
import type { BatchStatusCardProps } from '../components/BatchStatusCard.js';

/** Distribution workflow phase. */
type DistributePhase = 'ready' | 'deploying' | 'distributing' | 'complete';

/**
 * Seventh campaign step: deploy contract and distribute tokens.
 *
 * Currently renders placeholder UI for the distribution workflow.
 * Actual contract deployment and batch distribution logic will be
 * wired to real SDK calls in a later phase.
 */
export function DistributeStep() {
  const { activeCampaign } = useCampaign();
  const [phase, setPhase] = useState<DistributePhase>('ready');
  const [batches, setBatches] = useState<readonly BatchStatusCardProps[]>([]);

  const batchSize = activeCampaign?.batchSize ?? 100;
  const tokenSymbol = activeCampaign?.contractName || 'TOKEN';
  const hasContract = activeCampaign?.contractAddress !== null && activeCampaign?.contractAddress !== undefined;

  const handleDeploy = useCallback(() => {
    setPhase('deploying');
    // Placeholder: simulate deploy completion
    setTimeout(() => {
      setPhase('ready');
    }, 1500);
  }, []);

  const handleDistribute = useCallback(() => {
    setPhase('distributing');

    // Placeholder: create mock batches to show timeline progress
    const mockBatchCount = 3;
    const mockBatches: BatchStatusCardProps[] = Array.from(
      { length: mockBatchCount },
      (_, index) => ({
        batchIndex: index,
        recipientCount: batchSize,
        status: 'pending' as const,
      }),
    );
    setBatches(mockBatches);

    // Placeholder: simulate batch completion one at a time
    let current = 0;
    const interval = setInterval(() => {
      if (current >= mockBatchCount) {
        clearInterval(interval);
        setPhase('complete');
        return;
      }
      setBatches((prev) =>
        prev.map((batch, index) =>
          index === current
            ? { ...batch, status: 'confirmed' as const }
            : batch,
        ),
      );
      current += 1;
    }, 1000);
  }, [batchSize]);

  return (
    <StepPanel title="Distribute" description="Deploy the distribution contract and send tokens to recipients.">
      {!activeCampaign && (
        <p className="text-sm text-gray-400">No active campaign selected.</p>
      )}

      {activeCampaign && (
        <div className="space-y-6">
          {/* Pre-distribution summary */}
          {phase === 'ready' && (
            <div className="space-y-4">
              <div className="rounded-lg bg-gray-900 p-4 ring-1 ring-gray-800">
                <h3 className="text-sm font-semibold text-white mb-3">Distribution Plan</h3>
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
                    <span className="text-white">{activeCampaign.amountMode}</span>
                  </div>
                  {activeCampaign.uniformAmount && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Amount per recipient</span>
                      <span className="text-white">{activeCampaign.uniformAmount} {tokenSymbol}</span>
                    </div>
                  )}
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
              <p className="text-sm text-gray-400">Deploying distribution contract...</p>
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
                  totalTokensSent="--"
                  tokenSymbol={tokenSymbol}
                  uniqueRecipients={0}
                  batchCount={batches.length}
                  confirmedBatches={batches.filter((b) => b.status === 'confirmed').length}
                  failedBatches={batches.filter((b) => b.status === 'failed').length}
                />
              )}
            </div>
          )}
        </div>
      )}
    </StepPanel>
  );
}
