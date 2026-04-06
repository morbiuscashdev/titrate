import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useWalletClient } from 'wagmi';
import { erc20Abi, formatUnits, parseUnits, toFunctionSelector } from 'viem';
import type { Address, Hex } from 'viem';
import {
  deployDistributor,
  disperseTokens,
  disperseTokensSimple,
  disperseParallel,
  approveOperator,
  getAllowance,
  computeResumeOffset,
  parseGwei,
  validateBatch,
  hasErrors,
  hasWarnings,
  verifyContract,
} from '@titrate/sdk';
import type { BatchResult, GasConfig, InterventionConfig, PipelineConfig, ProgressEvent, StoredAddress, StoredBatch } from '@titrate/sdk';
import { StepPanel } from '../components/StepPanel.js';
import { BatchTimeline } from '../components/BatchTimeline.js';
import { SpendSummary } from '../components/SpendSummary.js';
import { GasConfigPanel, DEFAULT_GAS_CONFIG, percentToFeeBumpWad } from '../components/GasConfigPanel.js';
import type { GasConfigState } from '../components/GasConfigPanel.js';
import { InterventionControls } from '../components/InterventionControls.js';
import { useCampaign } from '../providers/CampaignProvider.js';
import { useChain } from '../providers/ChainProvider.js';
import { useStorage } from '../providers/StorageProvider.js';
import { useIntervention } from '../providers/InterventionProvider.js';
import { useWallet } from '../providers/WalletProvider.js';
import { useLiveFilter, composeLiveFilters } from '../hooks/useLiveFilter.js';
import { usePipelineLiveFilter } from '../hooks/usePipelineLiveFilter.js';
import type { BatchStatusCardProps } from '../components/BatchStatusCard.js';

/**
 * Clamps a batch size to fit within the block gas limit.
 *
 * @param params - Gas parameters for the computation
 * @returns The effective batch size and whether it was clamped
 */
export function clampBatchSizeForGas(params: {
  readonly batchSize: number;
  readonly gasPerTransfer?: number;
  readonly gasLimitBuffer?: number;
  readonly maxTxGas?: bigint;
}): { readonly effectiveBatchSize: number; readonly wasClamped: boolean } {
  const gasPerTransfer = params.gasPerTransfer ?? 28_000;
  const gasLimitBuffer = params.gasLimitBuffer ?? 1.2;
  const maxTxGas = params.maxTxGas ?? 16_777_216n;
  const maxBatch = Math.floor(Number(maxTxGas) / (gasPerTransfer * gasLimitBuffer));
  const effective = Math.min(params.batchSize, maxBatch);
  return { effectiveBatchSize: effective, wasClamped: effective < params.batchSize };
}

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
 * Converts a BatchResult from the SDK into a StoredBatch for IDB persistence.
 *
 * @param campaignId - The campaign this batch belongs to
 * @param result - The SDK batch result to convert
 * @returns A StoredBatch ready for storage.batches.put()
 */
export function batchResultToStored(
  campaignId: string,
  result: BatchResult,
): StoredBatch {
  return {
    id: crypto.randomUUID(),
    campaignId,
    batchIndex: result.batchIndex,
    recipients: result.recipients,
    amounts: result.amounts.map((a) => a.toString()),
    status: result.confirmedTxHash ? 'confirmed' : 'failed',
    attempts: result.attempts,
    confirmedTxHash: result.confirmedTxHash,
    confirmedBlock: result.blockNumber,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Derives the block explorer base URL from the explorer API URL.
 * For example, "https://api.etherscan.io/api" becomes "https://etherscan.io".
 *
 * @returns The explorer base URL, or null if it cannot be derived
 */
export function deriveExplorerBaseUrl(explorerApiUrl: string | undefined): string | null {
  if (!explorerApiUrl) return null;
  try {
    const url = new URL(explorerApiUrl);
    // Strip "api." prefix and "/api" path suffix
    const host = url.hostname.replace(/^api\./, '');
    return `${url.protocol}//${host}`;
  } catch {
    return null;
  }
}

/**
 * Renders a contract address as a truncated monospace string, optionally
 * linked to the block explorer when an explorer API URL is configured.
 */
function ContractAddressLink({
  address,
  explorerApiUrl,
}: {
  readonly address: string;
  readonly explorerApiUrl?: string;
}) {
  const baseUrl = deriveExplorerBaseUrl(explorerApiUrl);
  const truncated = `${address.slice(0, 10)}...${address.slice(-6)}`;

  if (baseUrl) {
    return (
      <a
        href={`${baseUrl}/address/${address}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 font-mono text-xs"
      >
        {truncated}
      </a>
    );
  }

  return (
    <span className="text-gray-900 dark:text-white font-mono text-xs">
      {truncated}
    </span>
  );
}

/**
 * Seventh campaign step: deploy contract and distribute tokens.
 *
 * Integrates with the SDK's deployDistributor, disperseTokensSimple,
 * and disperseTokens to perform real on-chain distribution.
 */
export function DistributeStep() {
  const { activeCampaign, saveCampaign } = useCampaign();
  const { publicClient, chainConfig } = useChain();
  const { storage } = useStorage();
  const { data: walletClient } = useWalletClient();
  const { createInterventionHook, enabledPoints, setEnabledPoints, journal } = useIntervention();
  const { walletClients: derivedWalletClients, address: coldWalletAddress } = useWallet();

  const [phase, setPhase] = useState<DistributePhase>('ready');
  const [batches, setBatches] = useState<readonly BatchStatusCardProps[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<readonly StoredAddress[]>([]);
  const [results, setResults] = useState<readonly BatchResult[]>([]);
  const [savedBatches, setSavedBatches] = useState<readonly StoredBatch[]>([]);
  const [gasConfig, setGasConfig] = useState<GasConfigState>(DEFAULT_GAS_CONFIG);
  const [throughput, setThroughput] = useState<{
    readonly addressesPerHour: number;
    readonly addressesCompleted: number;
    readonly estimatedRemainingMs: number;
  } | null>(null);
  const [pipelineConfig, setPipelineConfig] = useState<PipelineConfig | null>(null);
  const [sweepAddress, setSweepAddress] = useState<string>('');
  const [sweepState, setSweepState] = useState<{
    readonly status: 'idle' | 'sweeping' | 'done' | 'error';
    readonly progress: number;
    readonly errorMessage: string | null;
  }>({ status: 'idle', progress: 0, errorMessage: null });
  const recipientsLoadedRef = useRef(false);
  const savedBatchesLoadedRef = useRef(false);
  const pipelineConfigLoadedRef = useRef(false);
  const [verifyState, setVerifyState] = useState<{
    readonly status: 'idle' | 'verifying' | 'success' | 'error';
    readonly message: string | null;
    readonly explorerUrl: string | null;
  }>({ status: 'idle', message: null, explorerUrl: null });

  const rawBatchSize = activeCampaign?.batchSize ?? 100;
  const { effectiveBatchSize, wasClamped } = useMemo(
    () => clampBatchSizeForGas({ batchSize: rawBatchSize }),
    [rawBatchSize],
  );
  const batchSize = effectiveBatchSize;
  const tokenSymbol = activeCampaign?.contractName || 'TOKEN';
  const tokenDecimals = activeCampaign?.tokenDecimals ?? 18;
  const hasContract =
    activeCampaign?.contractAddress !== null &&
    activeCampaign?.contractAddress !== undefined;

  // Registry-based live filter for TitrateFull (double-send protection)
  const registryFilter = useLiveFilter({
    contractAddress: (activeCampaign?.contractAddress ?? null) as Address | null,
    campaignId: activeCampaign?.campaignId ?? null,
    variant: activeCampaign?.contractVariant ?? 'simple',
  });

  // Pipeline-based live filter from FiltersStep config
  const pipelineFilter = usePipelineLiveFilter(
    pipelineConfig,
    recipients.map((r) => r.address) as Address[],
  );

  // Compose registry + pipeline filters into a single live filter chain
  const composedLiveFilter = useMemo(
    () => composeLiveFilters(registryFilter, pipelineFilter),
    [registryFilter, pipelineFilter],
  );

  const liveFilterStatus: 'on' | 'off' = composedLiveFilter ? 'on' : 'off';

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

  // Load saved batches from IDB when campaign is active
  useEffect(() => {
    if (!activeCampaign || !storage || savedBatchesLoadedRef.current) return;

    savedBatchesLoadedRef.current = true;
    void (async () => {
      try {
        const existing = await storage.batches.getByCampaign(activeCampaign.id);
        setSavedBatches(existing);

        if (existing.length > 0) {
          // Pre-populate timeline with saved batch cards
          const cards: BatchStatusCardProps[] = existing.map((b) => ({
            batchIndex: b.batchIndex,
            recipientCount: b.recipients.length,
            status: toBatchCardStatus(b.status),
            txHash: b.confirmedTxHash ?? undefined,
          }));
          setBatches(cards);
        }
      } catch {
        // Non-critical — saved batches are optional for resume
      }
    })();
  }, [activeCampaign, storage]);

  // Load pipeline config from storage when campaign is active
  useEffect(() => {
    if (!activeCampaign || !storage || pipelineConfigLoadedRef.current) return;

    pipelineConfigLoadedRef.current = true;
    void (async () => {
      try {
        const config = await storage.pipelineConfigs.get(activeCampaign.id);
        setPipelineConfig(config);
      } catch {
        // Non-critical — pipeline config is optional
      }
    })();
  }, [activeCampaign, storage]);

  // Default sweep address to the cold wallet address
  useEffect(() => {
    if (coldWalletAddress) setSweepAddress(coldWalletAddress);
  }, [coldWalletAddress]);

  // Detect fully-complete distributions once both saved batches and recipients are loaded
  useEffect(() => {
    if (savedBatches.length === 0 || recipients.length === 0 || phase !== 'ready') return;

    const expectedBatchCount = Math.ceil(recipients.length / batchSize);
    const confirmedCount = savedBatches.filter((b) => b.status === 'confirmed').length;

    if (confirmedCount < expectedBatchCount) return;

    setPhase('complete');
    const restoredResults: BatchResult[] = savedBatches.map((b) => ({
      batchIndex: b.batchIndex,
      recipients: b.recipients,
      amounts: b.amounts.map((a) => BigInt(a)),
      attempts: b.attempts,
      confirmedTxHash: b.confirmedTxHash,
      blockNumber: b.confirmedBlock,
    }));
    setResults(restoredResults);
  }, [savedBatches, recipients, batchSize, phase]);

  // Reset loaded flags when campaign changes
  useEffect(() => {
    recipientsLoadedRef.current = false;
    savedBatchesLoadedRef.current = false;
    pipelineConfigLoadedRef.current = false;
    setRecipients([]);
    setSavedBatches([]);
    setPipelineConfig(null);
    setError(null);
    setBatches([]);
    setResults([]);
    setPhase('ready');
    setVerifyState({ status: 'idle', message: null, explorerUrl: null });
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

  const handleVerify = useCallback(async () => {
    if (!activeCampaign?.contractAddress || !activeCampaign.chainId) return;

    setVerifyState({ status: 'verifying', message: null, explorerUrl: null });
    try {
      const result = await verifyContract({
        address: activeCampaign.contractAddress as Address,
        name: activeCampaign.contractName || 'Titrate',
        variant: activeCampaign.contractVariant,
        chainId: activeCampaign.chainId,
      });
      setVerifyState({
        status: result.success ? 'success' : 'error',
        message: result.message,
        explorerUrl: result.explorerUrl,
      });
    } catch (err: unknown) {
      setVerifyState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Verification failed',
        explorerUrl: null,
      });
    }
  }, [activeCampaign]);

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

    // Pre-flight: check for pending mempool transactions
    try {
      const senderAddress = walletClient.account!.address;
      const [confirmedNonce, pendingNonce] = await Promise.all([
        publicClient.getTransactionCount({ address: senderAddress }),
        publicClient.getTransactionCount({ address: senderAddress, blockTag: 'pending' }),
      ]);
      if (pendingNonce > confirmedNonce) {
        setError(
          `You have ${pendingNonce - confirmedNonce} pending transaction(s). Wait for them to confirm before distributing.`,
        );
        setPhase('ready');
        return;
      }
    } catch {
      // Non-critical — continue even if nonce check fails
    }

    // Pre-distribution validation
    const validationAmounts = activeCampaign.amountMode === 'uniform'
      ? recipients.map(() => BigInt(activeCampaign.uniformAmount ?? '0'))
      : recipients.map((r) => BigInt(r.amount ?? '0'));

    const issues = validateBatch(
      recipients.map((r) => r.address) as Address[],
      validationAmounts,
    );

    if (hasErrors(issues)) {
      setError(
        `Validation failed: ${issues.filter((i) => i.severity === 'error').map((i) => i.message).join('; ')}`,
      );
      return;
    }

    if (hasWarnings(issues)) {
      const interventionHook = createInterventionHook();
      const decision = await interventionHook({
        point: 'validation-warning',
        data: {
          issues: issues.filter((i) => i.severity === 'warning'),
          recipientCount: recipients.length,
        },
      });
      if (decision.type === 'abort') {
        setError('Distribution aborted due to validation warnings.');
        return;
      }
    }

    // Compute total ERC-20 needed for approval
    let totalNeeded = 0n;
    if (activeCampaign.amountMode === 'uniform') {
      totalNeeded = BigInt(activeCampaign.uniformAmount ?? '0') * BigInt(recipients.length);
    } else {
      for (const r of recipients) {
        totalNeeded += BigInt(r.amount ?? '0');
      }
    }

    const useParallel = derivedWalletClients.length > 1;
    const contractAddress = activeCampaign.contractAddress as Address;

    // Check and request approval if needed
    if (totalNeeded > 0n) {
      setPhase('approving');
      try {
        if (useParallel) {
          // Per-wallet approvals for parallel distribution
          for (const client of derivedWalletClients) {
            if (activeCampaign.contractVariant === 'simple') {
              const currentAllowance = await publicClient.readContract({
                address: activeCampaign.tokenAddress,
                abi: erc20Abi,
                functionName: 'allowance',
                args: [client.account!.address, contractAddress],
              }) as bigint;

              if (currentAllowance < totalNeeded / BigInt(derivedWalletClients.length)) {
                const approveHash = await client.writeContract({
                  address: activeCampaign.tokenAddress,
                  abi: erc20Abi,
                  functionName: 'approve',
                  args: [contractAddress, totalNeeded],
                  account: client.account!,
                  chain: undefined,
                });
                await publicClient.waitForTransactionReceipt({ hash: approveHash });
              }
            } else {
              const selector = getDisperseSelector(activeCampaign.amountMode);
              const currentAllowance = await getAllowance({
                contractAddress,
                owner: client.account!.address,
                operator: client.account!.address,
                selector,
                publicClient,
              });

              if (currentAllowance < totalNeeded / BigInt(derivedWalletClients.length)) {
                await approveOperator({
                  contractAddress,
                  operator: client.account!.address,
                  selector,
                  amount: totalNeeded,
                  walletClient: client,
                  publicClient,
                });
              }
            }
          }
        } else if (activeCampaign.contractVariant === 'simple') {
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

    // Compute resume offset to skip already-confirmed recipients
    const resumeOffset = computeResumeOffset(savedBatches, batchSize);
    let recipientAddresses = recipients.map((r) => r.address);
    let variableAmounts = recipients.map((r) => BigInt(r.amount ?? '0'));

    if (resumeOffset > 0) {
      recipientAddresses = recipientAddresses.slice(resumeOffset);
      variableAmounts = variableAmounts.slice(resumeOffset);
    }

    // Build initial timeline: keep saved batch cards, add pending for remaining
    const totalNewBatches = Math.ceil(recipientAddresses.length / batchSize);
    const savedCards: BatchStatusCardProps[] = savedBatches.map((b) => ({
      batchIndex: b.batchIndex,
      recipientCount: b.recipients.length,
      status: toBatchCardStatus(b.status),
      txHash: b.confirmedTxHash ?? undefined,
    }));
    const newCards: BatchStatusCardProps[] = Array.from(
      { length: totalNewBatches },
      (_, index) => {
        const adjustedIndex = index + (resumeOffset / batchSize);
        return {
          batchIndex: adjustedIndex,
          recipientCount: Math.min(
            batchSize,
            recipientAddresses.length - index * batchSize,
          ),
          status: 'pending' as const,
        };
      },
    );
    setBatches([...savedCards, ...newCards]);

    // Pre-send: save pending batch records BEFORE distribution to prevent
    // double-sends on crash — prefer under-sending to double-sending
    if (storage && activeCampaign) {
      for (const card of newCards) {
        const startIdx = card.batchIndex * batchSize - resumeOffset;
        const endIdx = Math.min(startIdx + batchSize, recipientAddresses.length);
        const batchRecipients = recipientAddresses.slice(
          startIdx < 0 ? 0 : startIdx,
          endIdx,
        );

        await storage.batches.put({
          id: crypto.randomUUID(),
          campaignId: activeCampaign.id,
          batchIndex: card.batchIndex,
          recipients: batchRecipients,
          amounts: [],
          status: 'pending',
          attempts: [],
          confirmedTxHash: null,
          confirmedBlock: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }

    const onProgress = (event: ProgressEvent) => {
      if (event.type === 'throughput') {
        setThroughput({
          addressesPerHour: event.addressesPerHour,
          addressesCompleted: event.addressesCompleted,
          estimatedRemainingMs: event.estimatedRemainingMs,
        });
        return;
      }

      if (event.type !== 'batch') return;

      setBatches((prev) =>
        prev.map((batch) =>
          batch.batchIndex === event.batchIndex
            ? { ...batch, status: toBatchCardStatus(event.status) }
            : batch,
        ),
      );
    };

    // Build SDK GasConfig from UI state
    const sdkGasConfig: GasConfig = {
      headroom: gasConfig.headroom,
      priority: gasConfig.priority,
      maxBaseFee: gasConfig.maxBaseFeeGwei ? parseGwei(gasConfig.maxBaseFeeGwei) : undefined,
      maxPriorityFee: gasConfig.maxPriorityFeeGwei ? parseGwei(gasConfig.maxPriorityFeeGwei) : undefined,
      maxTotalGasCost: gasConfig.maxTotalGasCostEth ? parseUnits(gasConfig.maxTotalGasCostEth, 18) : undefined,
      feeBumpWad: gasConfig.feeBumpPercent ? percentToFeeBumpWad(gasConfig.feeBumpPercent) : undefined,
    };

    const revalidation = gasConfig.enableRevalidation
      ? { invalidThreshold: gasConfig.invalidThreshold }
      : undefined;

    // Build intervention config from the provider
    const interventionHook = createInterventionHook();
    const interventionConfig: InterventionConfig = {
      onIntervention: interventionHook,
      reviewBeforeEachBatch: enabledPoints.has('batch-preview'),
      autoApproveClean: true,
      stuckTransactionTimeout: enabledPoints.has('stuck-transaction') ? 60_000 : undefined,
    };

    try {
      let batchResults: BatchResult[];

      if (useParallel) {
        // Multi-wallet parallel dispatch
        const parallelResults = await disperseParallel({
          contractAddress: activeCampaign.contractAddress as Address,
          variant: activeCampaign.contractVariant,
          token: activeCampaign.tokenAddress,
          recipients: recipientAddresses as Address[],
          amount: activeCampaign.amountMode === 'uniform' ? BigInt(activeCampaign.uniformAmount ?? '0') : undefined,
          amounts: activeCampaign.amountMode === 'variable' ? variableAmounts : undefined,
          walletClients: derivedWalletClients,
          publicClient,
          batchSize,
          gasConfig: sdkGasConfig,
          onProgress,
        });

        batchResults = parallelResults.flatMap((pr) => [...pr.results]);
      } else if (activeCampaign.amountMode === 'uniform') {
        batchResults = await disperseTokensSimple({
          contractAddress: activeCampaign.contractAddress as Address,
          variant: activeCampaign.contractVariant,
          token: activeCampaign.tokenAddress,
          recipients: recipientAddresses,
          amount: BigInt(activeCampaign.uniformAmount ?? '0'),
          walletClient,
          publicClient,
          batchSize,
          liveFilter: composedLiveFilter,
          onProgress,
          gasConfig: sdkGasConfig,
          nonceWindow: gasConfig.nonceWindow,
          revalidation,
          interventionConfig,
        });
      } else {
        batchResults = await disperseTokens({
          contractAddress: activeCampaign.contractAddress as Address,
          variant: activeCampaign.contractVariant,
          token: activeCampaign.tokenAddress,
          recipients: recipientAddresses,
          amounts: variableAmounts,
          walletClient,
          publicClient,
          batchSize,
          liveFilter: composedLiveFilter,
          onProgress,
          gasConfig: sdkGasConfig,
          nonceWindow: gasConfig.nonceWindow,
          revalidation,
          interventionConfig,
        });
      }

      // Update pre-saved pending batch records with final results
      for (const result of batchResults) {
        const stored = batchResultToStored(activeCampaign.id, result);
        await storage.batches.put(stored);
      }

      setResults(batchResults);

      // Update batches with final tx hashes and gas cost
      setBatches((prev) =>
        prev.map((batch) => {
          const result = batchResults.find(
            (r) => r.batchIndex === batch.batchIndex,
          );
          if (!result) return batch;
          const lastAttempt = result.attempts[result.attempts.length - 1];
          const gasEstimate = lastAttempt
            ? `${formatUnits(lastAttempt.gasEstimate * lastAttempt.maxFeePerGas, 18)} ETH`
            : undefined;
          return {
            ...batch,
            status: result.confirmedTxHash ? 'confirmed' : 'failed',
            txHash: result.confirmedTxHash ?? undefined,
            gasEstimate,
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
    savedBatches,
    storage,
    gasConfig,
    composedLiveFilter,
    createInterventionHook,
    enabledPoints,
    derivedWalletClients,
  ]);

  /** Sweep remaining token and ETH balances from derived wallets back to a target address. */
  const handleSweep = useCallback(async () => {
    if (!sweepAddress || derivedWalletClients.length === 0 || !publicClient || !activeCampaign) return;

    setSweepState({ status: 'sweeping', progress: 0, errorMessage: null });

    try {
      for (let i = 0; i < derivedWalletClients.length; i++) {
        const client = derivedWalletClients[i];
        const walletAddress = client.account!.address;
        const target = sweepAddress as Address;

        // Sweep tokens
        const tokenBal = await publicClient.readContract({
          address: activeCampaign.tokenAddress,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [walletAddress],
        }) as bigint;

        if (tokenBal > 0n) {
          const hash = await client.writeContract({
            address: activeCampaign.tokenAddress,
            abi: erc20Abi,
            functionName: 'transfer',
            args: [target, tokenBal],
            account: client.account!,
            chain: undefined,
          });
          await publicClient.waitForTransactionReceipt({ hash });
        }

        // Sweep ETH (leave gas for the tx itself)
        const ethBal = await publicClient.getBalance({ address: walletAddress });
        const gasPrice = await publicClient.getGasPrice();
        const gasCost = 21_000n * gasPrice;
        if (ethBal > gasCost) {
          const hash = await client.sendTransaction({
            to: target,
            value: ethBal - gasCost,
            account: client.account!,
            chain: undefined,
          });
          await publicClient.waitForTransactionReceipt({ hash });
        }

        setSweepState((prev) => ({ ...prev, progress: i + 1 }));
      }

      setSweepState({ status: 'done', progress: derivedWalletClients.length, errorMessage: null });
    } catch (err: unknown) {
      setSweepState({
        status: 'error',
        progress: 0,
        errorMessage: err instanceof Error ? err.message : 'Sweep failed',
      });
    }
  }, [sweepAddress, derivedWalletClients, publicClient, activeCampaign]);

  // Compute resume state from saved batches
  const confirmedSavedCount = savedBatches.filter((b) => b.status === 'confirmed').length;
  const totalSavedCount = savedBatches.length;
  const hasIncompleteResume = totalSavedCount > 0 && confirmedSavedCount < Math.ceil(recipients.length / batchSize) && phase === 'ready';
  const isResuming = hasIncompleteResume && confirmedSavedCount > 0;

  // Compute spend summary from results
  const summaryData = (() => {
    const recipientSet = new Set<string>();
    let totalTokensSent = 0n;
    let totalGasCost = 0n;
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
        const lastAttempt = result.attempts[result.attempts.length - 1];
        if (lastAttempt) {
          totalGasCost += lastAttempt.gasEstimate * lastAttempt.maxFeePerGas;
        }
      } else {
        failedCount++;
      }
    }

    const gasDisplay = totalGasCost > 0n
      ? `${formatUnits(totalGasCost, 18)} ETH`
      : '--';

    return {
      totalGasEstimate: gasDisplay,
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
        <p className="text-sm text-gray-500 dark:text-gray-400">No active campaign selected.</p>
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
              <div className="rounded-lg bg-gray-50 dark:bg-gray-900 p-3 sm:p-4 ring-1 ring-gray-200 dark:ring-gray-800">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                  Distribution Plan
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500 dark:text-gray-400">Campaign</span>
                    <span className="text-gray-900 dark:text-white">{activeCampaign.name}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500 dark:text-gray-400">Batch size</span>
                    <span className="text-gray-900 dark:text-white">
                      {batchSize}{wasClamped ? ` (clamped from ${rawBatchSize})` : ''}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500 dark:text-gray-400">Amount mode</span>
                    <span className="text-gray-900 dark:text-white">
                      {activeCampaign.amountMode}
                    </span>
                  </div>
                  {activeCampaign.uniformAmount && (
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-500 dark:text-gray-400">
                        Amount per recipient
                      </span>
                      <span className="text-gray-900 dark:text-white">
                        {activeCampaign.uniformAmount} {tokenSymbol}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500 dark:text-gray-400">Recipients</span>
                    <span className="text-gray-900 dark:text-white">{recipients.length}</span>
                  </div>
                  {derivedWalletClients.length > 1 && (
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-500 dark:text-gray-400">Wallets</span>
                      <span className="text-gray-900 dark:text-white">{derivedWalletClients.length} (parallel)</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500 dark:text-gray-400">Contract</span>
                    {hasContract ? (
                      <ContractAddressLink
                        address={activeCampaign.contractAddress as string}
                        explorerApiUrl={chainConfig?.explorerApiUrl}
                      />
                    ) : (
                      <span className="text-gray-900 dark:text-white">Not deployed</span>
                    )}
                  </div>
                  {hasContract && (
                    <div className="flex items-center gap-3 mt-1">
                      <button
                        type="button"
                        onClick={handleVerify}
                        disabled={verifyState.status === 'verifying'}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 disabled:opacity-50 transition-colors"
                      >
                        {verifyState.status === 'verifying' ? 'Verifying...' : 'Verify on Explorer'}
                      </button>
                      {verifyState.status === 'success' && verifyState.explorerUrl && (
                        <a
                          href={verifyState.explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-green-600 dark:text-green-400 hover:text-green-500"
                        >
                          Verified
                        </a>
                      )}
                      {verifyState.status === 'success' && !verifyState.explorerUrl && (
                        <span className="text-xs text-green-600 dark:text-green-400">Verified</span>
                      )}
                      {verifyState.status === 'error' && (
                        <span className="text-xs text-red-400">{verifyState.message}</span>
                      )}
                    </div>
                  )}
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500 dark:text-gray-400">Live filter</span>
                    {liveFilterStatus === 'on' ? (
                      <span className="text-green-600 dark:text-green-400">ON (registry check)</span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">OFF</span>
                    )}
                  </div>
                  {pipelineConfig && pipelineConfig.steps.length > 0 && (
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-500 dark:text-gray-400">Pipeline filters</span>
                      <span className="text-gray-900 dark:text-white">
                        {pipelineConfig.steps.filter((s) => s.type === 'filter').length} configured
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <GasConfigPanel config={gasConfig} onChange={setGasConfig} />

              <InterventionControls enabledPoints={enabledPoints} onChange={setEnabledPoints} />

              {wasClamped && (
                <div className="rounded-md bg-yellow-900/20 p-3 text-sm text-yellow-600 dark:text-yellow-400">
                  Batch size clamped from {rawBatchSize} to {effectiveBatchSize} to fit within gas limit.
                </div>
              )}

              {activeCampaign.contractVariant === 'simple' && (
                <div className="rounded-md bg-gray-100 dark:bg-gray-900/50 p-3 text-xs text-gray-500 dark:text-gray-400 ring-1 ring-gray-200 dark:ring-gray-800">
                  Live filter (double-send protection) requires the Full contract variant. The Simple variant does not include an on-chain recipient registry.
                </div>
              )}

              {isResuming && (
                <div className="rounded-md bg-yellow-900/20 p-3 text-sm text-yellow-400 ring-1 ring-yellow-900/30">
                  {confirmedSavedCount} of {Math.ceil(recipients.length / batchSize)} batches completed. Resume from batch {confirmedSavedCount + 1}?
                </div>
              )}

              {isResuming && batches.length > 0 && (
                <BatchTimeline batches={batches} />
              )}

              <div className="flex flex-wrap gap-3">
                {!hasContract && (
                  <button
                    type="button"
                    onClick={handleDeploy}
                    className="bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950"
                  >
                    Deploy Contract
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleDistribute}
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950"
                >
                  {isResuming ? 'Resume Distribution' : 'Start Distribution'}
                </button>
              </div>
            </div>
          )}

          {/* Phase status announcements */}
          <div role="status" aria-live="polite">
            {/* Deploying state */}
            {phase === 'deploying' && (
              <div className="rounded-lg bg-gray-50 dark:bg-gray-900 p-6 ring-1 ring-gray-200 dark:ring-gray-800 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Deploying distribution contract...
                </p>
              </div>
            )}

            {/* Approving state */}
            {phase === 'approving' && (
              <div className="rounded-lg bg-gray-50 dark:bg-gray-900 p-6 ring-1 ring-gray-200 dark:ring-gray-800 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Approving token spend... Please confirm in your wallet.
                </p>
              </div>
            )}

            {/* Distributing state + throughput */}
            {phase === 'distributing' && (
              <div className="rounded-md bg-blue-900/20 p-3 text-sm text-blue-400 ring-1 ring-blue-900/30">
                <p>Distribution in progress...</p>
                {throughput && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-blue-300">
                    <span>{throughput.addressesCompleted.toLocaleString()} addresses sent</span>
                    <span>{throughput.addressesPerHour.toLocaleString()} addr/hr</span>
                    {throughput.estimatedRemainingMs > 0 && (
                      <span>~{Math.ceil(throughput.estimatedRemainingMs / 60_000)} min remaining</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Complete state */}
            {phase === 'complete' && (
              <p className="sr-only">Distribution complete.</p>
            )}
          </div>

          {/* Distribution in progress */}
          {(phase === 'distributing' || phase === 'complete') && (
            <div className="space-y-6">

              <BatchTimeline batches={batches} />

              {phase === 'complete' && (
                <SpendSummary
                  totalGasEstimate={summaryData.totalGasEstimate}
                  totalTokensSent={summaryData.totalTokensSent}
                  tokenSymbol={tokenSymbol}
                  uniqueRecipients={summaryData.uniqueRecipients}
                  batchCount={summaryData.batchCount}
                  confirmedBatches={summaryData.confirmedBatches}
                  failedBatches={summaryData.failedBatches}
                />
              )}

              {phase === 'complete' && derivedWalletClients.length > 1 && (
                <div className="rounded-lg bg-gray-50 dark:bg-gray-900 p-4 ring-1 ring-gray-200 dark:ring-gray-800 space-y-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Sweep Remaining Balances</h3>
                  <div>
                    <label className="block text-xs text-gray-400 dark:text-gray-500 mb-1">Sweep to address</label>
                    <input
                      type="text"
                      value={sweepAddress}
                      onChange={(e) => setSweepAddress(e.target.value)}
                      placeholder="0x..."
                      className="w-full rounded-lg bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white ring-1 ring-gray-300 dark:ring-gray-700 focus:ring-blue-500 focus:outline-none font-mono"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleSweep}
                      disabled={!sweepAddress || sweepState.status === 'sweeping'}
                      className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                    >
                      {sweepState.status === 'sweeping'
                        ? `Sweeping ${sweepState.progress}/${derivedWalletClients.length}...`
                        : 'Sweep All to Address'}
                    </button>
                    {sweepState.status === 'done' && (
                      <span className="text-sm text-green-600 dark:text-green-400">Sweep complete</span>
                    )}
                    {sweepState.status === 'error' && (
                      <span className="text-sm text-red-400">{sweepState.errorMessage}</span>
                    )}
                  </div>
                </div>
              )}

              {phase === 'complete' && journal.length > 0 && (
                <div className="rounded-lg bg-gray-50 dark:bg-gray-900 p-4 ring-1 ring-gray-200 dark:ring-gray-800">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                    Intervention Journal ({journal.length} {journal.length === 1 ? 'entry' : 'entries'})
                  </h3>
                  <div className="space-y-2">
                    {journal.map((entry, index) => (
                      <div key={index} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 dark:text-gray-500">
                            {new Date(entry.timestamp).toLocaleTimeString()}
                          </span>
                          <span className="font-medium text-gray-700 dark:text-gray-300">
                            {entry.point}
                          </span>
                        </div>
                        <span className={
                          entry.action === 'approve' ? 'text-green-600 dark:text-green-400' :
                          entry.action === 'abort' ? 'text-red-600 dark:text-red-400' :
                          'text-gray-600 dark:text-gray-300'
                        }>
                          {entry.action}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </StepPanel>
  );
}
