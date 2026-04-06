import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { WagmiProvider, useAccount, useSignTypedData } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createAppKit } from '@reown/appkit/react';
import { mainnet, base, arbitrum } from '@reown/appkit/networks';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { createEIP712Message, deriveMultipleWallets, zeroPrivateKey } from '@titrate/sdk';
import type { DerivedWallet } from '@titrate/sdk';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Address, Hex, WalletClient } from 'viem';

/** Use env var for project ID, fall back to empty string (won't work but won't crash). */
const projectId = import.meta.env.VITE_REOWN_PROJECT_ID ?? '';

const metadata = {
  name: 'Titrate',
  description: 'Token distribution tool',
  url: typeof window !== 'undefined' ? window.location.origin : '',
  icons: [],
};

const networks = [mainnet, base, arbitrum] as const;

/** Wagmi adapter bridges Reown AppKit to wagmi config. */
const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks: [...networks],
});

/** Initialize Reown AppKit (side-effect, runs once at module load). */
createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks: [...networks],
  metadata,
  features: {
    analytics: false,
  },
});

/**
 * Shared QueryClient for wagmi and TanStack Query.
 * Other providers that need TanStack Query should import and reuse this instance.
 */
export const queryClient = new QueryClient();

/** Perry mode state when hot wallets have been derived. */
export type PerryModeState = {
  readonly isActive: true;
  readonly coldAddress: Address;
  readonly wallets: readonly DerivedWallet[];
  readonly offset: number;
};

/** Values exposed by the wallet context. */
export type WalletContextValue = {
  readonly isConnected: boolean;
  readonly address: Address | undefined;
  readonly chainId: number | undefined;
  readonly perryMode: PerryModeState | null;
  readonly deriveHotWallet: (campaignName: string, version: number) => Promise<void>;
  readonly deriveHotWallets: (params: {
    readonly campaignName: string;
    readonly version: number;
    readonly count: number;
    readonly offset?: number;
  }) => Promise<void>;
  readonly clearPerryMode: () => void;
  readonly walletClients: readonly WalletClient[];
};

const WalletContext = createContext<WalletContextValue | null>(null);

/**
 * Inner component that sits below WagmiProvider and QueryClientProvider
 * so it can use wagmi hooks (useAccount, useSignTypedData).
 */
function WalletInner({ children }: { readonly children: ReactNode }) {
  const { address, isConnected, chainId } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const [perryMode, setPerryMode] = useState<PerryModeState | null>(null);
  const [walletClients, setWalletClients] = useState<readonly WalletClient[]>([]);

  const handleDeriveHotWallets = useCallback(
    async (params: {
      readonly campaignName: string;
      readonly version: number;
      readonly count: number;
      readonly offset?: number;
    }) => {
      if (!address) {
        throw new Error('Wallet not connected');
      }

      const { campaignName, version, count, offset = 0 } = params;

      const message = createEIP712Message({
        funder: address,
        name: campaignName,
        version,
      });

      const signature = await signTypedDataAsync({
        domain: message.domain,
        types: message.types,
        primaryType: message.primaryType,
        message: message.message,
      });

      const wallets = deriveMultipleWallets({
        signature: signature as Hex,
        count,
        offset,
      });

      const clients = wallets.map((wallet) =>
        createWalletClient({
          account: privateKeyToAccount(wallet.privateKey),
          transport: http(),
        }),
      );

      setWalletClients(clients);
      setPerryMode({
        isActive: true,
        coldAddress: address,
        wallets,
        offset,
      });
    },
    [address, signTypedDataAsync],
  );

  const handleDeriveHotWallet = useCallback(
    (campaignName: string, version: number) =>
      handleDeriveHotWallets({ campaignName, version, count: 1 }),
    [handleDeriveHotWallets],
  );

  const clearPerryMode = useCallback(() => {
    if (perryMode) {
      for (const wallet of perryMode.wallets) {
        zeroPrivateKey(wallet);
      }
    }
    setPerryMode(null);
    setWalletClients([]);
  }, [perryMode]);

  return (
    <WalletContext.Provider
      value={{
        isConnected,
        address,
        chainId,
        perryMode,
        deriveHotWallet: handleDeriveHotWallet,
        deriveHotWallets: handleDeriveHotWallets,
        clearPerryMode,
        walletClients,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

/**
 * Provides wallet connection state and perry mode (hot wallet derivation)
 * to the component tree via Reown AppKit + wagmi + TanStack Query.
 */
export function WalletProvider({ children }: { readonly children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <WalletInner>{children}</WalletInner>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

/**
 * Access the wallet context.
 *
 * @throws When called outside of a `<WalletProvider>`.
 */
export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
