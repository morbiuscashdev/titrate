import { useCallback, useEffect, useState } from 'react';
import { useWalletClient } from 'wagmi';
import { erc20Abi, parseEther } from 'viem';
import type { Address, Hex } from 'viem';
import { StepPanel } from '../components/StepPanel.js';
import { WalletBadge } from '../components/WalletBadge.js';
import { ChainMismatchBanner } from '../components/ChainMismatchBanner.js';
import { Button, Card } from '../components/ui';
import { useWallet } from '../providers/WalletProvider.js';
import { useCampaign } from '../providers/CampaignProvider.js';
import { useChain } from '../providers/ChainProvider.js';
import { useStorage } from '../providers/StorageProvider.js';
import { useChainMismatch } from '../hooks/useChainMismatch.js';

/** Build the IDB key for a campaign's wallet high-water-mark. */
function hwmKey(campaignId: string): string {
  return `wallet-hwm-${campaignId}`;
}

/** Shape of the JSON blob stored under the HWM key. */
type StoredHWM = {
  readonly highWaterMark: number;
};

const SECTION_LABEL = 'font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[color:var(--fg-primary)]';
const INLINE_INPUT = 'w-16 rounded-none border-2 border-[color:var(--edge)] bg-white text-[color:var(--color-cream-900)] font-mono px-2 py-1 text-sm focus:outline-none focus:border-[color:var(--color-pink-500)]';
const FUND_LINK = 'font-mono text-xs text-[color:var(--color-pink-600)] hover:text-[color:var(--color-pink-700)] underline decoration-dotted disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-[1px] focus-visible:outline-[color:var(--color-info)] rounded-sm';

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
    deriveHotWalletsFromPrivateKey,
    clearPerryMode,
  } = useWallet();
  const { activeCampaign, setActiveStep } = useCampaign();
  const { chainConfig } = useChain();
  const { storage } = useStorage();
  const { data: coldWalletClient } = useWalletClient();
  const chainMismatch = useChainMismatch(activeCampaign?.chainId);

  const [isDeriving, setIsDeriving] = useState(false);
  const [deriveError, setDeriveError] = useState<string | null>(null);
  const [walletCount, setWalletCount] = useState(1);
  const [walletOffset, setWalletOffset] = useState(0);
  const [storedHighWaterMark, setStoredHighWaterMark] = useState(-1);
  const [showKeyPaste, setShowKeyPaste] = useState(false);
  const [pastedKey, setPastedKey] = useState('');

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

  const persistHighWaterMark = useCallback(async () => {
    if (!storage || !activeCampaign) return;
    const hwm = walletOffset + walletCount - 1;
    const entry: StoredHWM = { highWaterMark: hwm };
    await storage.appSettings.put(hwmKey(activeCampaign.id), JSON.stringify(entry));
    setStoredHighWaterMark(hwm);
  }, [storage, activeCampaign, walletOffset, walletCount]);

  const handleDerive = useCallback(async () => {
    if (!activeCampaign) {
      return;
    }

    setIsDeriving(true);
    setDeriveError(null);

    try {
      if (walletCount === 1 && walletOffset === 0) {
        await deriveHotWallet(
          activeCampaign.name,
          activeCampaign.version,
          activeCampaign.rpcUrl,
        );
      } else {
        await deriveHotWallets({
          campaignName: activeCampaign.name,
          version: activeCampaign.version,
          count: walletCount,
          offset: walletOffset,
          rpcUrl: activeCampaign.rpcUrl,
        });
      }

      await persistHighWaterMark();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to derive hot wallet';
      setDeriveError(message);
    } finally {
      setIsDeriving(false);
    }
  }, [
    activeCampaign,
    walletCount,
    walletOffset,
    deriveHotWallet,
    deriveHotWallets,
    persistHighWaterMark,
  ]);

  const handleDeriveFromKey = useCallback(async () => {
    if (!activeCampaign) return;

    const trimmed = pastedKey.trim();
    const normalized = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
    if (normalized.length !== 66) {
      setDeriveError('Private key must be a 32-byte hex string (64 chars + 0x prefix).');
      return;
    }

    setIsDeriving(true);
    setDeriveError(null);

    try {
      await deriveHotWalletsFromPrivateKey({
        privateKey: normalized as Hex,
        campaignName: activeCampaign.name,
        version: activeCampaign.version,
        count: walletCount,
        offset: walletOffset,
        rpcUrl: activeCampaign.rpcUrl,
      });
      await persistHighWaterMark();
      setPastedKey('');
      setShowKeyPaste(false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to derive from private key';
      setDeriveError(message);
    } finally {
      setIsDeriving(false);
    }
  }, [
    activeCampaign,
    pastedKey,
    walletCount,
    walletOffset,
    deriveHotWalletsFromPrivateKey,
    persistHighWaterMark,
  ]);

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
      <ChainMismatchBanner
        mismatch={chainMismatch}
        campaignChainName={chainConfig?.name}
      />

      {!isConnected && (
        <Card className="text-center">
          <p className="font-mono text-sm text-[color:var(--fg-muted)]">
            Connect your wallet using the button in the header, or paste a private key below.
          </p>
        </Card>
      )}

      {isConnected && address && (
        <div className="space-y-6">
          <WalletBadge
            address={address}
            chainName={chainName}
          />

          {/* Perry mode section */}
          <div className="space-y-3">
            <h3 className={SECTION_LABEL}>Perry Mode (Hot Wallets)</h3>

            {!perryMode && (
              <div className="space-y-3">
                <p className="font-mono text-xs text-[color:var(--fg-muted)]">
                  Derive deterministic hot wallets from your connected wallet. Fund them before distributing.
                </p>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.1em] text-[color:var(--fg-muted)]">
                    Wallets:
                    <input
                      type="number"
                      aria-label="Wallet count"
                      min={1}
                      max={10}
                      value={walletCount}
                      onChange={(e) => setWalletCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                      className={INLINE_INPUT}
                    />
                  </label>

                  <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.1em] text-[color:var(--fg-muted)]">
                    Offset:
                    <input
                      type="number"
                      aria-label="Wallet offset"
                      min={0}
                      value={walletOffset}
                      onChange={(e) => setWalletOffset(Math.max(0, Number(e.target.value) || 0))}
                      className={INLINE_INPUT}
                    />
                  </label>
                </div>

                {storedHighWaterMark >= 0 && (
                  <p className="font-mono text-xs text-[color:var(--fg-muted)]">
                    Last used: indices 0-{storedHighWaterMark}. Next unused: {storedHighWaterMark + 1}
                  </p>
                )}

                <Button
                  variant="primary"
                  onClick={handleDerive}
                  disabled={isDeriving || !activeCampaign || chainMismatch.mismatched}
                >
                  {isDeriving ? 'Deriving...' : 'Derive Hot Wallets'}
                </Button>

                {/* Escape hatch: sign with a pasted private key. Bypasses
                    wagmi entirely, so the user can still derive even when
                    the connected wallet is on the wrong chain. */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowKeyPaste((v) => !v)}
                    className="font-mono text-xs underline decoration-dotted text-[color:var(--fg-muted)] hover:text-[color:var(--fg-primary)]"
                  >
                    {showKeyPaste ? 'Hide private-key option' : 'Or paste a private key instead'}
                  </button>
                </div>

                {showKeyPaste && (
                  <div className="space-y-2 border-2 border-[color:var(--edge)] bg-[color:var(--bg-page)] p-3">
                    <label
                      htmlFor="wallet-step-private-key"
                      className="block font-mono text-xs uppercase tracking-[0.1em] text-[color:var(--fg-muted)]"
                    >
                      Cold wallet private key
                    </label>
                    <input
                      id="wallet-step-private-key"
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      aria-label="Cold wallet private key"
                      placeholder="0x…"
                      value={pastedKey}
                      onChange={(e) => setPastedKey(e.target.value)}
                      className="w-full rounded-none border-2 border-[color:var(--edge)] bg-white text-[color:var(--color-cream-900)] font-mono px-2 py-1 text-sm focus:outline-none focus:border-[color:var(--color-pink-500)]"
                    />
                    <p className="font-mono text-[10px] text-[color:var(--fg-muted)]">
                      The key stays in memory only — it's used once to sign the EIP-712 derivation payload locally, never sent over the wire.
                    </p>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleDeriveFromKey}
                      disabled={isDeriving || !activeCampaign || pastedKey.trim().length === 0}
                    >
                      {isDeriving ? 'Deriving…' : 'Derive from pasted key'}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {deriveError && (
              <div className="border-2 border-[color:var(--color-err)]/40 bg-[color:var(--color-err)]/10 p-3 font-mono text-sm text-[color:var(--color-err)]">
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
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => handleFundGas(perryMode.wallets[0].address)}
                    disabled={!coldWalletClient}
                    aria-label="Fund gas for Wallet 0"
                    className={FUND_LINK}
                  >
                    Fund Gas
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFundTokens(perryMode.wallets[0].address)}
                    disabled={!coldWalletClient}
                    aria-label="Fund tokens for Wallet 0"
                    className={FUND_LINK}
                  >
                    Fund Tokens
                  </button>
                </div>
                <div className="border-2 border-[color:var(--color-info)]/30 bg-[color:var(--color-info)]/10 p-3 font-mono text-sm text-[color:var(--color-info)]">
                  Operating with a derived hot wallet. Fund it before distributing.
                </div>
                <Button variant="secondary" size="sm" onClick={handleClear}>
                  Clear Perry Mode
                </Button>
              </div>
            )}

            {perryMode && hasMultipleWallets && (
              <div className="space-y-3">
                <div className="border-2 border-[color:var(--color-info)]/30 bg-[color:var(--color-info)]/10 p-3 font-mono text-sm text-[color:var(--color-info)]">
                  Operating with {perryMode.wallets.length} derived hot wallets. Fund them before distributing.
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {perryMode.wallets.map((wallet, index) => (
                    <Card key={wallet.address} className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-sans text-sm font-semibold text-[color:var(--fg-primary)]">
                          Wallet {perryMode.offset + index}
                        </span>
                      </div>
                      <span className="font-mono text-xs text-[color:var(--fg-muted)] break-all">
                        {wallet.address}
                      </span>
                      <div className="flex flex-wrap gap-3 mt-2">
                        <button
                          type="button"
                          onClick={() => handleFundGas(wallet.address)}
                          disabled={!coldWalletClient}
                          aria-label={`Fund gas for Wallet ${perryMode.offset + index}`}
                          className={FUND_LINK}
                        >
                          Fund Gas
                        </button>
                        <button
                          type="button"
                          onClick={() => handleFundTokens(wallet.address)}
                          disabled={!coldWalletClient}
                          aria-label={`Fund tokens for Wallet ${perryMode.offset + index}`}
                          className={FUND_LINK}
                        >
                          Fund Tokens
                        </button>
                      </div>
                    </Card>
                  ))}
                </div>
                <Button variant="secondary" size="sm" onClick={handleClear}>
                  Clear Perry Mode
                </Button>
              </div>
            )}
          </div>

          <Button variant="primary" onClick={handleContinue}>
            Continue
          </Button>
        </div>
      )}
    </StepPanel>
  );
}
