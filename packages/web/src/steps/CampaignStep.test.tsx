import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CampaignStep } from './CampaignStep.js';

const mockSaveCampaign = vi.fn().mockResolvedValue(undefined);
const mockCreateCampaign = vi.fn().mockResolvedValue('new-id');
const mockSetActiveStep = vi.fn();

vi.mock('../providers/CampaignProvider.js', () => ({
  useCampaign: () => ({
    activeCampaign: null,
    campaigns: [],
    activeStepId: 'campaign',
    stepStates: [],
    setActiveCampaign: vi.fn(),
    setActiveStep: mockSetActiveStep,
    createCampaign: mockCreateCampaign,
    saveCampaign: mockSaveCampaign,
    refreshCampaigns: vi.fn(),
  }),
}));

vi.mock('../hooks/useTokenMetadata.js', () => ({
  useTokenMetadata: () => ({ data: undefined, isLoading: false, error: null }),
}));

vi.mock('@titrate/sdk', () => ({
  SUPPORTED_CHAINS: [
    { chainId: 1, name: 'Ethereum', rpcUrls: ['https://eth.llamarpc.com'] },
    { chainId: 369, name: 'PulseChain', rpcUrls: ['https://rpc.pulsechain.com'] },
  ],
  getChainConfig: (chainId: number) => {
    const chains: Record<number, { chainId: number; rpcUrls: string[] }> = {
      1: { chainId: 1, rpcUrls: ['https://eth.llamarpc.com'] },
      369: { chainId: 369, rpcUrls: ['https://rpc.pulsechain.com'] },
    };
    return chains[chainId] ?? null;
  },
}));

describe('CampaignStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders step panel with title', () => {
    render(<CampaignStep />);
    expect(screen.getByText('Campaign Setup')).toBeInTheDocument();
  });

  it('renders chain selector with supported chains', () => {
    render(<CampaignStep />);
    expect(screen.getByText('Ethereum')).toBeInTheDocument();
    expect(screen.getByText('PulseChain')).toBeInTheDocument();
  });

  it('renders form fields', () => {
    render(<CampaignStep />);
    expect(screen.getByPlaceholderText('https://...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('0x...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('My Airdrop Campaign')).toBeInTheDocument();
    expect(screen.getByText('Simple')).toBeInTheDocument();
    expect(screen.getByText('Full')).toBeInTheDocument();
  });

  it('auto-fills RPC URL when chain is selected', () => {
    render(<CampaignStep />);
    fireEvent.click(screen.getByText('Ethereum'));
    const rpcInput = screen.getByPlaceholderText('https://...') as HTMLInputElement;
    expect(rpcInput.value).toBe('https://eth.llamarpc.com');
  });

  it('toggles contract variant', () => {
    render(<CampaignStep />);
    const fullButton = screen.getByText('Full');
    fireEvent.click(fullButton);
    expect(fullButton.className).toContain('ring-blue');
  });

  it('disables save button when form is incomplete', () => {
    render(<CampaignStep />);
    const saveButton = screen.getByText('Save & Continue');
    expect(saveButton).toBeDisabled();
  });

  it('enables save button when chain and name are set', () => {
    render(<CampaignStep />);
    fireEvent.click(screen.getByText('Ethereum'));
    fireEvent.change(screen.getByPlaceholderText('My Airdrop Campaign'), {
      target: { value: 'Test Campaign' },
    });
    const saveButton = screen.getByText('Save & Continue');
    expect(saveButton).not.toBeDisabled();
  });

  it('calls createCampaign on save when no active campaign', async () => {
    render(<CampaignStep />);
    fireEvent.click(screen.getByText('Ethereum'));
    fireEvent.change(screen.getByPlaceholderText('My Airdrop Campaign'), {
      target: { value: 'Test Campaign' },
    });
    fireEvent.click(screen.getByText('Save & Continue'));

    await vi.waitFor(() => {
      expect(mockCreateCampaign).toHaveBeenCalledTimes(1);
    });

    const config = mockCreateCampaign.mock.calls[0][0];
    expect(config.chainId).toBe(1);
    expect(config.name).toBe('Test Campaign');
    expect(config.contractVariant).toBe('simple');
    expect(config.batchSize).toBe(100);
  });

  it('renders batch size input with default value', () => {
    render(<CampaignStep />);
    const batchInput = screen.getByDisplayValue('100') as HTMLInputElement;
    expect(batchInput).toBeInTheDocument();
  });
});
