import type { Address, Hex } from 'viem';

export type CampaignConfig = {
  readonly funder: Address;
  readonly name: string;
  readonly version: number;
  readonly chainId: number;
  readonly rpcUrl: string;
  readonly tokenAddress: Address;
  readonly tokenDecimals: number;
  readonly contractAddress: Address | null;
  readonly contractVariant: 'simple' | 'full';
  readonly contractName: string;
  readonly amountMode: 'uniform' | 'variable';
  readonly amountFormat: 'integer' | 'decimal';
  readonly uniformAmount: string | null;
  readonly batchSize: number;
  readonly campaignId: Hex | null;
  readonly pinnedBlock: bigint | null;
};

export type BatchAttempt = {
  readonly txHash: Hex;
  readonly nonce: number;
  readonly gasEstimate: bigint;
  readonly maxFeePerGas: bigint;
  readonly maxPriorityFeePerGas: bigint;
  readonly timestamp: number;
  readonly outcome: 'confirmed' | 'replaced' | 'reverted' | 'dropped';
};

export type BatchResult = {
  readonly batchIndex: number;
  readonly recipients: readonly Address[];
  readonly amounts: readonly bigint[];
  readonly attempts: readonly BatchAttempt[];
  readonly confirmedTxHash: Hex | null;
  readonly blockNumber: bigint | null;
};

export type BatchStatus = 'pending' | 'signing' | 'broadcast' | 'confirmed' | 'failed';

export type SourceType = 'block-scan' | 'csv' | 'union' | 'explorer-scan' | 'trueblocks-scan';

export type FilterType =
  | 'contract-check'
  | 'min-balance'
  | 'nonce-range'
  | 'token-recipients'
  | 'csv-exclusion'
  | 'previously-sent'
  | 'registry-check'
  | 'explorer-balance'
  | 'trueblocks-balance-hint';

export type PipelineStep =
  | { readonly type: 'source'; readonly sourceType: SourceType; readonly params: Record<string, unknown> }
  | { readonly type: 'filter'; readonly filterType: FilterType; readonly params: Record<string, unknown> };

export type PipelineConfig = {
  readonly steps: readonly PipelineStep[];
};

export type ProgressEvent =
  | { readonly type: 'scan'; readonly currentBlock: bigint; readonly endBlock: bigint; readonly addressesFound: number }
  | { readonly type: 'filter'; readonly filterName: string; readonly inputCount: number; readonly outputCount: number }
  | { readonly type: 'batch'; readonly batchIndex: number; readonly totalBatches: number; readonly status: BatchStatus }
  | { readonly type: 'tx'; readonly batchIndex: number; readonly attempt: BatchAttempt }
  | { readonly type: 'throughput'; readonly addressesCompleted: number; readonly addressesPerHour: number; readonly elapsedMs: number; readonly estimatedRemainingMs: number };

export type ProgressCallback = (event: ProgressEvent) => void;

export type CSVRow = {
  readonly address: Address;
  readonly amount: string | null;
};

export type AmountFormat = 'integer' | 'decimal';

export type ChainConfig = {
  readonly chainId: number;
  readonly name: string;
  readonly rpcUrls: readonly string[];
  readonly explorerUrl: string;
  readonly explorerApiUrl: string;
  readonly nativeSymbol: string;
  readonly nativeDecimals: number;
};

export type CallData = {
  readonly target: Address;
  readonly data: Hex;
  readonly value: bigint;
};

export type ContractArtifact = {
  readonly contractName: string;
  readonly abi: readonly Record<string, unknown>[];
  readonly bytecode: Hex;
};
