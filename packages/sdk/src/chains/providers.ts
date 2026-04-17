/**
 * RPC provider catalog — templated URL builders for known paid RPC services.
 */

export type ProviderId = 'valve' | 'alchemy' | 'infura' | 'public' | 'custom';

export type RpcProvider = {
  readonly id: ProviderId;
  readonly name: string;
  readonly helpUrl: string;
  readonly requiresKey: boolean;
  readonly buildUrl: (chainId: number, key: string) => string | null;
};

const ALCHEMY_SLUGS: Record<number, string> = {
  1: 'eth-mainnet',
  8453: 'base-mainnet',
  42161: 'arb-mainnet',
  11155111: 'eth-sepolia',
  84532: 'base-sepolia',
  421614: 'arb-sepolia',
};

const INFURA_SLUGS: Record<number, string> = {
  1: 'mainnet',
  42161: 'arbitrum-mainnet',
  11155111: 'sepolia',
};

export const PROVIDERS: readonly RpcProvider[] = [
  {
    id: 'valve',
    name: 'valve.city',
    helpUrl: 'https://valve.city',
    requiresKey: true,
    buildUrl: (chainId, key) => `https://evm${chainId}.rpc.valve.city/v1/${key}`,
  },
  {
    id: 'alchemy',
    name: 'Alchemy',
    helpUrl: 'https://alchemy.com',
    requiresKey: true,
    buildUrl: (chainId, key) => {
      const slug = ALCHEMY_SLUGS[chainId];
      return slug ? `https://${slug}.g.alchemy.com/v2/${key}` : null;
    },
  },
  {
    id: 'infura',
    name: 'Infura',
    helpUrl: 'https://infura.io',
    requiresKey: true,
    buildUrl: (chainId, key) => {
      const slug = INFURA_SLUGS[chainId];
      return slug ? `https://${slug}.infura.io/v3/${key}` : null;
    },
  },
  {
    id: 'public',
    name: 'Public',
    helpUrl: '',
    requiresKey: false,
    buildUrl: () => null,
  },
  {
    id: 'custom',
    name: 'Custom URL',
    helpUrl: '',
    requiresKey: false,
    buildUrl: () => null,
  },
];

export function getProvider(id: ProviderId): RpcProvider {
  const p = PROVIDERS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}

export type ProviderKeys = {
  readonly valve?: string;
  readonly alchemy?: string;
  readonly infura?: string;
};

/**
 * Resolve an RPC URL for a chain given provider keys and public fallbacks.
 * Priority: valve → alchemy → infura → publicRpcUrls[0].
 */
export function resolveRpcUrl(
  chainId: number,
  settings: { readonly providerKeys: ProviderKeys },
  publicRpcUrls: readonly string[],
): string {
  const keys = settings.providerKeys;
  if (keys.valve) {
    const url = getProvider('valve').buildUrl(chainId, keys.valve);
    if (url) return url;
  }
  if (keys.alchemy) {
    const url = getProvider('alchemy').buildUrl(chainId, keys.alchemy);
    if (url) return url;
  }
  if (keys.infura) {
    const url = getProvider('infura').buildUrl(chainId, keys.infura);
    if (url) return url;
  }
  if (publicRpcUrls.length === 0) {
    throw new Error(`No RPC URL available for chain ${chainId}`);
  }
  return publicRpcUrls[0];
}

/**
 * Split a provider's URL template into prefix and suffix around the key slot.
 */
export function splitTemplate(id: ProviderId, chainId: number): { prefix: string; suffix: string } {
  const url = getProvider(id).buildUrl(chainId, '\x00');
  if (!url) return { prefix: '', suffix: '' };
  const idx = url.indexOf('\x00');
  return { prefix: url.slice(0, idx), suffix: url.slice(idx + 1) };
}
