import type { ChainConfig } from '../types.js';

export const SUPPORTED_CHAINS: readonly ChainConfig[] = [
  {
    chainId: 1,
    name: 'Ethereum',
    rpcUrls: ['https://eth.llamarpc.com', 'https://rpc.ankr.com/eth'],
    explorerUrl: 'https://etherscan.io',
    explorerApiUrl: 'https://api.etherscan.io/api',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
  },
  {
    chainId: 369,
    name: 'PulseChain',
    rpcUrls: ['https://rpc.pulsechain.com', 'https://pulsechain-rpc.publicnode.com'],
    explorerUrl: 'https://scan.pulsechain.com',
    explorerApiUrl: 'https://api.scan.pulsechain.com/api',
    nativeSymbol: 'PLS',
    nativeDecimals: 18,
  },
  {
    chainId: 8453,
    name: 'Base',
    rpcUrls: ['https://mainnet.base.org', 'https://base.llamarpc.com'],
    explorerUrl: 'https://basescan.org',
    explorerApiUrl: 'https://api.basescan.org/api',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
  },
  {
    chainId: 42161,
    name: 'Arbitrum One',
    rpcUrls: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum.llamarpc.com'],
    explorerUrl: 'https://arbiscan.io',
    explorerApiUrl: 'https://api.arbiscan.io/api',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
  },
] as const;
