import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePipelineLiveFilter } from './usePipelineLiveFilter.js';
import type { Address } from 'viem';
import type { PipelineConfig, PipelineStep } from '@titrate/sdk';

// ---- Mocks ----

const mockExecute = vi.fn();

vi.mock('@titrate/sdk', () => ({
  createPipeline: vi.fn(() => ({
    execute: (...args: unknown[]) => mockExecute(...args),
  })),
}));

let chainOverrides: Record<string, unknown> = {};

vi.mock('../providers/ChainProvider.js', () => ({
  useChain: () => ({
    publicClient: { readContract: vi.fn() },
    explorerBus: null,
    rpcBus: null,
    chainConfig: null,
    ...chainOverrides,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  chainOverrides = {};
});

// ---- Helpers ----

const ADDR_A = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as Address;
const ADDR_B = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' as Address;
const ADDR_C = '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC' as Address;

const filterStep: PipelineStep = {
  type: 'filter',
  filterType: 'contract-check',
  params: {},
};

const sourceStep: PipelineStep = {
  type: 'source',
  sourceType: 'csv',
  params: { addresses: [] },
};

function makeConfig(steps: readonly PipelineStep[]): PipelineConfig {
  return { steps };
}

// ---- Tests ----

describe('usePipelineLiveFilter', () => {
  it('returns undefined when config is null', () => {
    const { result } = renderHook(() =>
      usePipelineLiveFilter(null, [ADDR_A]),
    );
    expect(result.current).toBeUndefined();
  });

  it('returns undefined when config has no filter steps', () => {
    const config = makeConfig([sourceStep]);
    const { result } = renderHook(() =>
      usePipelineLiveFilter(config, [ADDR_A]),
    );
    expect(result.current).toBeUndefined();
  });

  it('returns undefined when config has only source steps', () => {
    const config = makeConfig([sourceStep, sourceStep]);
    const { result } = renderHook(() =>
      usePipelineLiveFilter(config, [ADDR_A]),
    );
    expect(result.current).toBeUndefined();
  });

  it('returns undefined when recipients array is empty', () => {
    const config = makeConfig([filterStep]);
    const { result } = renderHook(() =>
      usePipelineLiveFilter(config, []),
    );
    expect(result.current).toBeUndefined();
  });

  it('returns undefined when publicClient is null', () => {
    chainOverrides = { publicClient: null };
    const config = makeConfig([filterStep]);
    const { result } = renderHook(() =>
      usePipelineLiveFilter(config, [ADDR_A]),
    );
    expect(result.current).toBeUndefined();
  });

  it('returns a function when filter steps and recipients are present', () => {
    const config = makeConfig([filterStep]);
    const { result } = renderHook(() =>
      usePipelineLiveFilter(config, [ADDR_A, ADDR_B]),
    );
    expect(result.current).toBeInstanceOf(Function);
  });

  it('filters addresses based on pipeline execution results', async () => {
    // Pipeline returns only ADDR_A and ADDR_B as allowed
    mockExecute.mockImplementation(async function* () {
      yield [ADDR_A, ADDR_B];
    });

    const config = makeConfig([filterStep]);
    const { result } = renderHook(() =>
      usePipelineLiveFilter(config, [ADDR_A, ADDR_B, ADDR_C]),
    );

    const filtered = await result.current!([ADDR_A, ADDR_B, ADDR_C]);
    expect(filtered).toEqual([ADDR_A, ADDR_B]);
  });

  it('caches allowed set across multiple batch calls', async () => {
    mockExecute.mockImplementation(async function* () {
      yield [ADDR_A];
    });

    const config = makeConfig([filterStep]);
    const { result } = renderHook(() =>
      usePipelineLiveFilter(config, [ADDR_A, ADDR_B]),
    );

    // First call triggers pipeline execution
    await result.current!([ADDR_A, ADDR_B]);
    expect(mockExecute).toHaveBeenCalledTimes(1);

    // Second call uses cached set
    const filtered = await result.current!([ADDR_A, ADDR_C]);
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(filtered).toEqual([ADDR_A]);
  });

  it('performs case-insensitive address matching', async () => {
    const lowerA = ADDR_A.toLowerCase() as Address;
    mockExecute.mockImplementation(async function* () {
      yield [lowerA];
    });

    const config = makeConfig([filterStep]);
    const { result } = renderHook(() =>
      usePipelineLiveFilter(config, [ADDR_A]),
    );

    // Input uses original case, pipeline returned lowercase
    const filtered = await result.current!([ADDR_A]);
    expect(filtered).toEqual([ADDR_A]);
  });

  it('returns empty array when no addresses pass the filter', async () => {
    mockExecute.mockImplementation(async function* () {
      yield []; // No addresses pass the filter
    });

    const config = makeConfig([filterStep]);
    const { result } = renderHook(() =>
      usePipelineLiveFilter(config, [ADDR_A, ADDR_B]),
    );

    const filtered = await result.current!([ADDR_A, ADDR_B]);
    expect(filtered).toEqual([]);
  });

  it('handles multiple yield batches from pipeline', async () => {
    mockExecute.mockImplementation(async function* () {
      yield [ADDR_A];
      yield [ADDR_C];
    });

    const config = makeConfig([filterStep]);
    const { result } = renderHook(() =>
      usePipelineLiveFilter(config, [ADDR_A, ADDR_B, ADDR_C]),
    );

    const filtered = await result.current!([ADDR_A, ADDR_B, ADDR_C]);
    expect(filtered).toEqual([ADDR_A, ADDR_C]);
  });

  it('ignores source steps from the config and only uses filters', async () => {
    const { createPipeline } = await import('@titrate/sdk');

    mockExecute.mockImplementation(async function* () {
      yield [ADDR_A];
    });

    // Config has both source and filter steps
    const config = makeConfig([sourceStep, filterStep]);
    const { result } = renderHook(() =>
      usePipelineLiveFilter(config, [ADDR_A, ADDR_B]),
    );

    await result.current!([ADDR_A, ADDR_B]);

    // The pipeline should be created with a csv source (injected) + filter steps only
    const calls = vi.mocked(createPipeline).mock.calls;
    expect(calls.length).toBe(1);
    const pipelineConfig = calls[0][0]!;
    const sourceSteps = pipelineConfig.steps.filter((s) => s.type === 'source');
    const filterSteps = pipelineConfig.steps.filter((s) => s.type === 'filter');

    // Should have exactly one source step (the injected csv) and one filter step
    expect(sourceSteps.length).toBe(1);
    expect(sourceSteps[0].sourceType).toBe('csv');
    expect(filterSteps.length).toBe(1);
    expect(filterSteps[0].filterType).toBe('contract-check');
  });
});
