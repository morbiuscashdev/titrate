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

// Sets
export { union, intersect, difference, symmetricDifference } from './sets/index.js';

// Wallet
export { createEIP712Message, deriveHotWallet, InvalidSignatureError } from './wallet/index.js';
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

// Utils
export { chunk } from './utils/chunk.js';
export { withRetry } from './utils/retry.js';
export type { RetryOptions } from './utils/retry.js';

// Scanner
export {
  scanBlocks,
  resolveBlockByTimestamp,
  scanTransferEvents,
  getAddressProperties,
  createTitrateState,
  adjustRange,
  shrinkRange,
} from './scanner/index.js';
export type {
  BlockRange,
  ScanOptions,
  ScanTransferOptions,
  PropertyType,
  AddressProperties,
  GetPropertiesOptions,
  TitrateState,
} from './scanner/index.js';

// Pipeline
export { createPipeline, deserializePipeline } from './pipeline/index.js';
export type { Pipeline } from './pipeline/index.js';

// Distributor
export {
  deployDistributor,
  getContractSourceTemplate,
  verifyContract,
  pollVerificationStatus,
  disperseTokens,
  disperseTokensSimple,
  approveOperator,
  increaseOperatorAllowance,
  getAllowance,
  checkRecipients,
} from './distributor/index.js';
export type {
  DeployParams,
  DeployResult,
  VerifyParams,
  VerifyResult,
  PollVerificationStatusParams,
  PollVerificationStatusResult,
  DisperseParams,
  DisperseSimpleParams,
  LiveFilter,
  ApproveOperatorParams,
  IncreaseAllowanceParams,
  GetAllowanceParams,
  CheckRecipientsParams,
} from './distributor/index.js';
