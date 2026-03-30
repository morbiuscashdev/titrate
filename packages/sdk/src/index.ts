// Types
export type {
  CampaignConfig,
  BatchAttempt,
  BatchResult,
  BatchStatus,
  SourceType,
  FilterType,
  PipelineStep,
  PipelineConfig,
  ProgressEvent,
  ProgressCallback,
  CSVRow,
  AmountFormat,
  ChainConfig,
  CallData,
  ContractArtifact,
} from './types.js';

// Chains
export { SUPPORTED_CHAINS, getChainConfig, getExplorerApiUrl } from './chains/index.js';

// CSV
export { parseCSV, detectAmountFormat, validateAddresses, deduplicateAddresses, flagConflicts } from './csv/index.js';
export type { ParsedCSV, ValidationResult, ConflictResult } from './csv/index.js';

// Wallet
export { createEIP712Message, deriveHotWallet } from './wallet/index.js';
export type { EIP712MessageParams, EIP712TypedData, DerivedWallet } from './wallet/index.js';

// Encode
export { encode } from './encode/index.js';

// Storage
export type {
  Storage,
  CampaignStore,
  AddressSetStore,
  AddressStore,
  BatchStore,
  WalletStore,
  PipelineConfigStore,
  StoredCampaign,
  StoredAddressSet,
  StoredAddress,
  StoredBatch,
  StoredWallet,
} from './storage/index.js';
