const TARGET_MS = 1_000;
const MIN_RANGE = 50n;
const GROWTH_FACTOR_NUM = 9n;
const GROWTH_FACTOR_DEN = 8n;

export type TitrateState = {
  blockRange: bigint;
};

/** Create initial titrate state with a given starting block range. */
export function createTitrateState(initialRange = 1_000n): TitrateState {
  return { blockRange: initialRange };
}

/**
 * Adjust the block range based on how long the last query took.
 * Grows when fast, shrinks when slow, always stays above MIN_RANGE.
 */
export function adjustRange(state: TitrateState, elapsedMs: number): void {
  if (elapsedMs > TARGET_MS) {
    const ratio = BigInt(Math.round((TARGET_MS / elapsedMs) * 100));
    state.blockRange = (state.blockRange * ratio) / 100n;
  } else {
    state.blockRange = (state.blockRange * GROWTH_FACTOR_NUM) / GROWTH_FACTOR_DEN;
  }
  if (state.blockRange < MIN_RANGE) state.blockRange = MIN_RANGE;
}

/** Halve the block range (used after a query-size error). */
export function shrinkRange(state: TitrateState): void {
  state.blockRange = state.blockRange / 2n;
  if (state.blockRange < MIN_RANGE) state.blockRange = MIN_RANGE;
}

/** Returns true if the error indicates the query returned too many results. */
export function isQuerySizeError(error: unknown): boolean {
  const msg = String(error);
  return (
    msg.includes('too many') ||
    msg.includes('exceed') ||
    msg.includes('limit') ||
    msg.includes('Log response size exceeded') ||
    msg.includes('string longer than')
  );
}
