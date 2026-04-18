export type DrainInput = {
  readonly scannerCompleted: boolean;
  readonly filterCompleted: boolean;
  readonly qualifiedCount: number;
  readonly distributeWatermark: number;
  readonly batchesAllConfirmed: boolean;
};

export type DrainStatus = 'drained' | 'waiting';

export function computeDrainStatus(input: DrainInput): DrainStatus {
  if (!input.scannerCompleted) return 'waiting';
  if (!input.filterCompleted) return 'waiting';
  if (input.qualifiedCount !== input.distributeWatermark) return 'waiting';
  if (!input.batchesAllConfirmed) return 'waiting';
  return 'drained';
}
