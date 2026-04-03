// packages/sdk/src/validation/types.ts

export type ValidationSeverity = 'error' | 'warning' | 'info';

export type ValidationIssue = {
  readonly severity: ValidationSeverity;
  readonly row: number;
  readonly field: string;
  readonly value: string;
  readonly message: string;
  readonly code: string;
};

export const INVALID_HEX = 'INVALID_HEX';
export const INVALID_LENGTH = 'INVALID_LENGTH';
export const INVALID_PREFIX = 'INVALID_PREFIX';
export const NEGATIVE_AMOUNT = 'NEGATIVE_AMOUNT';
export const INVALID_AMOUNT = 'INVALID_AMOUNT';
export const CHECKSUM_MISMATCH = 'CHECKSUM_MISMATCH';
export const DUPLICATE_ADDRESS = 'DUPLICATE_ADDRESS';
export const DUPLICATE_DIFF_AMOUNT = 'DUPLICATE_DIFF_AMOUNT';
export const ZERO_AMOUNT = 'ZERO_AMOUNT';
export const LARGE_AMOUNT = 'LARGE_AMOUNT';
export const DEDUP_COUNT = 'DEDUP_COUNT';
export const FILTER_COUNT = 'FILTER_COUNT';
export const LENGTH_MISMATCH = 'LENGTH_MISMATCH';
