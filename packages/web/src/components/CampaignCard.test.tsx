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

  it('progress bar width reflects completion percentage', () => {
    const { container } = render(<CampaignCard {...props} />);
    const innerBar = container.querySelector('[data-progress-bar]') as HTMLElement;
    expect(innerBar).not.toBeNull();
    // 3/10 = 30%
    expect(innerBar.style.width).toBe('30%');
  });

  it('progress bar is 0% when total is 0', () => {
    const { container } = render(
      <CampaignCard {...props} batchProgress={{ completed: 0, total: 0 }} />,
    );
    const innerBar = container.querySelector('[data-progress-bar]') as HTMLElement;
    expect(innerBar.style.width).toBe('0%');
  });

  it('progress bar is 100% when all batches complete', () => {
    const { container } = render(
      <CampaignCard {...props} batchProgress={{ completed: 10, total: 10 }} />,
    );
    const innerBar = container.querySelector('[data-progress-bar]') as HTMLElement;
    expect(innerBar.style.width).toBe('100%');
  });

  it('handles keyboard Enter to trigger onClick', () => {
    const onClick = vi.fn();
    render(<CampaignCard {...props} onClick={onClick} />);
    const card = screen.getByRole('button');
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not fire onClick on non-Enter keydown', () => {
    const onClick = vi.fn();
    render(<CampaignCard {...props} onClick={onClick} />);
    const card = screen.getByRole('button');
    fireEvent.keyDown(card, { key: 'Space' });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not throw when Enter pressed without onClick', () => {
    render(<CampaignCard {...props} />);
    const card = screen.getByRole('button');
    expect(() => fireEvent.keyDown(card, { key: 'Enter' })).not.toThrow();
  });

  it('shows draft status badge', () => {
    render(<CampaignCard {...props} status="draft" />);
    expect(screen.getByText('draft')).toBeInTheDocument();
  });

  it('shows ready status badge', () => {
    render(<CampaignCard {...props} status="ready" />);
    expect(screen.getByText('ready')).toBeInTheDocument();
  });

  it('shows complete status badge', () => {
    render(<CampaignCard {...props} status="complete" />);
    expect(screen.getByText('complete')).toBeInTheDocument();
  });

  it('wraps the status badge so group-hover can fade it out under floating actions', () => {
    render(<CampaignCard {...props} status="draft" />);
    const badge = screen.getByText('draft');
    const wrapper = badge.parentElement as HTMLElement;
    expect(wrapper.className).toContain('group-hover:opacity-0');
    expect(wrapper.className).toContain('group-hover:pointer-events-none');
    expect(wrapper.className).toContain('transition-opacity');
  });
});
