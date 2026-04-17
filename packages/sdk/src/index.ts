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
  ChainCategory,
  ChainConfig,
  CallData,
  ContractArtifact,
  CampaignStatus,
  WalletProvisioning,
  CampaignManifest,
  PipelineCursor,
} from './types.js';

// Chains
export { SUPPORTED_CHAINS, getChains, getChainConfig, getExplorerApiUrl } from './chains/index.js';

// CSV
export { parseCSV, detectAmountFormat, validateAddresses, deduplicateAddresses, flagConflicts } from './csv/index.js';
export type { ParsedCSV, ParseCSVOptions, ValidationResult, ConflictResult } from './csv/index.js';

// Sets
export { union, intersect, difference, symmetricDifference } from './sets/index.js';

// Wallet
export { createEIP712Message, deriveHotWallet, deriveWalletAtIndex, deriveMultipleWallets, InvalidSignatureError, suggestWalletCount, zeroPrivateKey } from './wallet/index.js';
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
  ChainConfigStore,
  AppSettingsStore,
  StoredCampaign,
  StoredAddressSet,
  StoredAddress,
  StoredBatch,
  StoredWallet,
  StoredChainConfig,
  WalletRecord,
  BatchRecord,
  SweepRecord,
} from './storage/index.js';

// Utils
export { chunk } from './utils/chunk.js';
export { withRetry } from './utils/retry.js';
export type { RetryOptions } from './utils/retry.js';
export { parseGwei } from './utils/gas.js';

// Memory
export { getHeapUsageMB, getHeapLimitMB, createMemoryMonitor } from './utils/memory.js';
export type { MemoryWarning, MemoryWarningCallback } from './utils/memory.js';

// Amounts
export { decimalToInteger, parseVariableAmounts } from './utils/amounts.js';

// Campaign
export { slugifyCampaignName } from './utils/campaign.js';

// Token
export { probeToken } from './utils/token.js';
export type { TokenMetadata } from './utils/token.js';

// Blocks
export { resolveBlockRef } from './utils/blocks.js';

// Resume
export { computeResumeOffset, alignAmountsForResume } from './utils/resume.js';

// Serialize
export { serializeBatchResults } from './utils/serialize.js';

// Requirements
export { computeRequirements } from './utils/requirements.js';
export type { DistributionRequirements } from './utils/requirements.js';

// Spend
export { aggregateSpendReport } from './utils/spend.js';
export type { SpendReport } from './utils/spend.js';

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
  disperseParallel,
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
  ParallelDisperseParams,
  ParallelDisperseResult,
  LiveFilter,
  GasConfig,
  GasSpeed,
  RevalidationConfig,
  ApproveOperatorParams,
  IncreaseAllowanceParams,
  GetAllowanceParams,
  CheckRecipientsParams,
} from './distributor/index.js';

// Explorer
export {
  createExplorerBus,
  getOrCreateBus,
  destroyAllBuses,
  ExplorerApiError,
  scanTokenTransfers,
  scanTransactions,
  scanInternalTransactions,
  getTokenBalances,
  getNativeBalances,
  parseExplorerResponse,
  isRateLimitResult,
} from './explorer/index.js';
export type {
  ExplorerBus,
  ExplorerBusOptions,
  TokenTransfer,
  Transaction,
  InternalTransaction,
  TokenBalance,
  ScanTokenTransfersOptions,
  ScanTransactionsOptions,
  GetTokenBalancesOptions,
  GetNativeBalancesOptions,
  ExplorerTitrateState,
} from './explorer/index.js';

// TrueBlocks
export {
  createTrueBlocksClient,
  TrueBlocksApiError,
  getTrueBlocksStatus,
  getAppearances,
  getTransfers,
  getBalanceHistory,
  getTraces,
} from './trueblocks/index.js';
export type {
  TrueBlocksClient,
  TrueBlocksClientOptions,
  TrueBlocksStatus,
  Appearance,
  TrueBlocksTransfer,
  BalanceChange,
  TrueBlocksTrace,
  GetAppearancesOptions,
  GetTransfersOptions,
  GetBalanceHistoryOptions,
  GetTracesOptions,
} from './trueblocks/index.js';

// Validation
export { validateAddresses as validateAddressSet, validateAmounts as validateAmountSet, validateBatch, hasErrors, hasWarnings, filterBySeverity } from './validation/index.js';
export { INVALID_HEX, INVALID_LENGTH, INVALID_PREFIX, NEGATIVE_AMOUNT, INVALID_AMOUNT, CHECKSUM_MISMATCH, DUPLICATE_ADDRESS, DUPLICATE_DIFF_AMOUNT, ZERO_AMOUNT, LARGE_AMOUNT, DEDUP_COUNT, FILTER_COUNT, LENGTH_MISMATCH } from './validation/index.js';
export type { ValidationIssue, ValidationSeverity } from './validation/index.js';

// Intervention
export { createSpotCheck } from './intervention/index.js';
export type { InterventionPoint, InterventionContext, InterventionAction, InterventionHook, InterventionConfig, InterventionEntry, InterventionJournal, SpotCheckSample, SpotCheckResult } from './intervention/index.js';

// RequestBus
export {
  createRequestBus,
  getOrCreateBus as getOrCreateRequestBus,
  destroyBus,
  destroyAllBuses as destroyAllRequestBuses,
} from './request-bus.js';
export type { RequestBus, RequestBusOptions } from './request-bus.js';

// Cache
export { computeCacheKey, createMemoryCache, createCache } from './cache/index.js';
export type { CacheKey, CacheEntry, CacheStore, CacheConfig, Cache, MemoryCache } from './cache/index.js';
