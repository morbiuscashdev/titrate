import type { ChainConfig } from '../types.js';
import { SUPPORTED_CHAINS } from './config.js';

export { SUPPORTED_CHAINS };

const chainMap = new Map<number, ChainConfig>(
  SUPPORTED_CHAINS.map((c) => [c.chainId, c])
);

export function getChainConfig(chainId: number): ChainConfig | null {
  return chainMap.get(chainId) ?? null;
}

export function getExplorerApiUrl(chainId: number): string | null {
  return chainMap.get(chainId)?.explorerApiUrl ?? null;
}
