import { useState, useCallback } from 'react';
import { useKeyboard } from '@opentui/react';
import type { CampaignManifest } from '@titrate/sdk';
import type { CampaignStorage, SharedStorage } from '@titrate/storage-campaign';
import {
  CampaignStorageProvider,
  SharedStorageProvider,
  ManifestProvider,
  ClientProvider,
} from './context.js';
import type { StepId } from './step-status.js';
import { Dashboard } from './screens/Dashboard.js';
import { CampaignSetup } from './screens/CampaignSetup.js';
import { Addresses } from './screens/Addresses.js';
import { Filters } from './screens/Filters.js';
import { Amounts } from './screens/Amounts.js';
import { Wallet } from './screens/Wallet.js';
import { Distribute } from './screens/Distribute.js';

type Screen = 'dashboard' | StepId;

export type AppProps = {
  readonly storage: CampaignStorage;
  readonly shared: SharedStorage;
  readonly initialManifest: CampaignManifest;
};

export type StepProps = {
  readonly onDone: () => void;
  readonly onBack: () => void;
};

export function App({ storage, shared, initialManifest }: AppProps) {
  const [screen, setScreen] = useState<Screen>('dashboard');

  const open = useCallback((step: StepId) => setScreen(step), []);
  const back = useCallback(() => setScreen('dashboard'), []);

  useKeyboard((key) => {
    if (key.ctrl && key.name === 'c') process.exit(0);
  });

  const isVisible = (s: Screen) => screen === s;

  return (
    <CampaignStorageProvider value={storage}>
      <SharedStorageProvider value={shared}>
        <ManifestProvider initial={initialManifest}>
          <ClientProvider>
            <box visible={isVisible('dashboard')} flexDirection="column">
              <Dashboard onOpenStep={open} onQuit={() => process.exit(0)} />
            </box>
            <box visible={isVisible('campaign')} flexDirection="column">
              <CampaignSetup onDone={back} onBack={back} />
            </box>
            <box visible={isVisible('addresses')} flexDirection="column">
              <Addresses onDone={back} onBack={back} />
            </box>
            <box visible={isVisible('filters')} flexDirection="column">
              <Filters onDone={back} onBack={back} />
            </box>
            <box visible={isVisible('amounts')} flexDirection="column">
              <Amounts onDone={back} onBack={back} />
            </box>
            <box visible={isVisible('wallet')} flexDirection="column">
              <Wallet onDone={back} onBack={back} />
            </box>
            <box visible={isVisible('distribute')} flexDirection="column">
              <Distribute onDone={back} onBack={back} />
            </box>
          </ClientProvider>
        </ManifestProvider>
      </SharedStorageProvider>
    </CampaignStorageProvider>
  );
}
