import { describe, it, expect } from 'vitest';
import {
  createExplorerTitrateState,
  shouldBisect,
  bisectRange,
  updateLearnedRange,
  RESULT_CAP,
} from '../../explorer/titrate.js';

describe('shouldBisect', () => {
  it('returns true when result count equals the cap', () => {
    expect(shouldBisect(RESULT_CAP)).toBe(true);
  });
  it('returns false when result count is below the cap', () => {
    expect(shouldBisect(9_999)).toBe(false);
  });
  it('returns false for zero results', () => {
    expect(shouldBisect(0)).toBe(false);
  });
});

describe('bisectRange', () => {
  it('splits range into two halves', () => {
    const [left, right] = bisectRange(0n, 1000n);
    expect(left).toEqual([0n, 500n]);
    expect(right).toEqual([501n, 1000n]);
  });
  it('handles odd ranges', () => {
    const [left, right] = bisectRange(0n, 999n);
    expect(left).toEqual([0n, 499n]);
    expect(right).toEqual([500n, 999n]);
  });
  it('handles single-block range', () => {
    const [left, right] = bisectRange(100n, 100n);
    expect(left).toEqual([100n, 100n]);
    expect(right).toEqual([101n, 100n]);
  });
});

describe('createExplorerTitrateState', () => {
  it('starts with no learned range', () => {
    const state = createExplorerTitrateState();
    expect(state.learnedRange).toBeNull();
  });
});

describe('updateLearnedRange', () => {
  it('learns the range size on first successful query', () => {
    const state = createExplorerTitrateState();
    updateLearnedRange(state, 5000n, 3000);
    expect(state.learnedRange).toBe(5000n);
  });
  it('grows range by 25% when results are under 5000', () => {
    const state = createExplorerTitrateState();
    state.learnedRange = 1000n;
    updateLearnedRange(state, 1000n, 2000);
    expect(state.learnedRange).toBe(1250n);
  });
  it('does not grow when results are 5000 or more', () => {
    const state = createExplorerTitrateState();
    state.learnedRange = 1000n;
    updateLearnedRange(state, 1000n, 7000);
    expect(state.learnedRange).toBe(1000n);
  });
  it('shrinks learned range when bisection was needed', () => {
    const state = createExplorerTitrateState();
    state.learnedRange = 10000n;
    updateLearnedRange(state, 5000n, 8000);
    expect(state.learnedRange).toBe(5000n);
  });
});
