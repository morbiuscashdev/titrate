import { useState, useEffect, useCallback } from 'react';
import { StepPanel } from '../components/StepPanel.js';
import { ChainSelector } from '../components/ChainSelector.js';
import { useCampaign } from '../providers/CampaignProvider.js';
import { useTokenMetadata } from '../hooks/useTokenMetadata.js';
import { SUPPORTED_CHAINS, getChainConfig } from '@titrate/sdk';
import type { Address } from 'viem';
import type { StoredCampaign } from '@titrate/sdk';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;
const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

const chainOptions = SUPPORTED_CHAINS.map((c) => ({
  chainId: c.chainId,
  name: c.name,
}));

type ContractVariant = 'simple' | 'full';

/**
 * Step 1: Campaign setup form.
 *
 * Collects chain selection, token address, contract configuration,
 * campaign name, and batch size. Saves to storage and advances to
 * the addresses step on submit.
 */
export function CampaignStep() {
  const { activeCampaign, saveCampaign, createCampaign, setActiveStep } = useCampaign();

  const [chainId, setChainId] = useState<number | null>(null);
  const [rpcUrl, setRpcUrl] = useState('');
  const [tokenAddress, setTokenAddress] = useState('');
  const [contractVariant, setContractVariant] = useState<ContractVariant>('simple');
  const [campaignName, setCampaignName] = useState('');
  const [batchSize, setBatchSize] = useState(100);
  const [isSaving, setIsSaving] = useState(false);

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

  // Auto-fill RPC URL when chain changes
  const handleChainSelect = useCallback((selectedChainId: number) => {
    setChainId(selectedChainId);
    const config = getChainConfig(selectedChainId);
    if (config && config.rpcUrls.length > 0) {
      setRpcUrl(config.rpcUrls[0]);
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!chainId || !campaignName.trim()) {
      return;
    }

    setIsSaving(true);
    try {
      const resolvedTokenAddress = normalizedTokenAddress ?? ZERO_ADDRESS;
      const resolvedDecimals = tokenMetadata?.decimals ?? 18;

      if (activeCampaign) {
        const updated: StoredCampaign = {
          ...activeCampaign,
          chainId,
          rpcUrl,
          tokenAddress: resolvedTokenAddress,
          tokenDecimals: resolvedDecimals,
          contractVariant,
          name: campaignName.trim(),
          batchSize,
        };
        await saveCampaign(updated);
      } else {
        await createCampaign({
          funder: ZERO_ADDRESS,
          name: campaignName.trim(),
          version: 1,
          chainId,
          rpcUrl,
          tokenAddress: resolvedTokenAddress,
          tokenDecimals: resolvedDecimals,
          contractAddress: null,
          contractVariant,
          contractName: '',
          amountMode: 'uniform',
          amountFormat: 'integer',
          uniformAmount: null,
          batchSize,
          campaignId: null,
          pinnedBlock: null,
        });
      }
      setActiveStep('addresses');
    } finally {
      setIsSaving(false);
    }
  }, [
    chainId, rpcUrl, normalizedTokenAddress, tokenMetadata, contractVariant,
    campaignName, batchSize, activeCampaign, saveCampaign, createCampaign, setActiveStep,
  ]);

  const canSave = chainId !== null && campaignName.trim().length > 0;

  return (
    <StepPanel title="Campaign Setup" description="Configure the chain, token, and basic campaign settings.">
      <div className="space-y-6">
        {/* Chain Selection */}
        <div>
          <label className="text-sm font-medium text-gray-300 mb-1 block">Chain</label>
          <ChainSelector chains={chainOptions} selectedChainId={chainId} onSelect={handleChainSelect} />
        </div>

        {/* RPC URL */}
        <div>
          <label className="text-sm font-medium text-gray-300 mb-1 block">RPC URL</label>
          <input
            type="text"
            value={rpcUrl}
            onChange={(e) => setRpcUrl(e.target.value)}
            placeholder="https://..."
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Token Address */}
        <div>
          <label className="text-sm font-medium text-gray-300 mb-1 block">Token Address</label>
          <input
            type="text"
            value={tokenAddress}
            onChange={(e) => setTokenAddress(e.target.value)}
            placeholder="0x..."
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {normalizedTokenAddress && isProbing && (
            <div className="mt-2 flex items-center gap-2 text-sm text-gray-400">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
              </svg>
              Probing token...
            </div>
          )}
          {normalizedTokenAddress && !isProbing && tokenMetadata && (
            <div className="mt-2 rounded-lg bg-gray-900 p-3 ring-1 ring-gray-800">
              <div className="flex items-center gap-3 text-sm">
                <span className="font-medium text-white">{tokenMetadata.name}</span>
                <span className="text-gray-400">({tokenMetadata.symbol})</span>
                <span className="text-gray-500">{tokenMetadata.decimals} decimals</span>
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
          <label className="text-sm font-medium text-gray-300 mb-2 block">Contract Variant</label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setContractVariant('simple')}
              className={`rounded-lg px-4 py-2 text-sm font-medium ring-1 transition-colors ${
                contractVariant === 'simple'
                  ? 'bg-blue-500/10 text-blue-400 ring-blue-500/30'
                  : 'bg-gray-900 text-gray-400 ring-gray-800 hover:ring-gray-700'
              }`}
            >
              Simple
            </button>
            <button
              type="button"
              onClick={() => setContractVariant('full')}
              className={`rounded-lg px-4 py-2 text-sm font-medium ring-1 transition-colors ${
                contractVariant === 'full'
                  ? 'bg-blue-500/10 text-blue-400 ring-blue-500/30'
                  : 'bg-gray-900 text-gray-400 ring-gray-800 hover:ring-gray-700'
              }`}
            >
              Full
            </button>
          </div>
        </div>

        {/* Campaign Name */}
        <div>
          <label className="text-sm font-medium text-gray-300 mb-1 block">Campaign Name</label>
          <input
            type="text"
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            placeholder="My Airdrop Campaign"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Batch Size */}
        <div>
          <label className="text-sm font-medium text-gray-300 mb-1 block">Batch Size</label>
          <input
            type="number"
            value={batchSize}
            onChange={(e) => setBatchSize(Math.max(1, Number(e.target.value) || 1))}
            min={1}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="mt-1 text-xs text-gray-500">Number of recipients per transaction batch.</p>
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
