import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { ThemeProvider } from './providers/ThemeProvider.js';
import { ToastProvider } from './providers/ToastProvider.js';
import { WalletProvider } from './providers/WalletProvider.js';
import { StorageProvider } from './providers/StorageProvider.js';
import { CacheProvider } from './providers/CacheProvider.js';
import { ChainProvider } from './providers/ChainProvider.js';
import { CampaignProvider, useCampaign } from './providers/CampaignProvider.js';
import { InterventionProvider } from './providers/InterventionProvider.js';
import { InterventionModal } from './components/InterventionModal.js';
import { useWallet } from './providers/WalletProvider.js';
import { Header } from './components/Header.js';
import { WalletBadge } from './components/WalletBadge.js';
import type { ReactNode } from 'react';
import type { StoredChainConfig } from '@titrate/sdk';

const HomePage = lazy(() => import('./pages/HomePage.js').then(m => ({ default: m.HomePage })));
const CampaignPage = lazy(() => import('./pages/CampaignPage.js').then(m => ({ default: m.CampaignPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage.js').then(m => ({ default: m.SettingsPage })));

/** Bridges CampaignProvider → ChainProvider by deriving chain config from the active campaign. */
function ChainBridge({ children }: { readonly children: ReactNode }) {
  const { activeCampaign } = useCampaign();

  const chainConfig: StoredChainConfig | null = activeCampaign && activeCampaign.chainId > 0
    ? {
        id: `campaign-${activeCampaign.id}`,
        chainId: activeCampaign.chainId,
        name: `Chain ${activeCampaign.chainId}`,
        rpcUrl: activeCampaign.rpcUrl,
        rpcBusKey: new URL(activeCampaign.rpcUrl || 'http://localhost').hostname,
        explorerApiUrl: '',
        explorerApiKey: '',
        explorerBusKey: '',
        trueBlocksUrl: '',
        trueBlocksBusKey: '',
      }
    : null;

  return <ChainProvider chainConfig={chainConfig}>{children}</ChainProvider>;
}

/** Renders wallet connection UI in the header. */
function HeaderWalletBadge() {
  const { isConnected, address, chainId } = useWallet();

  if (!isConnected || !address) {
    return <appkit-button size="sm" />;
  }

  return (
    <WalletBadge
      address={`${address.slice(0, 6)}...${address.slice(-4)}`}
      chainName={chainId ? `Chain ${chainId}` : 'Unknown'}
    />
  );
}

export function App() {
  return (
    <ErrorBoundary>
    <ThemeProvider>
      <ToastProvider>
      <WalletProvider>
        <StorageProvider>
          <CacheProvider>
            <CampaignProvider>
              <InterventionProvider>
              <InterventionModal />
              <ChainBridge>
                <BrowserRouter>
                  <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-white">
                    Skip to content
                  </a>
                  <Header>
                    <HeaderWalletBadge />
                  </Header>
                  <div id="main-content">
                  <Suspense fallback={<div className="flex items-center justify-center min-h-[50vh]"><p className="text-sm text-gray-400">Loading...</p></div>}>
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/campaign/:id" element={<CampaignPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                  </Suspense>
                  </div>
                </BrowserRouter>
              </ChainBridge>
              </InterventionProvider>
            </CampaignProvider>
          </CacheProvider>
        </StorageProvider>
      </WalletProvider>
      </ToastProvider>
    </ThemeProvider>
    </ErrorBoundary>
  );
}
