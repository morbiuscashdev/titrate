import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { WelcomeCard } from './WelcomeCard.js';

describe('WelcomeCard', () => {
  it('renders welcome title', () => {
    render(<WelcomeCard onCreateCampaign={vi.fn()} />);
    expect(screen.getByText('Welcome to Titrate')).toBeInTheDocument();
  });

  it('renders 4 step cards', () => {
    render(<WelcomeCard onCreateCampaign={vi.fn()} />);
    expect(screen.getByText('Configure')).toBeInTheDocument();
    expect(screen.getByText('Load Addresses')).toBeInTheDocument();
    expect(screen.getByText('Set Amounts')).toBeInTheDocument();
    expect(screen.getByText('Distribute')).toBeInTheDocument();
  });

  it('calls onCreateCampaign when button clicked', () => {
    const onCreateCampaign = vi.fn();
    render(<WelcomeCard onCreateCampaign={onCreateCampaign} />);
    fireEvent.click(screen.getByText('Create Your First Campaign'));
    expect(onCreateCampaign).toHaveBeenCalledOnce();
  });

  it('shows wallet hint text', () => {
    render(<WelcomeCard onCreateCampaign={vi.fn()} />);
    expect(
      screen.getByText('Connect your wallet first using the button above.'),
    ).toBeInTheDocument();
  });
});
