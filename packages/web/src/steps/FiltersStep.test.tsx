import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FiltersStep, getFilterLabel } from './FiltersStep.js';

const mockSetActiveStep = vi.fn();
const mockCompleteStep = vi.fn();
const mockPutPipelineConfig = vi.fn().mockResolvedValue(undefined);
const mockPipelineExecute = vi.fn();
const mockGetByCampaign = vi.fn().mockResolvedValue([
  { id: 'set-1', campaignId: 'campaign-1', name: 'Source', type: 'source', addressCount: 3 },
]);
const mockGetBySet = vi.fn().mockResolvedValue([
  { id: '1', address: '0x1111111111111111111111111111111111111111' },
  { id: '2', address: '0x2222222222222222222222222222222222222222' },
  { id: '3', address: '0x3333333333333333333333333333333333333333' },
]);

const defaultCampaign = {
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
};

let activeCampaignOverride: typeof defaultCampaign | null = defaultCampaign;
let storageOverride: {
  pipelineConfigs: { put: ReturnType<typeof vi.fn> };
  addressSets: { getByCampaign: ReturnType<typeof vi.fn> };
  addresses: { getBySet: ReturnType<typeof vi.fn> };
} | null = {
  pipelineConfigs: { put: mockPutPipelineConfig },
  addressSets: { getByCampaign: mockGetByCampaign },
  addresses: { getBySet: mockGetBySet },
};

vi.mock('../providers/CampaignProvider.js', () => ({
  useCampaign: () => ({
    activeCampaign: activeCampaignOverride,
    campaigns: [],
    activeStepId: 'filters',
    stepStates: [],
    setActiveCampaign: vi.fn(),
    setActiveStep: mockSetActiveStep,
    completeStep: mockCompleteStep,
    createCampaign: vi.fn(),
    saveCampaign: vi.fn(),
    refreshCampaigns: vi.fn(),
  }),
}));

vi.mock('../providers/StorageProvider.js', () => ({
  useStorage: () => ({
    storage: storageOverride,
    isUnlocked: true,
  }),
}));

vi.mock('@titrate/sdk', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    createPipeline: () => ({
      execute: (...args: unknown[]) => mockPipelineExecute(...args),
    }),
  };
});

vi.mock('../providers/ChainProvider.js', () => ({
  useChain: () => ({ publicClient: {}, rpcBus: null, explorerBus: null, chainConfig: null }),
}));

vi.stubGlobal('crypto', {
  ...globalThis.crypto,
  randomUUID: () => 'filter-uuid-1',
});

describe('FiltersStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeCampaignOverride = defaultCampaign;
    mockGetByCampaign.mockResolvedValue([
      { id: 'set-1', campaignId: 'campaign-1', name: 'Source', type: 'source', addressCount: 3 },
    ]);
    mockGetBySet.mockResolvedValue([
      { id: '1', address: '0x1111111111111111111111111111111111111111' },
      { id: '2', address: '0x2222222222222222222222222222222222222222' },
      { id: '3', address: '0x3333333333333333333333333333333333333333' },
    ]);
    storageOverride = {
      pipelineConfigs: { put: mockPutPipelineConfig },
      addressSets: { getByCampaign: mockGetByCampaign },
      addresses: { getBySet: mockGetBySet },
    };
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
    // Appears in both the type selector button and the filter summary
    expect(screen.getAllByText('Exclude Contracts').length).toBeGreaterThanOrEqual(1);
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

  it('does not save when storage is null', async () => {
    storageOverride = null;

    render(<FiltersStep />);
    fireEvent.click(screen.getByText('+ Add Filter'));
    fireEvent.click(screen.getByText('Save & Continue'));

    // handleContinue early-returns, no pipeline config saved
    expect(mockPutPipelineConfig).not.toHaveBeenCalled();
    expect(mockSetActiveStep).not.toHaveBeenCalledWith('amounts');
  });

  it('does not save when activeCampaign is null', async () => {
    activeCampaignOverride = null;

    render(<FiltersStep />);
    fireEvent.click(screen.getByText('+ Add Filter'));
    fireEvent.click(screen.getByText('Save & Continue'));

    // handleContinue early-returns
    expect(mockPutPipelineConfig).not.toHaveBeenCalled();
  });

  it('shows filter summary with count and labels', () => {
    render(<FiltersStep />);
    fireEvent.click(screen.getByText('+ Add Filter'));
    // Summary should show "1 filter configured"
    expect(screen.getByText('1 filter configured')).toBeInTheDocument();
    // Summary note about preview hint
    expect(
      screen.getByText(/use preview filters to see how many addresses pass/i),
    ).toBeInTheDocument();
  });

  it('shows plural filter count for multiple filters', () => {
    // Stub randomUUID to return unique IDs
    let callCount = 0;
    vi.stubGlobal('crypto', {
      ...globalThis.crypto,
      randomUUID: () => `filter-uuid-${++callCount}`,
    });

    render(<FiltersStep />);
    fireEvent.click(screen.getByText('+ Add Filter'));
    fireEvent.click(screen.getByText('+ Add Filter'));
    expect(screen.getByText('2 filters configured')).toBeInTheDocument();
  });

  it('hides filter summary when no filters are configured', () => {
    render(<FiltersStep />);
    expect(screen.queryByText(/filter configured/i)).toBeNull();
    expect(screen.queryByText(/filters configured/i)).toBeNull();
  });

  it('shows Preview Filters button when filters and addresses are configured', async () => {
    render(<FiltersStep />);
    await waitFor(() => {
      expect(mockGetBySet).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByText('+ Add Filter'));
    await waitFor(() => {
      expect(screen.getByText('Preview Filters')).toBeInTheDocument();
    });
  });

  it('shows no-addresses hint when filters exist but no addresses loaded', async () => {
    mockGetByCampaign.mockResolvedValue([]);
    mockGetBySet.mockResolvedValue([]);
    render(<FiltersStep />);
    fireEvent.click(screen.getByText('+ Add Filter'));
    await waitFor(() => {
      expect(mockGetByCampaign).toHaveBeenCalled();
    });
    expect(screen.queryByText('Preview Filters')).not.toBeInTheDocument();
    expect(screen.getByText(/no addresses loaded yet/i)).toBeInTheDocument();
  });

  it('runs preview and shows surviving count', async () => {
    mockPipelineExecute.mockImplementation(async function* () {
      yield ['0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222'];
    });

    render(<FiltersStep />);

    await waitFor(() => {
      expect(mockGetBySet).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('+ Add Filter'));

    await waitFor(() => {
      expect(screen.getByText('Preview Filters')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Preview Filters'));

    const passText = await screen.findByRole('status');
    expect(passText.textContent).toContain('2');
    expect(passText.textContent).toContain('of');
    expect(passText.textContent).toContain('3');
    expect(passText.textContent).toContain('addresses pass');
  });

  it('shows error when preview fails', async () => {
    mockPipelineExecute.mockImplementation(async function* () {
      throw new Error('RPC timeout');
    });

    render(<FiltersStep />);
    await waitFor(() => {
      expect(mockGetBySet).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('+ Add Filter'));
    await waitFor(() => {
      expect(screen.getByText('Preview Filters')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Preview Filters'));

    await waitFor(() => {
      expect(screen.getByText(/RPC timeout/)).toBeInTheDocument();
    });
  });

  it('updates preview hint text in summary after successful preview', async () => {
    mockPipelineExecute.mockImplementation(async function* () {
      yield ['0x1111111111111111111111111111111111111111'];
    });

    render(<FiltersStep />);
    await waitFor(() => {
      expect(mockGetBySet).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('+ Add Filter'));
    await waitFor(() => {
      expect(screen.getByText('Preview Filters')).toBeInTheDocument();
    });

    // Before preview: shows hint text
    expect(screen.getByText(/use preview filters/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Preview Filters'));

    await waitFor(() => {
      expect(screen.getByText(/will receive tokens/i)).toBeInTheDocument();
    });
  });
});

describe('getFilterLabel', () => {
  it('returns label for known filter types', () => {
    expect(getFilterLabel('contract-check')).toBe('Exclude Contracts');
    expect(getFilterLabel('min-balance')).toBe('Min Balance');
    expect(getFilterLabel('nonce-range')).toBe('Nonce Range');
    expect(getFilterLabel('token-recipients')).toBe('Token Recipients');
    expect(getFilterLabel('csv-exclusion')).toBe('CSV Exclusion');
  });

  it('falls back to raw type string for unknown types', () => {
    expect(getFilterLabel('custom-filter')).toBe('custom-filter');
  });
});
