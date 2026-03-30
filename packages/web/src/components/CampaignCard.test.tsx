import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CampaignCard } from './CampaignCard.js';

describe('CampaignCard', () => {
  const props = {
    name: 'March Airdrop',
    chainName: 'Base',
    tokenSymbol: 'USDC',
    addressCount: 48291,
    batchProgress: { completed: 3, total: 10 },
    status: 'distributing' as const,
  };

  it('renders campaign name', () => {
    render(<CampaignCard {...props} />);
    expect(screen.getByText('March Airdrop')).toBeInTheDocument();
  });
  it('renders chain and token', () => {
    render(<CampaignCard {...props} />);
    expect(screen.getByText('Base')).toBeInTheDocument();
    expect(screen.getByText('USDC')).toBeInTheDocument();
  });
  it('renders address count', () => {
    render(<CampaignCard {...props} />);
    expect(screen.getByText(/48,291/)).toBeInTheDocument();
  });
  it('renders batch progress', () => {
    render(<CampaignCard {...props} />);
    expect(screen.getByText('3 / 10')).toBeInTheDocument();
  });
  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<CampaignCard {...props} onClick={onClick} />);
    fireEvent.click(screen.getByText('March Airdrop'));
    expect(onClick).toHaveBeenCalledOnce();
  });
  it('renders status badge', () => {
    render(<CampaignCard {...props} />);
    expect(screen.getByText('distributing')).toBeInTheDocument();
  });
});
