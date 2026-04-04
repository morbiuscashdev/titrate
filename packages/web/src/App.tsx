import { BrowserRouter, Routes, Route } from 'react-router';
import { ThemeProvider } from './providers/ThemeProvider.js';
import { WalletProvider } from './providers/WalletProvider.js';
import { StorageProvider } from './providers/StorageProvider.js';
import { ChainProvider } from './providers/ChainProvider.js';
import { CampaignProvider } from './providers/CampaignProvider.js';
import { Header } from './components/Header.js';
import { HomePage } from './pages/HomePage.js';
import { CampaignPage } from './pages/CampaignPage.js';
import { SettingsPage } from './pages/SettingsPage.js';

export function App() {
  return (
    <ThemeProvider>
      <WalletProvider>
        <StorageProvider>
          <ChainProvider chainConfig={null}>
            <CampaignProvider>
              <BrowserRouter>
                <Header />
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/campaign/:id" element={<CampaignPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Routes>
              </BrowserRouter>
            </CampaignProvider>
          </ChainProvider>
        </StorageProvider>
      </WalletProvider>
    </ThemeProvider>
  );
}
