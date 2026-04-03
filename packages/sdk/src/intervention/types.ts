import type { Address } from 'viem';
import type { ValidationIssue } from '../validation/types.js';

export type InterventionPoint =
  | 'address-review'
  | 'filter-review'
  | 'amount-review'
  | 'batch-preview'
  | 'batch-result'
  | 'stuck-transaction'
  | 'validation-error'
  | 'validation-warning';

export type InterventionContext = {
  readonly point: InterventionPoint;
  readonly campaignId: string;
  readonly batchIndex?: number;
  readonly addresses?: readonly Address[];
  readonly amounts?: readonly bigint[];
  readonly issues?: readonly ValidationIssue[];
  readonly txHash?: `0x${string}`;
  readonly metadata?: Record<string, unknown>;
};

export type InterventionAction =
  | { readonly type: 'approve' }
  | { readonly type: 'skip' }
  | { readonly type: 'add'; readonly addresses: readonly Address[]; readonly amounts: readonly bigint[] }
  | { readonly type: 'remove'; readonly addresses: readonly Address[] }
  | { readonly type: 'adjustAmounts'; readonly amounts: readonly bigint[] }
  | { readonly type: 'replaceAll'; readonly addresses: readonly Address[]; readonly amounts: readonly bigint[] }
  | { readonly type: 'pause' }
  | { readonly type: 'abort' }
  | { readonly type: 'retry' }
  | { readonly type: 'bumpGas'; readonly multiplier: number }
  | { readonly type: 'overrideWarnings' }
  | { readonly type: 'reroll' }
  | { readonly type: 'fullReview' };

export type InterventionHook = (context: InterventionContext) => Promise<InterventionAction>;

export type InterventionConfig = {
  readonly onIntervention: InterventionHook;
  readonly reviewBeforeEachBatch?: boolean;
  readonly autoApproveClean?: boolean;
  readonly stuckTransactionTimeout?: number;
  readonly spotCheckSampleSize?: number;
};

export type InterventionEntry = {
  readonly timestamp: number;
  readonly campaignId: string;
  readonly point: InterventionPoint;
  readonly action: InterventionAction['type'];
  readonly issueCount: number;
};

export type InterventionJournal = {
  append(entry: InterventionEntry): Promise<void>;
  getEntries(campaignId: string): Promise<InterventionEntry[]>;
};

export type SpotCheckSample = {
  readonly index: number;
  readonly address: Address;
  readonly amount?: bigint;
  readonly explorerUrl: string;
};

export type SpotCheckResult = {
  readonly samples: SpotCheckSample[];
  readonly totalCount: number;
  readonly sampleSize: number;
};
