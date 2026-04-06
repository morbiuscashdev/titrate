import { useState, useEffect, useCallback } from 'react';
import { StepPanel } from '../components/StepPanel.js';
import { ChainSelector } from '../components/ChainSelector.js';
import { useCampaign } from '../providers/CampaignProvider.js';
import { useStorage } from '../providers/StorageProvider.js';
import { useTokenMetadata } from '../hooks/useTokenMetadata.js';
import { SUPPORTED_CHAINS, getChainConfig } from '@titrate/sdk';
import { keccak256, toHex } from 'viem';
import type { Address, Hex } from 'viem';
import type { StoredCampaign } from '@titrate/sdk';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;
const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

const chainOptions = SUPPORTED_CHAINS.map((c) => ({
  chainId: c.chainId,
  name: c.name,
}));

type ContractVariant = 'simple' | 'full';

/**
 * Derive a deterministic campaign identifier from the campaign name.
 * Returns a keccak256 hash for the 'full' contract variant, null otherwise.
 */
export function deriveCampaignId(name: string, variant: 'simple' | 'full'): Hex | null {
  if (variant !== 'full') return null;
  return keccak256(toHex(name));
}

/**
 * Clamp a batch size input value to a minimum of 1.
 * Non-numeric or falsy values default to 1.
 */
export function clampBatchSize(value: string): number {
  return Math.max(1, Number(value) || 1);
}

/**
 * Step 1: Campaign setup form.
 *
 * Collects chain selection, token address, contract configuration,
 * campaign name, and batch size. Saves to storage and advances to
 * the addresses step on submit.
 */
export function CampaignStep() {
  const { activeCampaign, saveCampaign, createCampaign, setActiveStep } = useCampaign();
  const { storage } = useStorage();

  const [chainId, setChainId] = useState<number | null>(null);
  const [rpcUrl, setRpcUrl] = useState('');
  const [tokenAddress, setTokenAddress] = useState('');
  const [contractVariant, setContractVariant] = useState<ContractVariant>('simple');
  const [campaignName, setCampaignName] = useState('');
  const [batchSize, setBatchSize] = useState(100);
  const [isSaving, setIsSaving] = useState(false);
  const [isCustomChain, setIsCustomChain] = useState(false);
  const [customChainName, setCustomChainName] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [explorerApiUrl, setExplorerApiUrl] = useState('');
  const [explorerApiKey, setExplorerApiKey] = useState('');
  const [rateLimitGroup, setRateLimitGroup] = useState('');

  // Determine whether the entered token address is valid hex for probing
  const normalizedTokenAddress: Address | null =
    ADDRESS_REGEX.test(tokenAddress) ? (tokenAddress.toLowerCase() as Address) : null;

  const { data: tokenMetadata, isLoading: isProbing, error: probeError } = useTokenMetadata(normalizedTokenAddress);

  // Initialize form from active campaign
  useEffect(() => {
    if (!activeCampaign) {
      return;
    }
    setChainId(activeCampaign.chainId || null);
    setRpcUrl(activeCampaign.rpcUrl);
    setTokenAddress(activeCampaign.tokenAddress === ZERO_ADDRESS ? '' : activeCampaign.tokenAddress);
    setContractVariant(activeCampaign.contractVariant);
    setCampaignName(activeCampaign.name);
    setBatchSize(activeCampaign.batchSize);
  }, [activeCampaign]);

  // Auto-fill RPC URL when a preset chain is selected
  const handleChainSelect = useCallback((selectedChainId: number) => {
    setChainId(selectedChainId);
    setIsCustomChain(false);
    setCustomChainName('');
    const config = getChainConfig(selectedChainId);
    if (config && config.rpcUrls.length > 0) {
      setRpcUrl(config.rpcUrls[0]);
    }
  }, []);

  // Switch to custom chain mode
  const handleCustomChain = useCallback(() => {
    setIsCustomChain(true);
    setChainId(null);
    setRpcUrl('');
    setCustomChainName('');
  }, []);

  const handleSave = useCallback(async () => {
    if (!chainId || !campaignName.trim()) {
      return;
    }

    setIsSaving(true);
    try {
      const resolvedTokenAddress = normalizedTokenAddress ?? ZERO_ADDRESS;
      const resolvedDecimals = tokenMetadata?.decimals ?? 18;

      const resolvedContractName = tokenMetadata?.symbol ?? activeCampaign?.contractName ?? '';

      let campaignId: string | null = activeCampaign?.id ?? null;

      if (activeCampaign) {
        const updated: StoredCampaign = {
          ...activeCampaign,
          chainId,
          rpcUrl,
          tokenAddress: resolvedTokenAddress,
          tokenDecimals: resolvedDecimals,
          contractVariant,
          contractName: resolvedContractName,
          name: campaignName.trim(),
          batchSize,
          campaignId: deriveCampaignId(campaignName.trim(), contractVariant),
        };
        await saveCampaign(updated);
      } else {
        campaignId = await createCampaign({
          funder: ZERO_ADDRESS,
          name: campaignName.trim(),
          version: 1,
          chainId,
          rpcUrl,
          tokenAddress: resolvedTokenAddress,
          tokenDecimals: resolvedDecimals,
          contractAddress: null,
          contractVariant,
          contractName: resolvedContractName,
          amountMode: 'uniform',
          amountFormat: 'integer',
          uniformAmount: null,
          batchSize,
          campaignId: deriveCampaignId(campaignName.trim(), contractVariant),
          pinnedBlock: null,
        });
      }

      // Persist chain config when explorer or rate limit fields are filled
      if (storage && campaignId && (explorerApiUrl || explorerApiKey || rateLimitGroup)) {
        let rpcBusKey = rateLimitGroup;
        if (!rpcBusKey) {
          try { rpcBusKey = new URL(rpcUrl).hostname; } catch { rpcBusKey = ''; }
        }
        let explorerBusKey = '';
        if (explorerApiUrl) {
          try { explorerBusKey = new URL(explorerApiUrl).hostname; } catch { /* empty */ }
        }
        await storage.chainConfigs.put({
          id: `campaign-${campaignId}`,
          chainId,
          name: customChainName || `Chain ${chainId}`,
          rpcUrl,
          rpcBusKey,
          explorerApiUrl,
          explorerApiKey,
          explorerBusKey,
          trueBlocksUrl: '',
          trueBlocksBusKey: '',
        });
      }

      setActiveStep('addresses');
    } finally {
      setIsSaving(false);
    }
  }, [
    chainId, rpcUrl, normalizedTokenAddress, tokenMetadata, contractVariant,
    campaignName, batchSize, activeCampaign, saveCampaign, createCampaign, setActiveStep,
    storage, explorerApiUrl, explorerApiKey, rateLimitGroup, customChainName,
  ]);

  const canSave = chainId !== null && campaignName.trim().length > 0;

  return (
    <StepPanel title="Campaign Setup" description="Configure the chain, token, and basic campaign settings.">
      <div className="space-y-6">
        {/* Chain Selection */}
        <div>
          <label className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1 block">Chain</label>
          <ChainSelector
            chains={chainOptions}
            selectedChainId={isCustomChain ? null : chainId}
            onSelect={handleChainSelect}
          />
          <button
            type="button"
            onClick={handleCustomChain}
            className={`mt-2 rounded-lg px-4 py-2 text-sm font-medium ring-1 transition-colors ${
              isCustomChain
                ? 'bg-blue-500/10 text-blue-400 ring-blue-500/30'
                : 'bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 ring-gray-200 dark:ring-gray-800 hover:ring-gray-300 dark:hover:ring-gray-700'
            }`}
          >
            Custom
          </button>
        </div>

        {/* Custom Chain Fields */}
        {isCustomChain && (
          <div className="space-y-4">
            <div>
              <label htmlFor="custom-chain-id" className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1 block">Chain ID</label>
              <input
                id="custom-chain-id"
                type="number"
                value={chainId ?? ''}
                onChange={(e) => setChainId(e.target.value ? Number(e.target.value) : null)}
                placeholder="e.g. 42161"
                className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor="custom-chain-name" className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1 block">Chain Name</label>
              <input
                id="custom-chain-name"
                type="text"
                value={customChainName}
                onChange={(e) => setCustomChainName(e.target.value)}
                placeholder="e.g. My Custom Chain"
                className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        )}

        {/* RPC URL */}
        <div>
          <label htmlFor="rpc-url" className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1 block">RPC URL</label>
          <input
            id="rpc-url"
            type="text"
            value={rpcUrl}
            onChange={(e) => setRpcUrl(e.target.value)}
            placeholder="https://..."
            className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Rate Limit Group */}
        <div>
          <label htmlFor="rate-limit-group" className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1 block">Rate limit group</label>
          <input
            id="rate-limit-group"
            type="text"
            value={rateLimitGroup}
            onChange={(e) => setRateLimitGroup(e.target.value)}
            placeholder={(() => { try { return rpcUrl ? new URL(rpcUrl).hostname : 'auto-derived from RPC URL'; } catch { return 'auto-derived from RPC URL'; } })()}
            className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            Share rate limits across endpoints (e.g., &quot;alchemy&quot; for all Alchemy chains).
          </p>
        </div>

        {/* Advanced: Explorer Fields */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            {showAdvanced ? 'Hide advanced' : 'Show advanced'}
          </button>
          {showAdvanced && (
            <div className="mt-3 space-y-4">
              <div>
                <label htmlFor="explorer-api-url" className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1 block">Explorer API URL</label>
                <input
                  id="explorer-api-url"
                  type="text"
                  value={explorerApiUrl}
                  onChange={(e) => setExplorerApiUrl(e.target.value)}
                  placeholder="https://api.etherscan.io/api"
                  className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="explorer-api-key" className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1 block">Explorer API Key</label>
                <input
                  id="explorer-api-key"
                  type="text"
                  value={explorerApiKey}
                  onChange={(e) => setExplorerApiKey(e.target.value)}
                  placeholder="Your API key"
                  className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          )}
        </div>

        {/* Token Address */}
        <div>
          <label htmlFor="token-address" className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1 block">Token Address</label>
          <input
            id="token-address"
            type="text"
            value={tokenAddress}
            onChange={(e) => setTokenAddress(e.target.value)}
            placeholder="0x..."
            className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {normalizedTokenAddress && isProbing && (
            <div className="mt-2 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
              </svg>
              Probing token...
            </div>
          )}
          {normalizedTokenAddress && !isProbing && tokenMetadata && (
            <div className="mt-2 rounded-lg bg-gray-50 dark:bg-gray-900 p-3 ring-1 ring-gray-200 dark:ring-gray-800">
              <div className="flex items-center gap-3 text-sm">
                <span className="font-medium text-gray-900 dark:text-white">{tokenMetadata.name}</span>
                <span className="text-gray-500 dark:text-gray-400">({tokenMetadata.symbol})</span>
                <span className="text-gray-400 dark:text-gray-500">{tokenMetadata.decimals} decimals</span>
              </div>
            </div>
          )}
          {normalizedTokenAddress && !isProbing && probeError && (
            <p className="mt-2 text-sm text-red-400">Failed to probe token. Check the address and chain.</p>
          )}
          {normalizedTokenAddress && !isProbing && tokenMetadata === null && !probeError && (
            <p className="mt-2 text-sm text-yellow-400">Not a valid ERC-20 token at this address.</p>
          )}
        </div>

        {/* Contract Variant */}
        <div>
          <label className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-2 block">Contract Variant</label>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setContractVariant('simple')}
              aria-pressed={contractVariant === 'simple'}
              className={`rounded-lg px-4 py-2 text-sm font-medium ring-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                contractVariant === 'simple'
                  ? 'bg-blue-500/10 text-blue-400 ring-blue-500/30'
                  : 'bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 ring-gray-200 dark:ring-gray-800 hover:ring-gray-300 dark:hover:ring-gray-700'
              }`}
            >
              Simple
            </button>
            <button
              type="button"
              onClick={() => setContractVariant('full')}
              aria-pressed={contractVariant === 'full'}
              className={`rounded-lg px-4 py-2 text-sm font-medium ring-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                contractVariant === 'full'
                  ? 'bg-blue-500/10 text-blue-400 ring-blue-500/30'
                  : 'bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 ring-gray-200 dark:ring-gray-800 hover:ring-gray-300 dark:hover:ring-gray-700'
              }`}
            >
              Full
            </button>
          </div>
        </div>

        {/* Campaign Name */}
        <div>
          <label htmlFor="campaign-name" className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1 block">Campaign Name</label>
          <input
            id="campaign-name"
            type="text"
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            placeholder="My Airdrop Campaign"
            className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Batch Size */}
        <div>
          <label htmlFor="batch-size" className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1 block">Batch Size</label>
          <input
            id="batch-size"
            type="number"
            value={batchSize}
            onChange={(e) => setBatchSize(clampBatchSize(e.target.value))}
            min={1}
            className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Number of recipients per transaction batch.</p>
        </div>

        {/* Save */}
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave || isSaving}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          {isSaving ? 'Saving...' : 'Save & Continue'}
        </button>
      </div>
    </StepPanel>
  );
}
