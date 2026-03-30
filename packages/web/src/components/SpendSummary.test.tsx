import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SpendSummary } from './SpendSummary.js';

describe('SpendSummary', () => {
  const props = {
    totalGasEstimate: '0.45 ETH',
    totalTokensSent: '1,000,000 USDC',
    tokenSymbol: 'USDC',
    uniqueRecipients: 4829,
    batchCount: 25,
    confirmedBatches: 24,
    failedBatches: 1,
  };

  it('renders total tokens sent', () => {
    render(<SpendSummary {...props} />);
    expect(screen.getByText('1,000,000 USDC')).toBeInTheDocument();
  });
  it('renders gas estimate', () => {
    render(<SpendSummary {...props} />);
    expect(screen.getByText('0.45 ETH')).toBeInTheDocument();
  });
  it('renders recipient count', () => {
    render(<SpendSummary {...props} />);
    expect(screen.getByText('4,829')).toBeInTheDocument();
  });
  it('renders batch counts', () => {
    render(<SpendSummary {...props} />);
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.getAllByText(/1/).length).toBeGreaterThan(0);
  });
});
