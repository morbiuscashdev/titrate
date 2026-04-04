import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AmountsStep, canSubmitAmounts } from './AmountsStep.js';

const mockSaveCampaign = vi.fn().mockResolvedValue(undefined);
const mockSetActiveStep = vi.fn();

type CampaignLike = {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly chainId: number;
  readonly rpcUrl: string;
  readonly funder: string;
  readonly tokenAddress: string;
  readonly tokenDecimals: number;
  readonly contractAddress: string | null;
  readonly contractVariant: 'simple' | 'full';
  readonly contractName: string;
  readonly amountMode: 'uniform' | 'variable';
  readonly amountFormat: 'integer' | 'decimal';
  readonly uniformAmount: string | null;
  readonly batchSize: number;
  readonly campaignId: string | null;
  readonly pinnedBlock: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
};

const baseCampaign: CampaignLike = {
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

let activeCampaignOverride: CampaignLike | null = baseCampaign;

vi.mock('../providers/CampaignProvider.js', () => ({
  useCampaign: () => ({
    activeCampaign: activeCampaignOverride,
    campaigns: [],
    activeStepId: 'amounts',
    stepStates: [],
    setActiveCampaign: vi.fn(),
    setActiveStep: mockSetActiveStep,
    createCampaign: vi.fn(),
    saveCampaign: mockSaveCampaign,
    refreshCampaigns: vi.fn(),
  }),
}));

describe('AmountsStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeCampaignOverride = baseCampaign;
  });

  it('renders step panel with title', () => {
    render(<AmountsStep />);
    expect(screen.getByText('Amounts')).toBeInTheDocument();
  });

  it('renders mode toggle with Uniform and Variable', () => {
    render(<AmountsStep />);
    expect(screen.getByText('Uniform')).toBeInTheDocument();
    expect(screen.getByText('Variable')).toBeInTheDocument();
  });

  it('renders format toggle', () => {
    render(<AmountsStep />);
    expect(screen.getByText('Integer')).toBeInTheDocument();
    expect(screen.getByText('Decimal')).toBeInTheDocument();
  });

  it('shows amount input in uniform mode', () => {
    render(<AmountsStep />);
    expect(screen.getByPlaceholderText(/amount/i)).toBeInTheDocument();
  });

  it('hides amount input in variable mode', () => {
    render(<AmountsStep />);
    fireEvent.click(screen.getByText('Variable'));
    expect(screen.queryByPlaceholderText(/amount/i)).toBeNull();
  });

  it('disables continue when uniform mode has no amount', () => {
    render(<AmountsStep />);
    const button = screen.getByText('Save & Continue');
    expect(button).toBeDisabled();
  });

  it('enables continue when uniform amount is entered', () => {
    render(<AmountsStep />);
    fireEvent.change(screen.getByPlaceholderText(/amount/i), {
      target: { value: '1000' },
    });
    const button = screen.getByText('Save & Continue');
    expect(button).not.toBeDisabled();
  });

  it('enables continue in variable mode without amount', () => {
    render(<AmountsStep />);
    fireEvent.click(screen.getByText('Variable'));
    const button = screen.getByText('Save & Continue');
    expect(button).not.toBeDisabled();
  });

  it('saves campaign with uniform amount and advances', async () => {
    render(<AmountsStep />);
    fireEvent.change(screen.getByPlaceholderText(/amount/i), {
      target: { value: '500' },
    });
    fireEvent.click(screen.getByText('Save & Continue'));

    await vi.waitFor(() => {
      expect(mockSaveCampaign).toHaveBeenCalledTimes(1);
    });

    const saved = mockSaveCampaign.mock.calls[0][0];
    expect(saved.amountMode).toBe('uniform');
    expect(saved.uniformAmount).toBe('500');
    expect(mockSetActiveStep).toHaveBeenCalledWith('wallet');
  });

  it('saves campaign with variable mode and advances', async () => {
    render(<AmountsStep />);
    fireEvent.click(screen.getByText('Variable'));
    fireEvent.click(screen.getByText('Save & Continue'));

    await vi.waitFor(() => {
      expect(mockSaveCampaign).toHaveBeenCalledTimes(1);
    });

    const saved = mockSaveCampaign.mock.calls[0][0];
    expect(saved.amountMode).toBe('variable');
    expect(saved.uniformAmount).toBeNull();
    expect(mockSetActiveStep).toHaveBeenCalledWith('wallet');
  });

  it('shows total display when uniform amount is entered', () => {
    render(<AmountsStep />);
    fireEvent.change(screen.getByPlaceholderText(/amount/i), {
      target: { value: '1000' },
    });
    expect(screen.getByText('1000')).toBeInTheDocument();
    expect(screen.getByText(/Each recipient will receive/)).toBeInTheDocument();
  });

  it('renders without crashing when no active campaign', () => {
    activeCampaignOverride = null;
    render(<AmountsStep />);
    expect(screen.getByText('Amounts')).toBeInTheDocument();
  });

  it('save is disabled in uniform mode when amount is empty', () => {
    render(<AmountsStep />);
    // baseCampaign has uniformAmount: null so the input is empty
    const button = screen.getByText('Save & Continue');
    expect(button).toBeDisabled();
  });

  it('initializes mode from active campaign', () => {
    activeCampaignOverride = {
      ...baseCampaign,
      amountMode: 'variable' as const,
      amountFormat: 'decimal' as const,
      uniformAmount: null,
    };
    render(<AmountsStep />);
    // In variable mode, amount input should be hidden and Save should be enabled
    expect(screen.queryByPlaceholderText(/amount/i)).toBeNull();
    expect(screen.getByText('Save & Continue')).not.toBeDisabled();
  });

  it('does not save when uniform mode and amount is whitespace', async () => {
    render(<AmountsStep />);
    fireEvent.change(screen.getByPlaceholderText(/amount/i), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByText('Save & Continue'));
    // saveCampaign should NOT be called since trimmed amount is empty
    expect(mockSaveCampaign).not.toHaveBeenCalled();
  });

  it('does not save when activeCampaign is null', () => {
    activeCampaignOverride = null;
    render(<AmountsStep />);
    // The button should be disabled in uniform mode with no amount,
    // but even if forced, handleContinue early-returns
    expect(screen.getByText('Save & Continue')).toBeDisabled();
    expect(mockSaveCampaign).not.toHaveBeenCalled();
  });

  it('does not save when uniform mode and amount is empty and campaign exists', () => {
    render(<AmountsStep />);
    // Default uniform mode, no amount entered
    fireEvent.click(screen.getByText('Save & Continue'));
    expect(mockSaveCampaign).not.toHaveBeenCalled();
  });
});

describe('canSubmitAmounts', () => {
  it('returns true for variable mode regardless of amount', () => {
    expect(canSubmitAmounts('variable', '')).toBe(true);
    expect(canSubmitAmounts('variable', '  ')).toBe(true);
    expect(canSubmitAmounts('variable', '100')).toBe(true);
  });

  it('returns false for uniform mode with empty amount', () => {
    expect(canSubmitAmounts('uniform', '')).toBe(false);
  });

  it('returns false for uniform mode with whitespace-only amount', () => {
    expect(canSubmitAmounts('uniform', '   ')).toBe(false);
  });

  it('returns true for uniform mode with non-empty amount', () => {
    expect(canSubmitAmounts('uniform', '1000')).toBe(true);
  });
});
