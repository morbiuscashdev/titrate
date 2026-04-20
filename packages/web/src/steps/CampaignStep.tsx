import { useState, useEffect, useCallback } from 'react';
import { StepPanel } from '../components/StepPanel.js';
import { ChainSelector } from '../components/ChainSelector.js';
import { Button, Input, Card } from '../components/ui';
import { useCampaign } from '../providers/CampaignProvider.js';
import { useStorage } from '../providers/StorageProvider.js';
import { useTokenMetadata } from '../hooks/useTokenMetadata.js';
import {
  getChains,
  getChainConfig,
  validateContractName,
  getProvider,
  splitTemplate,
} from '@titrate/sdk';
import type { ChainCategory, ProviderId } from '@titrate/sdk';

const DEFAULT_CONTRACT_NAME = 'TokenAirdrop';
import { keccak256, toHex } from 'viem';
import type { Address, Hex } from 'viem';
import type { StoredCampaign } from '@titrate/sdk';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;
const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

const CHAIN_CATEGORIES: readonly { readonly value: ChainCategory; readonly label: string; readonly key: string }[] = [
  { value: 'mainnet', label: 'Mainnets', key: 'm' },
  { value: 'testnet', label: 'Testnets', key: 't' },
  { value: 'devnet', label: 'Devnets', key: 'd' },
] as const;

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

const SECTION_LABEL = 'block font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[color:var(--fg-primary)] mb-2';
const TOGGLE_BUTTON_BASE = 'rounded-none border-2 font-mono font-bold uppercase tracking-[0.12em] transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-[1px] focus-visible:outline-[color:var(--color-info)]';
const TOGGLE_ACTIVE = 'bg-[color:var(--color-pink-500)] text-white border-[color:var(--color-pink-500)]';
const TOGGLE_INACTIVE = 'bg-[color:var(--bg-card)] text-[color:var(--fg-primary)] border-[color:var(--edge)] hover:border-[color:var(--color-pink-500)]';
const TOGGLE_INACTIVE_MUTED = 'bg-transparent text-[color:var(--fg-muted)] border-[color:var(--edge)] hover:text-[color:var(--fg-primary)]';

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
  const [chainCategory, setChainCategory] = useState<ChainCategory>('mainnet');
  const [isCustomChain, setIsCustomChain] = useState(false);
  const [customChainName, setCustomChainName] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [explorerApiUrl, setExplorerApiUrl] = useState('');
  const [explorerApiKey, setExplorerApiKey] = useState('');
  const [rateLimitGroup, setRateLimitGroup] = useState('');
  const [manualSymbol, setManualSymbol] = useState('');
  const [manualDecimals, setManualDecimals] = useState('18');
  const [contractDisplayName, setContractDisplayName] = useState(DEFAULT_CONTRACT_NAME);
  const [editingProvider, setEditingProvider] = useState<ProviderId | null>(null);
  const [providerKey, setProviderKey] = useState('');

  const handleLoadProvider = useCallback(
    async (id: ProviderId) => {
      if (chainId === null) return;
      const saved = storage
        ? (await storage.appSettings.get(`provider-key-${id}`)) ?? ''
        : '';
      setEditingProvider(id);
      setProviderKey(saved);
      if (saved) {
        const url = getProvider(id).buildUrl(chainId, saved);
        if (url) setRpcUrl(url);
      }
    },
    [chainId, storage],
  );

  const handleProviderKeyChange = useCallback(
    (raw: string) => {
      if (editingProvider === null || chainId === null) return;
      const { prefix, suffix } = splitTemplate(editingProvider, chainId);
      // Paste-URL support: if the value contains the provider's prefix,
      // extract just the key portion (between prefix and optional suffix).
      let key = raw;
      const idx = key.indexOf(prefix);
      if (prefix && idx !== -1) {
        key = key.slice(idx + prefix.length);
      }
      if (suffix && key.endsWith(suffix)) {
        key = key.slice(0, -suffix.length);
      }
      key = key.trim();
      setProviderKey(key);
      const url = getProvider(editingProvider).buildUrl(chainId, key);
      if (url) setRpcUrl(url);
    },
    [editingProvider, chainId],
  );

  const handleProviderKeyCommit = useCallback(async () => {
    if (!storage || editingProvider === null || !providerKey) return;
    await storage.appSettings.put(`provider-key-${editingProvider}`, providerKey);
  }, [storage, editingProvider, providerKey]);

  const normalizedTokenAddress: Address | null =
    ADDRESS_REGEX.test(tokenAddress) ? (tokenAddress.toLowerCase() as Address) : null;

  const { data: tokenMetadata, isLoading: isProbing, error: probeError } = useTokenMetadata(normalizedTokenAddress);

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
    // Older campaigns stored the token symbol in `contractName`. A valid
    // Solidity identifier is almost certainly the contract display name; a
    // symbol like "cb.BTC" is not. Hydrate the input only for valid names.
    const stored = activeCampaign.contractName?.trim();
    if (stored && validateContractName(stored).ok) {
      setContractDisplayName(stored);
    }
  }, [activeCampaign]);

  const handleChainSelect = useCallback((selectedChainId: number) => {
    setChainId(selectedChainId);
    setIsCustomChain(false);
    setCustomChainName('');
    const config = getChainConfig(selectedChainId);
    if (config && config.rpcUrls.length > 0) {
      setRpcUrl(config.rpcUrls[0]);
    }
  }, []);

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
      const resolvedDecimals = tokenMetadata?.decimals
        ?? (probeError ? Number(manualDecimals) || 18 : 18);

      const resolvedTokenSymbol = tokenMetadata?.symbol
        ?? (probeError && manualSymbol.trim() ? manualSymbol.trim() : '')
        ?? '';

      const contractNameCheck = validateContractName(contractDisplayName);
      const resolvedContractName = contractNameCheck.ok
        ? contractNameCheck.value
        : DEFAULT_CONTRACT_NAME;

      let campaignId: string | null = activeCampaign?.id ?? null;

      if (activeCampaign) {
        const updated: StoredCampaign = {
          ...activeCampaign,
          chainId,
          rpcUrl,
          tokenAddress: resolvedTokenAddress,
          tokenDecimals: resolvedDecimals,
          tokenSymbol: resolvedTokenSymbol,
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
          tokenSymbol: resolvedTokenSymbol,
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
    chainId, rpcUrl, normalizedTokenAddress, tokenMetadata, probeError,
    manualSymbol, manualDecimals, contractVariant, contractDisplayName,
    campaignName, batchSize, activeCampaign, saveCampaign, createCampaign, setActiveStep,
    storage, explorerApiUrl, explorerApiKey, rateLimitGroup, customChainName,
  ]);

  const contractNameValidation = validateContractName(contractDisplayName);
  const canSave = chainId !== null && campaignName.trim().length > 0 && contractNameValidation.ok;

  const rateLimitPlaceholder = (() => {
    try { return rpcUrl ? new URL(rpcUrl).hostname : 'auto-derived from RPC URL'; }
    catch { return 'auto-derived from RPC URL'; }
  })();

  return (
    <StepPanel title="Campaign Setup" description="Configure the chain, token, and basic campaign settings.">
      <div className="space-y-6">
        {/* Chain Selection */}
        <div>
          <label className={SECTION_LABEL}>Chain</label>
          <div className="flex gap-1 mb-3">
            {CHAIN_CATEGORIES.map((cat) => {
              const count = getChains(cat.value).length;
              if (count === 0) return null;
              const active = chainCategory === cat.value;
              return (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setChainCategory(cat.value)}
                  aria-pressed={active}
                  className={`${TOGGLE_BUTTON_BASE} px-3 py-1 text-xs ${active ? TOGGLE_ACTIVE : TOGGLE_INACTIVE_MUTED}`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
          <ChainSelector
            chains={getChains(chainCategory).map((c) => ({ chainId: c.chainId, name: c.name }))}
            selectedChainId={isCustomChain ? null : chainId}
            onSelect={handleChainSelect}
          />
          <button
            type="button"
            onClick={handleCustomChain}
            aria-pressed={isCustomChain}
            className={`mt-2 ${TOGGLE_BUTTON_BASE} px-4 py-2 text-sm ${isCustomChain ? TOGGLE_ACTIVE : TOGGLE_INACTIVE}`}
          >
            Custom
          </button>
        </div>

        {/* Custom Chain Fields */}
        {isCustomChain && (
          <div className="space-y-4">
            <Input
              id="custom-chain-id"
              label="Chain ID"
              type="number"
              value={chainId ?? ''}
              onChange={(e) => setChainId(e.target.value ? Number(e.target.value) : null)}
              placeholder="e.g. 42161"
            />
            <Input
              id="custom-chain-name"
              label="Chain Name"
              type="text"
              value={customChainName}
              onChange={(e) => setCustomChainName(e.target.value)}
              placeholder="e.g. My Custom Chain"
            />
          </div>
        )}

        {/* RPC URL */}
        <Input
          id="rpc-url"
          label="RPC URL"
          type="text"
          value={rpcUrl}
          onChange={(e) => setRpcUrl(e.target.value)}
          placeholder="https://..."
        />
        <div className="-mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[color:var(--fg-muted)]">
              Load from:
            </span>
            {(['valve', 'alchemy', 'infura'] as const).map((id) => {
              const provider = getProvider(id);
              const supported = chainId !== null && provider.buildUrl(chainId, 'x') !== null;
              const active = editingProvider === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleLoadProvider(id)}
                  disabled={!supported}
                  aria-pressed={active}
                  title={
                    chainId === null
                      ? 'Pick a chain first'
                      : supported
                        ? `Enter your ${provider.name} API key to fill the RPC URL`
                        : `${provider.name} has no template for chain ${chainId}`
                  }
                  className={`${TOGGLE_BUTTON_BASE} px-3 py-1 text-xs ${
                    active ? TOGGLE_ACTIVE : supported ? TOGGLE_INACTIVE : TOGGLE_INACTIVE_MUTED
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {provider.name}
                </button>
              );
            })}
          </div>

          {editingProvider !== null && chainId !== null && (() => {
            const provider = getProvider(editingProvider);
            const { prefix, suffix } = splitTemplate(editingProvider, chainId);
            return (
              <div className="space-y-1">
                <label
                  htmlFor="provider-key-input"
                  className="block font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[color:var(--fg-primary)]"
                >
                  {provider.name} API Key
                </label>
                <div className="flex items-stretch border-2 border-[color:var(--edge)] bg-white focus-within:border-[color:var(--color-pink-500)]">
                  <span className="flex items-center px-2 font-mono text-xs text-[color:var(--fg-muted)] select-all">
                    {prefix}
                  </span>
                  <input
                    id="provider-key-input"
                    type="text"
                    autoFocus
                    value={providerKey}
                    onChange={(e) => handleProviderKeyChange(e.target.value)}
                    onBlur={() => { void handleProviderKeyCommit(); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'Escape') {
                        (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') setEditingProvider(null);
                      }
                    }}
                    placeholder="paste your key — or paste the whole URL"
                    className="flex-1 min-w-0 bg-transparent font-mono text-sm text-[color:var(--color-cream-900)] px-2 py-1 focus:outline-none"
                  />
                  {suffix && (
                    <span className="flex items-center px-2 font-mono text-xs text-[color:var(--fg-muted)] select-all">
                      {suffix}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => { void handleProviderKeyCommit(); setEditingProvider(null); }}
                    aria-label="Close provider key editor"
                    className="px-3 font-mono text-xs font-bold uppercase border-l-2 border-[color:var(--edge)] text-[color:var(--fg-muted)] hover:text-[color:var(--fg-primary)]"
                  >
                    Done
                  </button>
                </div>
                <p className="font-mono text-[10px] text-[color:var(--fg-muted)]">
                  Stored locally in this browser, never sent to a server. Paste the whole URL and the key will be extracted.
                </p>
              </div>
            );
          })()}
        </div>

        {/* Rate Limit Group */}
        <Input
          id="rate-limit-group"
          label="Rate limit group"
          type="text"
          value={rateLimitGroup}
          onChange={(e) => setRateLimitGroup(e.target.value)}
          placeholder={rateLimitPlaceholder}
          hint='Share rate limits across endpoints (e.g., "alchemy" for all Alchemy chains).'
        />

        {/* Advanced: Explorer Fields */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="font-mono text-sm text-[color:var(--fg-muted)] hover:text-[color:var(--fg-primary)] underline decoration-dotted transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-[1px] focus-visible:outline-[color:var(--color-info)] rounded-sm"
          >
            {showAdvanced ? 'Hide advanced' : 'Show advanced'}
          </button>
          {showAdvanced && (
            <div className="mt-3 space-y-4">
              <Input
                id="explorer-api-url"
                label="Explorer API URL"
                type="text"
                value={explorerApiUrl}
                onChange={(e) => setExplorerApiUrl(e.target.value)}
                placeholder="https://api.etherscan.io/api"
              />
              <Input
                id="explorer-api-key"
                label="Explorer API Key"
                type="text"
                value={explorerApiKey}
                onChange={(e) => setExplorerApiKey(e.target.value)}
                placeholder="Your API key"
              />
            </div>
          )}
        </div>

        {/* Token Address */}
        <div>
          <Input
            id="token-address"
            label="Token Address"
            type="text"
            value={tokenAddress}
            onChange={(e) => setTokenAddress(e.target.value)}
            placeholder="0x..."
          />
          {normalizedTokenAddress && isProbing && (
            <div className="mt-2 flex items-center gap-2 font-mono text-sm text-[color:var(--fg-muted)]">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
              </svg>
              Probing token...
            </div>
          )}
          {normalizedTokenAddress && !isProbing && tokenMetadata && (
            <Card className="mt-2 p-3">
              <div className="flex items-center gap-3 text-sm">
                <span className="font-sans font-semibold text-[color:var(--fg-primary)]">{tokenMetadata.name}</span>
                <span className="font-mono text-[color:var(--fg-muted)]">({tokenMetadata.symbol})</span>
                <span className="font-mono text-[color:var(--fg-muted)]">{tokenMetadata.decimals} decimals</span>
              </div>
            </Card>
          )}
          {normalizedTokenAddress && !isProbing && probeError && (
            <div className="mt-2 space-y-3">
              <p className="font-mono text-sm text-[color:var(--color-err)]">Failed to probe token. Enter details manually:</p>
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[120px]">
                  <Input
                    id="manual-symbol"
                    label="Symbol"
                    type="text"
                    value={manualSymbol}
                    onChange={(e) => setManualSymbol(e.target.value)}
                    placeholder="e.g. USDC"
                  />
                </div>
                <div className="w-24">
                  <Input
                    id="manual-decimals"
                    label="Decimals"
                    type="number"
                    value={manualDecimals}
                    onChange={(e) => setManualDecimals(e.target.value)}
                    min={0}
                    max={36}
                  />
                </div>
              </div>
            </div>
          )}
          {normalizedTokenAddress && !isProbing && tokenMetadata === null && !probeError && (
            <p className="mt-2 font-mono text-sm text-[color:var(--color-warn)]">Not a valid ERC-20 token at this address.</p>
          )}
        </div>

        {/* Contract Variant */}
        <div>
          <label className={SECTION_LABEL}>Contract Variant</label>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setContractVariant('simple')}
              aria-pressed={contractVariant === 'simple'}
              className={`${TOGGLE_BUTTON_BASE} px-4 py-2 text-sm ${contractVariant === 'simple' ? TOGGLE_ACTIVE : TOGGLE_INACTIVE}`}
            >
              Simple
            </button>
            <button
              type="button"
              onClick={() => setContractVariant('full')}
              aria-pressed={contractVariant === 'full'}
              className={`${TOGGLE_BUTTON_BASE} px-4 py-2 text-sm ${contractVariant === 'full' ? TOGGLE_ACTIVE : TOGGLE_INACTIVE}`}
            >
              Full
            </button>
          </div>
        </div>

        {/* Contract Name — Solidity identifier submitted to explorer verify */}
        <div>
          <Input
            id="contract-name"
            label="Contract Name"
            type="text"
            value={contractDisplayName}
            onChange={(e) => setContractDisplayName(e.target.value)}
            placeholder={DEFAULT_CONTRACT_NAME}
            hint={
              contractNameValidation.ok
                ? 'Shows on block explorers after verification. Must be a valid Solidity identifier.'
                : undefined
            }
          />
          {!contractNameValidation.ok && (
            <p className="mt-1 font-mono text-xs text-[color:var(--color-err)]">
              {contractNameValidation.reason}
            </p>
          )}
        </div>

        {/* Campaign Name */}
        <Input
          id="campaign-name"
          label="Campaign Name"
          type="text"
          value={campaignName}
          onChange={(e) => setCampaignName(e.target.value)}
          placeholder="My Airdrop Campaign"
        />

        {/* Batch Size */}
        <Input
          id="batch-size"
          label="Batch Size"
          type="number"
          value={batchSize}
          onChange={(e) => setBatchSize(clampBatchSize(e.target.value))}
          min={1}
          hint="Number of recipients per transaction batch."
        />

        {/* Save */}
        <Button variant="primary" onClick={handleSave} disabled={!canSave || isSaving}>
          {isSaving ? 'Saving...' : 'Save & Continue'}
        </Button>
      </div>
    </StepPanel>
  );
}
