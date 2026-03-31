import type { Address } from 'viem';
import type { GetTokenBalancesOptions, GetNativeBalancesOptions, TokenBalance } from './types.js';
import { chunk } from '../utils/chunk.js';

const NATIVE_BALANCE_BATCH_SIZE = 20;

/**
 * Fetches ERC-20 token balances for a list of addresses.
 * Issues one API request per address via the explorer bus.
 */
export async function getTokenBalances(
  options: GetTokenBalancesOptions,
): Promise<readonly TokenBalance[]> {
  const { bus, tokenAddress, addresses, onProgress } = options;
  const results: TokenBalance[] = [];

  for (let i = 0; i < addresses.length; i++) {
    const address = addresses[i].toLowerCase() as Address;
    const balanceStr = await bus.request<string>({
      module: 'account',
      action: 'tokenbalance',
      contractaddress: tokenAddress,
      address,
      tag: 'latest',
    });
    results.push({ address, balance: BigInt(balanceStr) });
    onProgress?.({
      type: 'filter',
      filterName: 'explorer-token-balance',
      inputCount: addresses.length,
      outputCount: i + 1,
    });
  }

  return results;
}

type RawNativeBalance = {
  account: string;
  balance: string;
};

/**
 * Fetches native ETH balances for a list of addresses.
 * Batches up to 20 addresses per API call via the explorer bus.
 */
export async function getNativeBalances(
  options: GetNativeBalancesOptions,
): Promise<readonly TokenBalance[]> {
  const { bus, addresses, onProgress } = options;
  if (addresses.length === 0) return [];

  const batches = chunk([...addresses], NATIVE_BALANCE_BATCH_SIZE);
  const results: TokenBalance[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const commaSeparated = batch.join(',');
    const rawBalances = await bus.request<RawNativeBalance[]>({
      module: 'account',
      action: 'balancemulti',
      address: commaSeparated,
      tag: 'latest',
    });
    for (const raw of rawBalances) {
      results.push({
        address: raw.account.toLowerCase() as Address,
        balance: BigInt(raw.balance),
      });
    }
    onProgress?.({
      type: 'filter',
      filterName: 'explorer-native-balance',
      inputCount: addresses.length,
      outputCount: results.length,
    });
  }

  return results;
}
