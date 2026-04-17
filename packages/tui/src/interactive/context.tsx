import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { CampaignManifest } from '@titrate/sdk';
import type { CampaignStorage, SharedStorage } from '@titrate/storage-campaign';
import type { PublicClient } from 'viem';
import { createPublicClient, http } from 'viem';

// --- Storage ---
const CampaignStorageCtx = createContext<CampaignStorage | null>(null);
const SharedStorageCtx = createContext<SharedStorage | null>(null);

export function CampaignStorageProvider({
  value, children,
}: {
  value: CampaignStorage;
  children: ReactNode;
}) {
  return <CampaignStorageCtx.Provider value={value}>{children}</CampaignStorageCtx.Provider>;
}

export function SharedStorageProvider({
  value, children,
}: {
  value: SharedStorage;
  children: ReactNode;
}) {
  return <SharedStorageCtx.Provider value={value}>{children}</SharedStorageCtx.Provider>;
}

export function useCampaignStorage(): CampaignStorage {
  const s = useContext(CampaignStorageCtx);
  if (!s) throw new Error('useCampaignStorage called outside CampaignStorageProvider');
  return s;
}

export function useSharedStorage(): SharedStorage {
  const s = useContext(SharedStorageCtx);
  if (!s) throw new Error('useSharedStorage called outside SharedStorageProvider');
  return s;
}

// --- Manifest ---
type ManifestState = {
  readonly manifest: CampaignManifest;
  readonly refresh: () => Promise<void>;
};

const ManifestCtx = createContext<ManifestState | null>(null);

export function ManifestProvider({
  initial, children,
}: {
  initial: CampaignManifest;
  children: ReactNode;
}) {
  const storage = useCampaignStorage();
  const [manifest, setManifest] = useState(initial);
  const refresh = useCallback(async () => {
    setManifest(await storage.manifest.read());
  }, [storage]);
  return <ManifestCtx.Provider value={{ manifest, refresh }}>{children}</ManifestCtx.Provider>;
}

export function useManifest(): ManifestState {
  const s = useContext(ManifestCtx);
  if (!s) throw new Error('useManifest called outside ManifestProvider');
  return s;
}

// --- RPC Client ---
const ClientCtx = createContext<PublicClient | null>(null);

export function ClientProvider({ children }: { children: ReactNode }) {
  const { manifest } = useManifest();
  const [client, setClient] = useState<PublicClient | null>(null);
  useEffect(() => {
    setClient(createPublicClient({ transport: http(manifest.rpcUrl) }));
  }, [manifest.rpcUrl]);
  return <ClientCtx.Provider value={client}>{children}</ClientCtx.Provider>;
}

export function useClient(): PublicClient | null {
  return useContext(ClientCtx);
}
