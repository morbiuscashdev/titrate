import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RequirementsPanel } from './RequirementsPanel.js';

describe('RequirementsPanel', () => {
  it('renders gas token requirements', () => {
    render(<RequirementsPanel gasTokenNeeded="0.5 ETH" gasTokenBalance="1.0 ETH" gasTokenSymbol="ETH" erc20Needed="10,000 USDC" erc20Balance="50,000 USDC" tokenSymbol="USDC" batchCount={5} isSufficient />);
    expect(screen.getByText('0.5 ETH')).toBeInTheDocument();
    expect(screen.getByText(/1.0 ETH/)).toBeInTheDocument();
  });
  it('renders ERC-20 requirements', () => {
    render(<RequirementsPanel gasTokenNeeded="0.5 ETH" gasTokenBalance="1.0 ETH" gasTokenSymbol="ETH" erc20Needed="10,000 USDC" erc20Balance="50,000 USDC" tokenSymbol="USDC" batchCount={5} isSufficient />);
    expect(screen.getByText('10,000 USDC')).toBeInTheDocument();
  });
  it('shows warning when insufficient', () => {
    render(<RequirementsPanel gasTokenNeeded="2.0 ETH" gasTokenBalance="0.1 ETH" gasTokenSymbol="ETH" erc20Needed="10,000 USDC" erc20Balance="50,000 USDC" tokenSymbol="USDC" batchCount={5} isSufficient={false} />);
    expect(screen.getByText(/insufficient/i)).toBeInTheDocument();
  });
  it('shows ready state when sufficient', () => {
    render(<RequirementsPanel gasTokenNeeded="0.5 ETH" gasTokenBalance="1.0 ETH" gasTokenSymbol="ETH" erc20Needed="10,000 USDC" erc20Balance="50,000 USDC" tokenSymbol="USDC" batchCount={5} isSufficient />);
    expect(screen.getByText(/ready/i)).toBeInTheDocument();
  });
});
