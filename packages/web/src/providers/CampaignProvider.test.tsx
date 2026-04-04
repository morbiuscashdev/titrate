import { describe, it, expect } from 'vitest';
import { computeStepStates, STEP_DEFINITIONS } from './CampaignProvider.js';
import type { StepId, StepState } from './CampaignProvider.js';
import type { StoredCampaign } from '@titrate/sdk';

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

  it('marks addresses and filters complete when address sets exist', () => {
    const campaign = makeCampaign({
      chainId: 1,
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    });
    const states = computeStepStates(campaign, 3, emptyCompleted);
    expect(statusOf(states, 'campaign')).toBe('complete');
    expect(statusOf(states, 'addresses')).toBe('complete');
    expect(statusOf(states, 'filters')).toBe('complete');
    expect(statusOf(states, 'amounts')).toBe('active');
    expect(statusOf(states, 'wallet')).toBe('locked');
  });

  it('marks amounts complete when uniformAmount is set', () => {
    const campaign = makeCampaign({
      chainId: 1,
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      uniformAmount: '1000',
    });
    const states = computeStepStates(campaign, 2, emptyCompleted);
    expect(statusOf(states, 'campaign')).toBe('complete');
    expect(statusOf(states, 'addresses')).toBe('complete');
    expect(statusOf(states, 'filters')).toBe('complete');
    expect(statusOf(states, 'amounts')).toBe('complete');
    expect(statusOf(states, 'wallet')).toBe('active');
    expect(statusOf(states, 'requirements')).toBe('locked');
  });

  it('marks amounts complete when amountMode is variable', () => {
    const campaign = makeCampaign({
      chainId: 1,
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      amountMode: 'variable',
    });
    const states = computeStepStates(campaign, 1, emptyCompleted);
    expect(statusOf(states, 'amounts')).toBe('complete');
    expect(statusOf(states, 'wallet')).toBe('active');
  });

  it('progresses through all steps with completedSteps overrides', () => {
    const campaign = makeCampaign({
      chainId: 1,
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      uniformAmount: '500',
    });
    const completed = new Set<StepId>(['wallet', 'requirements']);
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
    const states = computeStepStates(campaign, 2, emptyCompleted);
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
