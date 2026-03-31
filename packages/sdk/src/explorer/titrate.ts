import type { ExplorerTitrateState } from './types.js';

export const RESULT_CAP = 10_000;

const GROWTH_THRESHOLD = 5_000;
const GROWTH_FACTOR_NUM = 5n;
const GROWTH_FACTOR_DEN = 4n;
const MAX_BISECTION_DEPTH = 20;

export function createExplorerTitrateState(): ExplorerTitrateState {
  return { learnedRange: null };
}

export function shouldBisect(resultCount: number): boolean {
  return resultCount >= RESULT_CAP;
}

export function bisectRange(
  start: bigint,
  end: bigint,
): [[bigint, bigint], [bigint, bigint]] {
  const mid = start + (end - start) / 2n;
  return [
    [start, mid],
    [mid + 1n, end],
  ];
}

export function updateLearnedRange(
  state: ExplorerTitrateState,
  rangeSize: bigint,
  resultCount: number,
): void {
  const wasLearned = state.learnedRange !== null;

  if (state.learnedRange === null || rangeSize < state.learnedRange) {
    state.learnedRange = rangeSize;
  }

  if (wasLearned && resultCount < GROWTH_THRESHOLD && state.learnedRange !== null) {
    state.learnedRange = (state.learnedRange * GROWTH_FACTOR_NUM) / GROWTH_FACTOR_DEN;
  }
}

export function getMaxBisectionDepth(): number {
  return MAX_BISECTION_DEPTH;
}
