import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FiltersStep } from './FiltersStep.js';

const mockSetActiveStep = vi.fn();
const mockPutPipelineConfig = vi.fn().mockResolvedValue(undefined);

vi.mock('../providers/CampaignProvider.js', () => ({
  useCampaign: () => ({
    activeCampaign: {
      id: 'campaign-1',
      name: 'Test',
      version: 1,
      chainId: 1,
      rpcUrl: '',
      funder: '0x0000000000000000000000000000000000000000',
      tokenAddress: '0x0000000000000000000000000000000000000000',
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
    },
    campaigns: [],
    activeStepId: 'filters',
    stepStates: [],
    setActiveCampaign: vi.fn(),
    setActiveStep: mockSetActiveStep,
    completeStep: vi.fn(),
    createCampaign: vi.fn(),
    saveCampaign: vi.fn(),
    refreshCampaigns: vi.fn(),
  }),
}));

vi.mock('../providers/StorageProvider.js', () => ({
  useStorage: () => ({
    storage: {
      pipelineConfigs: { put: mockPutPipelineConfig },
    },
    isUnlocked: true,
  }),
}));

vi.stubGlobal('crypto', {
  ...globalThis.crypto,
  randomUUID: () => 'filter-uuid-1',
});

describe('FiltersStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders step panel with title', () => {
    render(<FiltersStep />);
    expect(screen.getByText('Filters')).toBeInTheDocument();
  });

  it('shows skip button when no filters added', () => {
    render(<FiltersStep />);
    expect(screen.getByText('Skip Filters')).toBeInTheDocument();
  });

  it('advances to amounts on skip', () => {
    render(<FiltersStep />);
    fireEvent.click(screen.getByText('Skip Filters'));
    expect(mockSetActiveStep).toHaveBeenCalledWith('amounts');
  });

  it('adds a filter when clicking add button', () => {
    render(<FiltersStep />);
    fireEvent.click(screen.getByText('+ Add Filter'));
    expect(screen.getByText('Filter 1')).toBeInTheDocument();
    // Default filter type is contract-check -> "Exclude Contracts"
    expect(screen.getByText('Exclude Contracts')).toBeInTheDocument();
  });

  it('shows save button after adding a filter', () => {
    render(<FiltersStep />);
    fireEvent.click(screen.getByText('+ Add Filter'));
    expect(screen.getByText('Save & Continue')).toBeInTheDocument();
    expect(screen.queryByText('Skip Filters')).toBeNull();
  });

  it('removes a filter', () => {
    render(<FiltersStep />);
    fireEvent.click(screen.getByText('+ Add Filter'));
    expect(screen.getByText('Filter 1')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Remove'));
    expect(screen.queryByText('Filter 1')).toBeNull();
    // Skip button should reappear
    expect(screen.getByText('Skip Filters')).toBeInTheDocument();
  });

  it('saves pipeline config and advances on continue', async () => {
    render(<FiltersStep />);
    fireEvent.click(screen.getByText('+ Add Filter'));
    fireEvent.click(screen.getByText('Save & Continue'));

    await vi.waitFor(() => {
      expect(mockPutPipelineConfig).toHaveBeenCalledTimes(1);
    });

    expect(mockPutPipelineConfig.mock.calls[0][0]).toBe('campaign-1');
    expect(mockPutPipelineConfig.mock.calls[0][1].steps).toHaveLength(1);
    expect(mockPutPipelineConfig.mock.calls[0][1].steps[0]).toMatchObject({
      type: 'filter',
      filterType: 'contract-check',
    });
    expect(mockSetActiveStep).toHaveBeenCalledWith('amounts');
  });

  it('changes filter type when a different type button is clicked', () => {
    render(<FiltersStep />);
    fireEvent.click(screen.getByText('+ Add Filter'));
    // Default is contract-check; switch to nonce-range
    fireEvent.click(screen.getByText('Nonce Range'));
    // Nonce Range filter shows Min nonce / Max nonce fields
    expect(screen.getByText('Min nonce')).toBeInTheDocument();
    expect(screen.getByText('Max nonce')).toBeInTheDocument();
  });

  it('updates filter params when input changes', () => {
    render(<FiltersStep />);
    fireEvent.click(screen.getByText('+ Add Filter'));
    // Switch to min-balance to get a text input
    fireEvent.click(screen.getByText('Min Balance'));
    expect(screen.getByText('Minimum balance (ETH)')).toBeInTheDocument();
    // The input starts empty; change it
    const inputs = screen.getAllByRole('textbox');
    const balanceInput = inputs[inputs.length - 1];
    fireEvent.change(balanceInput, { target: { value: '1.5' } });
    expect(balanceInput).toHaveValue('1.5');
  });

  it('saves with correct filter type and params after changes', async () => {
    render(<FiltersStep />);
    fireEvent.click(screen.getByText('+ Add Filter'));
    // Switch to nonce-range
    fireEvent.click(screen.getByText('Nonce Range'));
    // Fill in params — there are two text inputs for min/max nonce
    const inputs = screen.getAllByRole('textbox');
    const minInput = inputs[inputs.length - 2];
    const maxInput = inputs[inputs.length - 1];
    fireEvent.change(minInput, { target: { value: '10' } });
    fireEvent.change(maxInput, { target: { value: '50' } });
    fireEvent.click(screen.getByText('Save & Continue'));

    await vi.waitFor(() => {
      expect(mockPutPipelineConfig).toHaveBeenCalledTimes(1);
    });

    expect(mockPutPipelineConfig.mock.calls[0][1].steps[0]).toMatchObject({
      type: 'filter',
      filterType: 'nonce-range',
      params: { minNonce: '10', maxNonce: '50' },
    });
  });
});
