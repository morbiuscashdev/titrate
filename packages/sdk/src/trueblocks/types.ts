// packages/sdk/src/trueblocks/types.ts
import type { Address, Hex } from 'viem';
import type { ProgressCallback } from '../types.js';

// --- Result types ---

export type Appearance = {
  readonly address: Address;
  readonly blockNumber: bigint;
  readonly transactionIndex: number;
};

export type TrueBlocksTransfer = {
  readonly from: Address;
  readonly to: Address;
  readonly value: bigint;
  readonly asset: string;
  readonly blockNumber: bigint;
  readonly transactionIndex: number;
  readonly hash: Hex;
  readonly timestamp: number;
};

export type BalanceChange = {
  readonly address: Address;
  readonly blockNumber: bigint;
  readonly transactionIndex: number;
};

export type TrueBlocksTrace = {
  readonly from: Address;
  readonly to: Address;
  readonly value: bigint;
  readonly hash: Hex;
  readonly blockNumber: bigint;
  readonly traceType: string;
  readonly depth: number;
};

export type TrueBlocksStatus = {
  readonly isReady: boolean;
  readonly clientVersion: string;
  readonly chainId: number;
  readonly rpcProvider: string;
  readonly cachePath: string;
};

// --- Client types ---

export type TrueBlocksClientOptions = {
  readonly baseUrl: string;
  readonly busKey: string;
  readonly fetchFn?: typeof fetch;
};

export type TrueBlocksClient = {
  readonly baseUrl: string;
  request<T>(endpoint: string, params: Record<string, string>): Promise<T[]>;
  requestPaginated<T>(endpoint: string, params: Record<string, string>, pageSize?: number): AsyncGenerator<T[]>;
  destroy(): void;
};

// --- Scanner option types ---

export type GetAppearancesOptions = {
  readonly client: TrueBlocksClient;
  readonly addresses: readonly Address[];
  readonly firstBlock?: bigint;
  readonly lastBlock?: bigint;
  readonly onProgress?: ProgressCallback;
};

export type GetTransfersOptions = {
  readonly client: TrueBlocksClient;
  readonly addresses: readonly Address[];
  readonly asset?: Address;
  readonly firstBlock?: bigint;
  readonly lastBlock?: bigint;
  readonly onProgress?: ProgressCallback;
};

export type GetBalanceHistoryOptions = {
  readonly client: TrueBlocksClient;
  readonly addresses: readonly Address[];
  readonly asset?: Address;
  readonly firstBlock?: bigint;
  readonly lastBlock?: bigint;
  readonly onProgress?: ProgressCallback;
};

export type GetTracesOptions = {
  readonly client: TrueBlocksClient;
  readonly addresses: readonly Address[];
  readonly firstBlock?: bigint;
  readonly lastBlock?: bigint;
  readonly onProgress?: ProgressCallback;
};
