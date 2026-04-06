import { useCallback, useEffect, useState } from 'react';
import { useWalletClient } from 'wagmi';
import { erc20Abi, parseEther } from 'viem';
import type { Address } from 'viem';
import { StepPanel } from '../components/StepPanel.js';
import { WalletBadge } from '../components/WalletBadge.js';
import { useWallet } from '../providers/WalletProvider.js';
import { useCampaign } from '../providers/CampaignProvider.js';
import { useChain } from '../providers/ChainProvider.js';
import { useStorage } from '../providers/StorageProvider.js';

/** Build the IDB key for a campaign's wallet high-water-mark. */
function hwmKey(campaignId: string): string {
  return `wallet-hwm-${campaignId}`;
}

/** Shape of the JSON blob stored under the HWM key. */
type StoredHWM = {
  readonly highWaterMark: number;
};

/**
 * Fifth campaign step: wallet connection and optional perry mode derivation.
 *
 * When connected, displays the wallet badge and a continue button.
 * Perry mode allows deriving one or more hot wallets for distribution.
 * Per-wallet funding buttons let the user send ETH or tokens from the
 * cold (connected) wallet to each derived hot wallet.
 */
export function WalletStep() {
  const {
    isConnected,
    address,
    perryMode,
    deriveHotWallet,
    deriveHotWallets,
    clearPerryMode,
  } = useWallet();
  const { activeCampaign, setActiveStep } = useCampaign();
  const { chainConfig } = useChain();
  const { storage } = useStorage();
  const { data: coldWalletClient } = useWalletClient();

  const [isDeriving, setIsDeriving] = useState(false);
  const [deriveError, setDeriveError] = useState<string | null>(null);
  const [walletCount, setWalletCount] = useState(1);
  const [walletOffset, setWalletOffset] = useState(0);
  const [storedHighWaterMark, setStoredHighWaterMark] = useState(-1);

  // Load persisted high-water-mark on mount / campaign change
  useEffect(() => {
    if (!storage || !activeCampaign) return;

    void (async () => {
      const raw = await storage.appSettings.get(hwmKey(activeCampaign.id));
      if (!raw) return;

      try {
        const parsed: unknown = JSON.parse(raw);
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          'highWaterMark' in parsed &&
          typeof (parsed as StoredHWM).highWaterMark === 'number'
        ) {
          const hwm = (parsed as StoredHWM).highWaterMark;
          setStoredHighWaterMark(hwm);
          setWalletOffset(hwm + 1);
        }
      } catch {
        // Corrupt entry — ignore
      }
    })();
  }, [storage, activeCampaign]);

  const chainName = chainConfig?.name ?? 'Unknown Chain';
  const hasMultipleWallets = (perryMode?.wallets.length ?? 0) > 1;

  const handleDerive = useCallback(async () => {
    if (!activeCampaign) {
      return;
    }

    setIsDeriving(true);
    setDeriveError(null);

    try {
      if (walletCount === 1 && walletOffset === 0) {
        await deriveHotWallet(activeCampaign.name, activeCampaign.version);
      } else {
        await deriveHotWallets({
          campaignName: activeCampaign.name,
          version: activeCampaign.version,
          count: walletCount,
          offset: walletOffset,
        });
      }

      // Persist high-water-mark so offset suggestion survives reload
      if (storage) {
        const hwm = walletOffset + walletCount - 1;
        const entry: StoredHWM = { highWaterMark: hwm };
        await storage.appSettings.put(hwmKey(activeCampaign.id), JSON.stringify(entry));
        setStoredHighWaterMark(hwm);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to derive hot wallet';
      setDeriveError(message);
    } finally {
      setIsDeriving(false);
    }
  }, [activeCampaign, walletCount, walletOffset, deriveHotWallet, deriveHotWallets, storage]);

  const handleClear = useCallback(async () => {
    clearPerryMode();
    if (storage && activeCampaign) {
      await storage.appSettings.delete(hwmKey(activeCampaign.id));
    }
    setStoredHighWaterMark(-1);
    setWalletOffset(0);
  }, [clearPerryMode, storage, activeCampaign]);

  const handleContinue = useCallback(() => {
    setActiveStep('requirements');
  }, [setActiveStep]);

  const handleFundGas = useCallback(async (targetAddress: Address) => {
    if (!coldWalletClient) {
      return;
    }
    await coldWalletClient.sendTransaction({
      to: targetAddress,
      value: parseEther('0.05'),
      account: coldWalletClient.account!,
      chain: undefined,
    });
  }, [coldWalletClient]);

  const handleFundTokens = useCallback(async (targetAddress: Address) => {
    if (!coldWalletClient || !activeCampaign?.tokenAddress) {
      return;
    }
    await coldWalletClient.writeContract({
      address: activeCampaign.tokenAddress,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [targetAddress, BigInt(activeCampaign.uniformAmount ?? '0')],
      account: coldWalletClient.account!,
      chain: undefined,
    });
  }, [coldWalletClient, activeCampaign]);

  return (
    <StepPanel title="Wallet" description="Connect your wallet and optionally derive a hot wallet for distribution.">
      {!isConnected && (
        <div className="rounded-lg bg-gray-50 dark:bg-gray-900 p-6 ring-1 ring-gray-200 dark:ring-gray-800 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">Connect your wallet using the button in the header.</p>
        </div>
      )}

      {isConnected && address && (
        <div className="space-y-6">
          <WalletBadge
            address={address}
            chainName={chainName}
          />

          {/* Perry mode section */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Perry Mode (Hot Wallets)</h3>

            {!perryMode && (
              <div className="space-y-3">
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Derive deterministic hot wallets from your connected wallet. Fund them before distributing.
                </p>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                    Wallets:
                    <input
                      type="number"
                      aria-label="Wallet count"
                      min={1}
                      max={10}
                      value={walletCount}
                      onChange={(e) => setWalletCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                      className="w-16 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-sm text-gray-900 dark:text-white"
                    />
                  </label>

                  <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                    Offset:
                    <input
                      type="number"
                      aria-label="Wallet offset"
                      min={0}
                      value={walletOffset}
                      onChange={(e) => setWalletOffset(Math.max(0, Number(e.target.value) || 0))}
                      className="w-16 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-sm text-gray-900 dark:text-white"
                    />
                  </label>
                </div>

                {storedHighWaterMark >= 0 && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Last used: indices 0-{storedHighWaterMark}. Next unused: {storedHighWaterMark + 1}
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleDerive}
                  disabled={isDeriving || !activeCampaign}
                  className="bg-purple-700 hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 text-sm font-medium"
                >
                  {isDeriving ? 'Deriving...' : 'Derive Hot Wallets'}
                </button>
              </div>
            )}

            {deriveError && (
              <div className="rounded-md bg-red-900/20 p-3 text-sm text-red-400 ring-1 ring-red-900/30">
                {deriveError}
              </div>
            )}

            {perryMode && !hasMultipleWallets && (
              <div className="space-y-3">
                <WalletBadge
                  address={perryMode.wallets[0].address}
                  chainName={chainName}
                  perryMode={{
                    hotAddress: perryMode.wallets[0].address,
                    coldAddress: perryMode.coldAddress,
                  }}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleFundGas(perryMode.wallets[0].address)}
                    disabled={!coldWalletClient}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Fund Gas
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFundTokens(perryMode.wallets[0].address)}
                    disabled={!coldWalletClient}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Fund Tokens
                  </button>
                </div>
                <div className="rounded-md bg-purple-900/20 p-3 text-sm text-purple-400 ring-1 ring-purple-900/30">
                  Operating with a derived hot wallet. Fund it before distributing.
                </div>
                <button
                  type="button"
                  onClick={handleClear}
                  className="bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg px-4 py-2 text-sm"
                >
                  Clear Perry Mode
                </button>
              </div>
            )}

            {perryMode && hasMultipleWallets && (
              <div className="space-y-3">
                <div className="rounded-md bg-purple-900/20 p-3 text-sm text-purple-400 ring-1 ring-purple-900/30">
                  Operating with {perryMode.wallets.length} derived hot wallets. Fund them before distributing.
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {perryMode.wallets.map((wallet, index) => (
                    <div
                      key={wallet.address}
                      className="rounded-lg bg-gray-50 dark:bg-gray-900 p-3 ring-1 ring-gray-200 dark:ring-gray-800"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          Wallet {perryMode.offset + index}
                        </span>
                      </div>
                      <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                        {wallet.address}
                      </span>
                      <div className="flex gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => handleFundGas(wallet.address)}
                          disabled={!coldWalletClient}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Fund Gas
                        </button>
                        <button
                          type="button"
                          onClick={() => handleFundTokens(wallet.address)}
                          disabled={!coldWalletClient}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Fund Tokens
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleClear}
                  className="bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg px-4 py-2 text-sm"
                >
                  Clear Perry Mode
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleContinue}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-sm font-medium"
          >
            Continue
          </button>
        </div>
      )}
    </StepPanel>
  );
}
