import type { Address, Hex } from 'viem';
import type { ProgressCallback } from '../types.js';

export type TokenTransfer = {
  readonly from: Address;
  readonly to: Address;
  readonly value: bigint;
  readonly tokenSymbol: string;
  readonly tokenName: string;
  readonly tokenDecimals: number;
  readonly hash: Hex;
  readonly blockNumber: bigint;
  readonly timestamp: number;
};

export type Transaction = {
  readonly from: Address;
  readonly to: Address | null;
  readonly value: bigint;
  readonly hash: Hex;
  readonly blockNumber: bigint;
  readonly timestamp: number;
  readonly isError: boolean;
  readonly gasUsed: bigint;
};

export type InternalTransaction = {
  readonly from: Address;
  readonly to: Address;
  readonly value: bigint;
  readonly hash: Hex;
  readonly blockNumber: bigint;
  readonly type: string;
};

export type TokenBalance = {
  readonly address: Address;
  readonly balance: bigint;
};

export type ExplorerBusOptions = {
  readonly apiKey: string;
  readonly fetchFn?: typeof fetch;
};

export type ExplorerBus = {
  readonly domain: string;
  request<T>(params: Record<string, string>): Promise<T>;
  getCurrentRate(): number | null;
  destroy(): void;
};

export type ScanTokenTransfersOptions = {
  readonly bus: ExplorerBus;
  readonly tokenAddress: Address;
  readonly startBlock?: bigint;
  readonly endBlock?: bigint;
  readonly onProgress?: ProgressCallback;
};

export type ScanTransactionsOptions = {
  readonly bus: ExplorerBus;
  readonly address: Address;
  readonly startBlock?: bigint;
  readonly endBlock?: bigint;
  readonly onProgress?: ProgressCallback;
};

export type GetTokenBalancesOptions = {
  readonly bus: ExplorerBus;
  readonly tokenAddress: Address;
  readonly addresses: readonly Address[];
  readonly onProgress?: ProgressCallback;
};

export type GetNativeBalancesOptions = {
  readonly bus: ExplorerBus;
  readonly addresses: readonly Address[];
  readonly onProgress?: ProgressCallback;
};

export type ExplorerTitrateState = {
  learnedRange: bigint | null;
};
