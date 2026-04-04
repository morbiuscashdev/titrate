import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DistributeStep } from './DistributeStep.js';

const mockSetActiveStep = vi.fn();

const defaultCampaign = {
  activeCampaign: {
    id: 'test-1',
    name: 'Test Campaign',
    version: 1,
    chainId: 1,
    rpcUrl: 'https://rpc.example.com',
    tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    tokenDecimals: 18,
    contractAddress: null,
    contractVariant: 'simple',
    contractName: 'USDC',
    amountMode: 'uniform',
    amountFormat: 'integer',
    uniformAmount: '1000',
    batchSize: 100,
    campaignId: null,
    pinnedBlock: null,
    funder: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as Record<string, unknown> | null,
  campaigns: [],
  activeStepId: 'distribute' as const,
  stepStates: [],
  setActiveStep: mockSetActiveStep,
  setActiveCampaign: vi.fn(),
  createCampaign: vi.fn(),
  saveCampaign: vi.fn(),
  refreshCampaigns: vi.fn(),
};

let campaignOverrides: Partial<typeof defaultCampaign> = {};

vi.mock('../providers/CampaignProvider.js', () => ({
  useCampaign: () => ({ ...defaultCampaign, ...campaignOverrides }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  campaignOverrides = {};
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DistributeStep', () => {
  it('renders step panel with title', () => {
    render(<DistributeStep />);
    expect(screen.getByText('Distribute')).toBeInTheDocument();
  });

  it('shows no campaign message when none is active', () => {
    campaignOverrides = { activeCampaign: null };
    render(<DistributeStep />);
    expect(screen.getByText(/no active campaign selected/i)).toBeInTheDocument();
  });

  it('shows distribution plan in ready state', () => {
    render(<DistributeStep />);
    expect(screen.getByText('Distribution Plan')).toBeInTheDocument();
    expect(screen.getByText('Test Campaign')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('uniform')).toBeInTheDocument();
  });

  it('shows deploy button when contract is not deployed', () => {
    render(<DistributeStep />);
    expect(screen.getByRole('button', { name: /deploy contract/i })).toBeInTheDocument();
  });

  it('hides deploy button when contract is deployed', () => {
    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0x1234567890123456789012345678901234567890',
      } as typeof defaultCampaign.activeCampaign,
    };
    render(<DistributeStep />);
    expect(screen.queryByRole('button', { name: /deploy contract/i })).not.toBeInTheDocument();
  });

  it('shows start distribution button', () => {
    render(<DistributeStep />);
    expect(screen.getByRole('button', { name: /start distribution/i })).toBeInTheDocument();
  });

  it('shows deploying state when deploy is clicked', () => {
    render(<DistributeStep />);
    fireEvent.click(screen.getByRole('button', { name: /deploy contract/i }));
    expect(screen.getByText(/deploying distribution contract/i)).toBeInTheDocument();
  });

  it('shows batch timeline when distribution starts', () => {
    render(<DistributeStep />);
    fireEvent.click(screen.getByRole('button', { name: /start distribution/i }));
    expect(screen.getByText(/distribution in progress/i)).toBeInTheDocument();
    expect(screen.getByText('Batch #1')).toBeInTheDocument();
    expect(screen.getByText('Batch #2')).toBeInTheDocument();
    expect(screen.getByText('Batch #3')).toBeInTheDocument();
  });

  it('shows spend summary on completion', () => {
    render(<DistributeStep />);
    fireEvent.click(screen.getByRole('button', { name: /start distribution/i }));

    // Advance through all batch confirmations and final completion
    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.getByText('Distribution Summary')).toBeInTheDocument();
  });

  it('shows uniform amount when set', () => {
    render(<DistributeStep />);
    expect(screen.getByText(/1000 USDC/)).toBeInTheDocument();
  });

  it('shows contract status as not deployed', () => {
    render(<DistributeStep />);
    expect(screen.getByText('Not deployed')).toBeInTheDocument();
  });

  it('shows contract status as deployed when address exists', () => {
    campaignOverrides = {
      activeCampaign: {
        ...defaultCampaign.activeCampaign!,
        contractAddress: '0x1234567890123456789012345678901234567890',
      } as typeof defaultCampaign.activeCampaign,
    };
    render(<DistributeStep />);
    expect(screen.getByText('Deployed')).toBeInTheDocument();
  });
});
