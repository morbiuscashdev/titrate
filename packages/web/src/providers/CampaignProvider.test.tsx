import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { computeStepStates, STEP_DEFINITIONS, CampaignProvider, useCampaign } from './CampaignProvider.js';
import type { StepId, StepState } from './CampaignProvider.js';
import type { StoredCampaign } from '@titrate/sdk';
import type { ReactNode } from 'react';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

function makeCampaign(overrides: Partial<StoredCampaign> = {}): StoredCampaign {
  return {
    id: 'test-1',
    funder: '0x1234567890abcdef1234567890abcdef12345678',
    name: 'Test Campaign',
    version: 1,
    chainId: 0,
    rpcUrl: '',
    tokenAddress: ZERO_ADDRESS,
    tokenDecimals: 18,
    contractAddress: null,
    contractVariant: 'simple',
    contractName: '',
    amountMode: 'uniform',
    amountFormat: 'integer',
    uniformAmount: null,
    batchSize: 100,
    campaignId: null,
    pinnedBlock: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  } as StoredCampaign;
}

/** Helper to extract status by step id. */
function statusOf(states: readonly StepState[], id: StepId): StepState['status'] {
  const state = states.find((s) => s.id === id);
  if (!state) {
    throw new Error(`Step ${id} not found`);
  }
  return state.status;
}

describe('STEP_DEFINITIONS', () => {
  it('contains 7 steps in the correct order', () => {
    expect(STEP_DEFINITIONS).toHaveLength(7);
    const ids = STEP_DEFINITIONS.map((d) => d.id);
    expect(ids).toEqual([
      'campaign',
      'addresses',
      'filters',
      'amounts',
      'wallet',
      'requirements',
      'distribute',
    ]);
  });
});

describe('computeStepStates', () => {
  const emptyCompleted = new Set<StepId>();

  it('returns all steps locked except campaign (active) when campaign is null', () => {
    const states = computeStepStates(null, 0, emptyCompleted);
    expect(states).toHaveLength(7);
    expect(statusOf(states, 'campaign')).toBe('active');
    expect(statusOf(states, 'addresses')).toBe('locked');
    expect(statusOf(states, 'filters')).toBe('locked');
    expect(statusOf(states, 'amounts')).toBe('locked');
    expect(statusOf(states, 'wallet')).toBe('locked');
    expect(statusOf(states, 'requirements')).toBe('locked');
    expect(statusOf(states, 'distribute')).toBe('locked');
  });

  it('marks campaign active when chainId is 0', () => {
    const campaign = makeCampaign({ chainId: 0 });
    const states = computeStepStates(campaign, 0, emptyCompleted);
    expect(statusOf(states, 'campaign')).toBe('active');
    expect(statusOf(states, 'addresses')).toBe('locked');
  });

  it('marks campaign active when tokenAddress is zero address', () => {
    const campaign = makeCampaign({ chainId: 1, tokenAddress: ZERO_ADDRESS });
    const states = computeStepStates(campaign, 0, emptyCompleted);
    expect(statusOf(states, 'campaign')).toBe('active');
    expect(statusOf(states, 'addresses')).toBe('locked');
  });

  it('marks campaign complete and addresses active when chain and token are set', () => {
    const campaign = makeCampaign({
      chainId: 1,
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    });
    const states = computeStepStates(campaign, 0, emptyCompleted);
    expect(statusOf(states, 'campaign')).toBe('complete');
    expect(statusOf(states, 'addresses')).toBe('active');
    expect(statusOf(states, 'filters')).toBe('locked');
    expect(statusOf(states, 'amounts')).toBe('locked');
  });

  it('marks addresses complete but filters active when address sets exist', () => {
    const campaign = makeCampaign({
      chainId: 1,
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    });
    const states = computeStepStates(campaign, 3, emptyCompleted);
    expect(statusOf(states, 'campaign')).toBe('complete');
    expect(statusOf(states, 'addresses')).toBe('complete');
    expect(statusOf(states, 'filters')).toBe('active');
    expect(statusOf(states, 'amounts')).toBe('locked');
    expect(statusOf(states, 'wallet')).toBe('locked');
  });

  it('marks filters complete when explicitly completed', () => {
    const campaign = makeCampaign({
      chainId: 1,
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    });
    const completed = new Set<StepId>(['filters']);
    const states = computeStepStates(campaign, 3, completed);
    expect(statusOf(states, 'addresses')).toBe('complete');
    expect(statusOf(states, 'filters')).toBe('complete');
    expect(statusOf(states, 'amounts')).toBe('active');
  });

  it('marks amounts complete when uniformAmount is set and filters completed', () => {
    const campaign = makeCampaign({
      chainId: 1,
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      uniformAmount: '1000',
    });
    const completed = new Set<StepId>(['filters']);
    const states = computeStepStates(campaign, 2, completed);
    expect(statusOf(states, 'campaign')).toBe('complete');
    expect(statusOf(states, 'addresses')).toBe('complete');
    expect(statusOf(states, 'filters')).toBe('complete');
    expect(statusOf(states, 'amounts')).toBe('complete');
    expect(statusOf(states, 'wallet')).toBe('active');
    expect(statusOf(states, 'requirements')).toBe('locked');
  });

  it('marks amounts complete when amountMode is variable and filters completed', () => {
    const campaign = makeCampaign({
      chainId: 1,
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      amountMode: 'variable',
    });
    const completed = new Set<StepId>(['filters']);
    const states = computeStepStates(campaign, 1, completed);
    expect(statusOf(states, 'amounts')).toBe('complete');
    expect(statusOf(states, 'wallet')).toBe('active');
  });

  it('progresses through all steps with completedSteps overrides', () => {
    const campaign = makeCampaign({
      chainId: 1,
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      uniformAmount: '500',
    });
    const completed = new Set<StepId>(['filters', 'wallet', 'requirements']);
    const states = computeStepStates(campaign, 5, completed);

    expect(statusOf(states, 'campaign')).toBe('complete');
    expect(statusOf(states, 'addresses')).toBe('complete');
    expect(statusOf(states, 'filters')).toBe('complete');
    expect(statusOf(states, 'amounts')).toBe('complete');
    expect(statusOf(states, 'wallet')).toBe('complete');
    expect(statusOf(states, 'requirements')).toBe('complete');
    expect(statusOf(states, 'distribute')).toBe('active');
  });

  it('respects the step ordering — locked steps never precede active', () => {
    const campaign = makeCampaign({
      chainId: 1,
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    });
    const states = computeStepStates(campaign, 0, emptyCompleted);

    let seenActive = false;
    for (const state of states) {
      if (state.status === 'active') {
        seenActive = true;
        continue;
      }
      // After active, everything must be locked
      if (seenActive) {
        expect(state.status).toBe('locked');
      }
    }
  });

  it('returns exactly one active step', () => {
    const campaign = makeCampaign({
      chainId: 1,
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    });
    const completed = new Set<StepId>(['filters']);
    const states = computeStepStates(campaign, 2, completed);
    const activeSteps = states.filter((s) => s.status === 'active');
    expect(activeSteps).toHaveLength(1);
  });

  it('preserves step labels from STEP_DEFINITIONS', () => {
    const states = computeStepStates(null, 0, emptyCompleted);
    for (let i = 0; i < STEP_DEFINITIONS.length; i++) {
      expect(states[i].label).toBe(STEP_DEFINITIONS[i].label);
      expect(states[i].id).toBe(STEP_DEFINITIONS[i].id);
    }
  });

  it('handles campaign with no address sets but amounts mode variable', () => {
    const campaign = makeCampaign({
      chainId: 1,
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      amountMode: 'variable',
    });
    // No address sets — addresses step is active, not amounts
    const states = computeStepStates(campaign, 0, emptyCompleted);
    expect(statusOf(states, 'campaign')).toBe('complete');
    expect(statusOf(states, 'addresses')).toBe('active');
    expect(statusOf(states, 'amounts')).toBe('locked');
  });
});

// ---------------------------------------------------------------------------
// CampaignProvider integration tests
// ---------------------------------------------------------------------------

const mockCampaignsList: StoredCampaign[] = [];
const mockStorage = {
  campaigns: {
    get: vi.fn(),
    getByIdentity: vi.fn(),
    put: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockImplementation(() => Promise.resolve([...mockCampaignsList])),
    delete: vi.fn().mockResolvedValue(undefined),
  },
  addressSets: {
    getByCampaign: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
    put: vi.fn(),
  },
  addresses: {
    getBySet: vi.fn(),
    putBatch: vi.fn(),
    countBySet: vi.fn(),
  },
  batches: {
    get: vi.fn(),
    getByCampaign: vi.fn(),
    put: vi.fn(),
    getLastCompleted: vi.fn(),
  },
  wallets: {
    get: vi.fn(),
    put: vi.fn(),
  },
  pipelineConfigs: {
    get: vi.fn(),
    put: vi.fn(),
  },
  chainConfigs: {
    get: vi.fn(),
    getByChainId: vi.fn(),
    put: vi.fn(),
    list: vi.fn(),
    delete: vi.fn(),
  },
  appSettings: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
};

let storageReturnValue: { storage: typeof mockStorage | null; isUnlocked: boolean; unlock: ReturnType<typeof vi.fn> } = {
  storage: mockStorage,
  isUnlocked: false,
  unlock: vi.fn(),
};

vi.mock('./StorageProvider.js', () => ({
  useStorage: () => storageReturnValue,
}));

// Stable UUID for deterministic tests
let uuidCounter = 0;
vi.stubGlobal('crypto', {
  ...globalThis.crypto,
  randomUUID: () => `provider-uuid-${uuidCounter++}`,
});

function wrapper({ children }: { children: ReactNode }) {
  return <CampaignProvider>{children}</CampaignProvider>;
}

describe('CampaignProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uuidCounter = 0;
    mockCampaignsList.length = 0;
    storageReturnValue = { storage: mockStorage, isUnlocked: false, unlock: vi.fn() };
  });

  it('loads campaigns list on mount', async () => {
    const stored = makeCampaign({ id: 'c-1', name: 'Loaded' });
    mockCampaignsList.push(stored);

    const { result } = renderHook(() => useCampaign(), { wrapper });

    await waitFor(() => {
      expect(result.current.campaigns).toHaveLength(1);
    });
    expect(result.current.campaigns[0].name).toBe('Loaded');
    expect(mockStorage.campaigns.list).toHaveBeenCalled();
  });

  it('createCampaign saves to storage and returns id', async () => {
    const defaults = {
      funder: '0x1234567890abcdef1234567890abcdef12345678' as const,
      name: 'New Campaign',
      version: 1,
      chainId: 1,
      rpcUrl: '',
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const,
      tokenDecimals: 18,
      contractAddress: null,
      contractVariant: 'simple' as const,
      contractName: '',
      amountMode: 'uniform' as const,
      amountFormat: 'integer' as const,
      uniformAmount: null,
      batchSize: 100,
      campaignId: null,
      pinnedBlock: null,
    };

    const { result } = renderHook(() => useCampaign(), { wrapper });

    // Wait for initial mount effects
    await waitFor(() => {
      expect(mockStorage.campaigns.list).toHaveBeenCalled();
    });

    let id: string | undefined;
    await act(async () => {
      id = await result.current.createCampaign(defaults);
    });

    expect(id).toBe('provider-uuid-0');
    expect(mockStorage.campaigns.put).toHaveBeenCalledTimes(1);
    const savedCampaign = mockStorage.campaigns.put.mock.calls[0][0];
    expect(savedCampaign.id).toBe('provider-uuid-0');
    expect(savedCampaign.name).toBe('New Campaign');
    expect(savedCampaign.createdAt).toBeDefined();
    expect(savedCampaign.updatedAt).toBeDefined();
  });

  it('saveCampaign updates updatedAt and refreshes list', async () => {
    const existing = makeCampaign({ id: 'c-save', name: 'Original', createdAt: 1000, updatedAt: 1000 });

    const { result } = renderHook(() => useCampaign(), { wrapper });

    await waitFor(() => {
      expect(mockStorage.campaigns.list).toHaveBeenCalled();
    });

    await act(async () => {
      await result.current.saveCampaign(existing);
    });

    expect(mockStorage.campaigns.put).toHaveBeenCalledTimes(1);
    const saved = mockStorage.campaigns.put.mock.calls[0][0];
    expect(saved.name).toBe('Original');
    expect(saved.updatedAt).toBeGreaterThan(1000);
    // refreshCampaigns is called after saving
    expect(mockStorage.campaigns.list).toHaveBeenCalledTimes(2);
  });

  it('deleteCampaign removes and refreshes list', async () => {
    mockCampaignsList.push(makeCampaign({ id: 'c-del' }));

    const { result } = renderHook(() => useCampaign(), { wrapper });

    await waitFor(() => {
      expect(result.current.campaigns).toHaveLength(1);
    });

    await act(async () => {
      await result.current.deleteCampaign('c-del');
    });

    expect(mockStorage.campaigns.delete).toHaveBeenCalledWith('c-del');
    // list was called again after delete
    expect(mockStorage.campaigns.list).toHaveBeenCalledTimes(2);
  });

  it('deleteCampaign clears active campaign when deleting the active one', async () => {
    const campaign = makeCampaign({ id: 'c-active-del', chainId: 1, tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const });
    mockCampaignsList.push(campaign);
    mockStorage.campaigns.get.mockResolvedValue(campaign);

    const { result } = renderHook(() => useCampaign(), { wrapper });

    await waitFor(() => {
      expect(result.current.campaigns).toHaveLength(1);
    });

    // Activate the campaign
    act(() => {
      result.current.setActiveCampaign('c-active-del');
    });

    await waitFor(() => {
      expect(result.current.activeCampaign).not.toBeNull();
    });

    // Now delete it
    await act(async () => {
      await result.current.deleteCampaign('c-active-del');
    });

    expect(result.current.activeCampaign).toBeNull();
  });

  it('cloneCampaign creates copy with new id and "(copy)" suffix', async () => {
    const source = makeCampaign({ id: 'c-clone', name: 'Source Campaign' });
    mockStorage.campaigns.get.mockResolvedValue(source);

    const { result } = renderHook(() => useCampaign(), { wrapper });

    await waitFor(() => {
      expect(mockStorage.campaigns.list).toHaveBeenCalled();
    });

    let cloneId: string | undefined;
    await act(async () => {
      cloneId = await result.current.cloneCampaign('c-clone');
    });

    expect(cloneId).toBe('provider-uuid-0');
    expect(mockStorage.campaigns.get).toHaveBeenCalledWith('c-clone');
    expect(mockStorage.campaigns.put).toHaveBeenCalledTimes(1);

    const cloned = mockStorage.campaigns.put.mock.calls[0][0];
    expect(cloned.id).toBe('provider-uuid-0');
    expect(cloned.name).toBe('Source Campaign (copy)');
    expect(cloned.contractAddress).toBeNull();
  });

  it('cloneCampaign throws when campaign not found', async () => {
    mockStorage.campaigns.get.mockResolvedValue(null);

    const { result } = renderHook(() => useCampaign(), { wrapper });

    await waitFor(() => {
      expect(mockStorage.campaigns.list).toHaveBeenCalled();
    });

    await expect(
      act(async () => {
        await result.current.cloneCampaign('nonexistent');
      }),
    ).rejects.toThrow('Campaign nonexistent not found');
  });

  it('setActiveCampaign loads campaign and address sets', async () => {
    const campaign = makeCampaign({
      id: 'c-activate',
      chainId: 1,
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const,
    });
    mockStorage.campaigns.get.mockResolvedValue(campaign);
    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'as-1', campaignId: 'c-activate', name: 'set1', type: 'source', addressCount: 10, createdAt: Date.now() },
    ]);

    const { result } = renderHook(() => useCampaign(), { wrapper });

    await waitFor(() => {
      expect(mockStorage.campaigns.list).toHaveBeenCalled();
    });

    act(() => {
      result.current.setActiveCampaign('c-activate');
    });

    await waitFor(() => {
      expect(result.current.activeCampaign).not.toBeNull();
    });

    expect(result.current.activeCampaign!.id).toBe('c-activate');
    expect(mockStorage.campaigns.get).toHaveBeenCalledWith('c-activate');
    expect(mockStorage.addressSets.getByCampaign).toHaveBeenCalledWith('c-activate');
    // With source address sets, addresses step should be complete
    expect(result.current.stepStates.find((s) => s.id === 'addresses')?.status).toBe('complete');
  });

  it('setActiveCampaign handles campaign not found in storage (null)', async () => {
    mockStorage.campaigns.get.mockResolvedValue(null);

    const { result } = renderHook(() => useCampaign(), { wrapper });

    await waitFor(() => {
      expect(mockStorage.campaigns.list).toHaveBeenCalled();
    });

    act(() => {
      result.current.setActiveCampaign('nonexistent');
    });

    await waitFor(() => {
      // When storage.campaigns.get returns null, campaign is set to null
      // and addressSets are cleared (line 206)
      expect(mockStorage.campaigns.get).toHaveBeenCalledWith('nonexistent');
    });

    // activeCampaign should be null since the campaign wasn't found
    expect(result.current.activeCampaign).toBeNull();
  });

  it('setActiveCampaign with null clears active campaign', async () => {
    const campaign = makeCampaign({ id: 'c-clear' });
    mockStorage.campaigns.get.mockResolvedValue(campaign);

    const { result } = renderHook(() => useCampaign(), { wrapper });

    await waitFor(() => {
      expect(mockStorage.campaigns.list).toHaveBeenCalled();
    });

    // Activate
    act(() => {
      result.current.setActiveCampaign('c-clear');
    });

    await waitFor(() => {
      expect(result.current.activeCampaign).not.toBeNull();
    });

    // Deactivate
    act(() => {
      result.current.setActiveCampaign(null);
    });

    expect(result.current.activeCampaign).toBeNull();
  });

  it('setActiveStep changes active step id', async () => {
    const campaign = makeCampaign({
      id: 'c-step',
      chainId: 1,
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const,
    });
    mockStorage.campaigns.get.mockResolvedValue(campaign);
    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'as-1', campaignId: 'c-step', name: 'set1', type: 'source', addressCount: 5, createdAt: Date.now() },
    ]);

    const { result } = renderHook(() => useCampaign(), { wrapper });

    await waitFor(() => {
      expect(mockStorage.campaigns.list).toHaveBeenCalled();
    });

    act(() => {
      result.current.setActiveCampaign('c-step');
    });

    await waitFor(() => {
      expect(result.current.activeCampaign).not.toBeNull();
    });

    // Campaign and addresses are complete, filters is active
    expect(result.current.activeStepId).toBe('filters');

    // Navigate back to campaign step (complete, so not locked)
    act(() => {
      result.current.setActiveStep('campaign');
    });

    expect(result.current.activeStepId).toBe('campaign');
  });

  it('setActiveStep ignores locked steps', async () => {
    const campaign = makeCampaign({
      id: 'c-locked',
      chainId: 1,
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const,
    });
    mockStorage.campaigns.get.mockResolvedValue(campaign);
    mockStorage.addressSets.getByCampaign.mockResolvedValue([]);

    const { result } = renderHook(() => useCampaign(), { wrapper });

    await waitFor(() => {
      expect(mockStorage.campaigns.list).toHaveBeenCalled();
    });

    act(() => {
      result.current.setActiveCampaign('c-locked');
    });

    await waitFor(() => {
      expect(result.current.activeCampaign).not.toBeNull();
    });

    // addresses is active, filters is locked
    expect(result.current.activeStepId).toBe('addresses');

    // Try to navigate to locked step
    act(() => {
      result.current.setActiveStep('distribute');
    });

    // Should stay on first active step, not jump to locked step
    expect(result.current.activeStepId).toBe('addresses');
  });

  it('completeStep marks step as completed and updates step states', async () => {
    const campaign = makeCampaign({
      id: 'c-complete',
      chainId: 1,
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const,
    });
    mockStorage.campaigns.get.mockResolvedValue(campaign);
    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'as-1', campaignId: 'c-complete', name: 'set1', type: 'source', addressCount: 5, createdAt: Date.now() },
    ]);

    const { result } = renderHook(() => useCampaign(), { wrapper });

    await waitFor(() => {
      expect(mockStorage.campaigns.list).toHaveBeenCalled();
    });

    act(() => {
      result.current.setActiveCampaign('c-complete');
    });

    await waitFor(() => {
      expect(result.current.activeCampaign).not.toBeNull();
    });

    // filters is active
    expect(result.current.stepStates.find((s) => s.id === 'filters')?.status).toBe('active');

    // Complete filters
    act(() => {
      result.current.completeStep('filters');
    });

    expect(result.current.stepStates.find((s) => s.id === 'filters')?.status).toBe('complete');
    // amounts should now be active
    expect(result.current.stepStates.find((s) => s.id === 'amounts')?.status).toBe('active');
  });

  it('refreshActiveCampaign reloads campaign and address sets', async () => {
    const campaign = makeCampaign({
      id: 'c-refresh',
      name: 'Before Refresh',
      chainId: 1,
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const,
    });
    mockStorage.campaigns.get.mockResolvedValue(campaign);
    mockStorage.addressSets.getByCampaign.mockResolvedValue([]);

    const { result } = renderHook(() => useCampaign(), { wrapper });

    await waitFor(() => {
      expect(mockStorage.campaigns.list).toHaveBeenCalled();
    });

    act(() => {
      result.current.setActiveCampaign('c-refresh');
    });

    await waitFor(() => {
      expect(result.current.activeCampaign).not.toBeNull();
    });

    // Now update the mock to return different data
    const updatedCampaign = { ...campaign, name: 'After Refresh' };
    mockStorage.campaigns.get.mockResolvedValue(updatedCampaign);
    mockStorage.addressSets.getByCampaign.mockResolvedValue([
      { id: 'as-new', campaignId: 'c-refresh', name: 'new-set', type: 'source', addressCount: 3, createdAt: Date.now() },
    ]);

    await act(async () => {
      await result.current.refreshActiveCampaign();
    });

    expect(result.current.activeCampaign!.name).toBe('After Refresh');
    // With source address sets now loaded, addresses should be complete
    expect(result.current.stepStates.find((s) => s.id === 'addresses')?.status).toBe('complete');
  });

  it('useCampaign throws outside of CampaignProvider', () => {
    // Suppress React error boundary console output
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      renderHook(() => useCampaign());
    }).toThrow('useCampaign must be used within a CampaignProvider');
    spy.mockRestore();
  });

  it('createCampaign throws when storage is null', async () => {
    storageReturnValue = { storage: null, isUnlocked: false, unlock: vi.fn() };

    const { result } = renderHook(() => useCampaign(), { wrapper });

    await expect(
      act(async () => {
        await result.current.createCampaign({
          funder: '0x1234567890abcdef1234567890abcdef12345678' as const,
          name: 'Test',
          version: 1,
          chainId: 1,
          rpcUrl: '',
          tokenAddress: ZERO_ADDRESS,
          tokenDecimals: 18,
          contractAddress: null,
          contractVariant: 'simple' as const,
          contractName: '',
          amountMode: 'uniform' as const,
          amountFormat: 'integer' as const,
          uniformAmount: null,
          batchSize: 100,
          campaignId: null,
          pinnedBlock: null,
        });
      }),
    ).rejects.toThrow('Storage not initialized');
  });

  it('saveCampaign throws when storage is null', async () => {
    storageReturnValue = { storage: null, isUnlocked: false, unlock: vi.fn() };

    const { result } = renderHook(() => useCampaign(), { wrapper });

    await expect(
      act(async () => {
        await result.current.saveCampaign(makeCampaign());
      }),
    ).rejects.toThrow('Storage not initialized');
  });

  it('deleteCampaign throws when storage is null', async () => {
    storageReturnValue = { storage: null, isUnlocked: false, unlock: vi.fn() };

    const { result } = renderHook(() => useCampaign(), { wrapper });

    await expect(
      act(async () => {
        await result.current.deleteCampaign('some-id');
      }),
    ).rejects.toThrow('Storage not initialized');
  });

  it('cloneCampaign throws when storage is null', async () => {
    storageReturnValue = { storage: null, isUnlocked: false, unlock: vi.fn() };

    const { result } = renderHook(() => useCampaign(), { wrapper });

    await expect(
      act(async () => {
        await result.current.cloneCampaign('some-id');
      }),
    ).rejects.toThrow('Storage not initialized');
  });

  it('saveCampaign refreshes active campaign state when saving the active one', async () => {
    const campaign = makeCampaign({
      id: 'c-save-active',
      name: 'Active Save',
      chainId: 1,
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const,
    });
    mockStorage.campaigns.get.mockResolvedValue(campaign);
    mockStorage.addressSets.getByCampaign.mockResolvedValue([]);

    const { result } = renderHook(() => useCampaign(), { wrapper });

    await waitFor(() => {
      expect(mockStorage.campaigns.list).toHaveBeenCalled();
    });

    // Set it as active
    act(() => {
      result.current.setActiveCampaign('c-save-active');
    });

    await waitFor(() => {
      expect(result.current.activeCampaign).not.toBeNull();
    });

    // Save the active campaign with updated name
    await act(async () => {
      await result.current.saveCampaign({ ...campaign, name: 'Updated Name' });
    });

    // The active campaign should be updated in state
    expect(result.current.activeCampaign!.name).toBe('Updated Name');
    // addressSets.getByCampaign should have been called to refresh address sets
    expect(mockStorage.addressSets.getByCampaign).toHaveBeenCalledWith('c-save-active');
  });
});
