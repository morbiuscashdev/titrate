import { describe, it, expect } from 'vitest';
import { SUPPORTED_CHAINS, getChainConfig, getExplorerApiUrl } from '../chains/index.js';

describe('chains', () => {
  it('includes ethereum mainnet', () => {
    const eth = getChainConfig(1);
    expect(eth).toBeDefined();
    expect(eth!.name).toBe('Ethereum');
    expect(eth!.nativeSymbol).toBe('ETH');
  });

  it('includes pulsechain', () => {
    const pls = getChainConfig(369);
    expect(pls).toBeDefined();
    expect(pls!.name).toBe('PulseChain');
  });

  it('returns null for unknown chain', () => {
    expect(getChainConfig(999999)).toBeNull();
  });

  it('returns explorer API URL', () => {
    const url = getExplorerApiUrl(1);
    expect(url).toContain('api.etherscan.io');
  });

  it('has at least 4 supported chains', () => {
    expect(SUPPORTED_CHAINS.length).toBeGreaterThanOrEqual(4);
  });

  it('every chain has required fields', () => {
    for (const chain of SUPPORTED_CHAINS) {
      expect(chain.chainId).toBeGreaterThan(0);
      expect(chain.name).toBeTruthy();
      expect(chain.rpcUrls.length).toBeGreaterThan(0);
      expect(chain.explorerApiUrl).toBeTruthy();
      expect(chain.nativeSymbol).toBeTruthy();
      expect(chain.nativeDecimals).toBe(18);
    }
  });
});
