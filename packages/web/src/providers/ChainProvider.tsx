import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createPublicClient, http, defineChain, type PublicClient } from 'viem';
import {
  createExplorerBus,
  getOrCreateRequestBus,
  type ExplorerBus,
  type RequestBus,
  type StoredChainConfig,
} from '@titrate/sdk';

/** Values exposed by the chain context. */
export type ChainContextValue = {
  readonly publicClient: PublicClient | null;
  readonly explorerBus: ExplorerBus | null;
  readonly rpcBus: RequestBus | null;
  readonly chainConfig: StoredChainConfig | null;
};

const ChainContext = createContext<ChainContextValue | null>(null);

export type ChainProviderProps = {
  readonly chainConfig: StoredChainConfig | null;
  readonly children: ReactNode;
};

const EMPTY: ChainContextValue = {
  publicClient: null,
  explorerBus: null,
  rpcBus: null,
  chainConfig: null,
};

/**
 * Provides a viem PublicClient and optional ExplorerBus based on the active
 * chain configuration.
 *
 * When `chainConfig` changes the provider rebuilds the client and buses.
 * The generic RequestBus is obtained via `getOrCreateRequestBus` so that
 * other parts of the app can share the same rate-limited queue for a given
 * RPC endpoint.
 */
export function ChainProvider({ chainConfig, children }: ChainProviderProps) {
  const value = useMemo<ChainContextValue>(() => {
    if (!chainConfig) return EMPTY;

    const chain = defineChain({
      id: chainConfig.chainId,
      name: chainConfig.name,
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [chainConfig.rpcUrl] } },
    });

    const publicClient = createPublicClient({
      chain,
      transport: http(chainConfig.rpcUrl),
    });

    const rpcBus = getOrCreateRequestBus(chainConfig.rpcBusKey);

    const explorerBus = chainConfig.explorerApiKey
      ? createExplorerBus(chainConfig.explorerApiUrl, {
          apiKey: chainConfig.explorerApiKey,
          busKey: chainConfig.explorerBusKey,
        })
      : null;

    return { publicClient, explorerBus, rpcBus, chainConfig };
  }, [chainConfig]);

  return (
    <ChainContext.Provider value={value}>{children}</ChainContext.Provider>
  );
}

/**
 * Access the current chain context.
 *
 * @throws When called outside of a `<ChainProvider>`.
 */
export function useChain(): ChainContextValue {
  const context = useContext(ChainContext);
  if (!context) {
    throw new Error('useChain must be used within a ChainProvider');
  }
  return context;
}
