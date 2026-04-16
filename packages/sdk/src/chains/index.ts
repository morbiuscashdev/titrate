import type { ChainCategory, ChainConfig } from '../types.js';
import { SUPPORTED_CHAINS } from './config.js';

export { SUPPORTED_CHAINS };

const chainMap = new Map<number, ChainConfig>(
  SUPPORTED_CHAINS.map((c) => [c.chainId, c])
);

/**
 * Returns chains filtered by category.
 * Without a category, returns all chains.
 */
export function getChains(category?: ChainCategory): readonly ChainConfig[] {
  if (!category) return SUPPORTED_CHAINS;
  return SUPPORTED_CHAINS.filter((c) => c.category === category);
}

export function getChainConfig(chainId: number): ChainConfig | null {
  return chainMap.get(chainId) ?? null;
}

export function getExplorerApiUrl(chainId: number): string | null {
  return chainMap.get(chainId)?.explorerApiUrl ?? null;
}
