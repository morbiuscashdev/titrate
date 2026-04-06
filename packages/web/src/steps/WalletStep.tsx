import { useCallback, useState } from 'react';
import { StepPanel } from '../components/StepPanel.js';
import { WalletBadge } from '../components/WalletBadge.js';
import { useWallet } from '../providers/WalletProvider.js';
import { useCampaign } from '../providers/CampaignProvider.js';
import { useChain } from '../providers/ChainProvider.js';

/**
 * Fifth campaign step: wallet connection and optional perry mode derivation.
 *
 * When connected, displays the wallet badge and a continue button.
 * Perry mode allows deriving a hot wallet for distribution.
 */
export function WalletStep() {
  const { isConnected, address, perryMode, deriveHotWallet, clearPerryMode } = useWallet();
  const { activeCampaign, setActiveStep } = useCampaign();
  const { chainConfig } = useChain();
  const [isDeriving, setIsDeriving] = useState(false);
  const [deriveError, setDeriveError] = useState<string | null>(null);

  const chainName = chainConfig?.name ?? 'Unknown Chain';

  const handleDerive = useCallback(async () => {
    if (!activeCampaign) {
      return;
    }

    setIsDeriving(true);
    setDeriveError(null);

    try {
      await deriveHotWallet(activeCampaign.name, activeCampaign.version);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to derive hot wallet';
      setDeriveError(message);
    } finally {
      setIsDeriving(false);
    }
  }, [activeCampaign, deriveHotWallet]);

  const handleContinue = useCallback(() => {
    setActiveStep('requirements');
  }, [setActiveStep]);

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
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Perry Mode (Hot Wallet)</h3>

            {!perryMode && (
              <div className="space-y-3">
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Derive a deterministic hot wallet from your connected wallet. Fund it externally before distributing.
                </p>
                <button
                  type="button"
                  onClick={handleDerive}
                  disabled={isDeriving || !activeCampaign}
                  className="bg-purple-700 hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 text-sm font-medium"
                >
                  {isDeriving ? 'Deriving...' : 'Derive Hot Wallet'}
                </button>
              </div>
            )}

            {deriveError && (
              <div className="rounded-md bg-red-900/20 p-3 text-sm text-red-400 ring-1 ring-red-900/30">
                {deriveError}
              </div>
            )}

            {perryMode && (
              <div className="space-y-3">
                <WalletBadge
                  address={perryMode.wallets[0].address}
                  chainName={chainName}
                  perryMode={{
                    hotAddress: perryMode.wallets[0].address,
                    coldAddress: perryMode.coldAddress,
                  }}
                />
                <div className="rounded-md bg-purple-900/20 p-3 text-sm text-purple-400 ring-1 ring-purple-900/30">
                  Operating with a derived hot wallet. Fund it externally before distributing.
                </div>
                <button
                  type="button"
                  onClick={clearPerryMode}
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
