import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BatchStatusCard } from './BatchStatusCard.js';

describe('BatchStatusCard', () => {
  it('renders batch index and recipient count', () => {
    render(<BatchStatusCard batchIndex={0} recipientCount={200} status="confirmed" />);
    expect(screen.getByText('Batch #1')).toBeInTheDocument();
    expect(screen.getByText(/200 recipients/)).toBeInTheDocument();
  });
  it('renders tx hash as link when explorer URL is provided', () => {
    render(<BatchStatusCard batchIndex={0} recipientCount={100} status="confirmed" txHash="0xabc123" explorerUrl="https://etherscan.io" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://etherscan.io/tx/0xabc123');
  });
  it('renders status badge', () => {
    render(<BatchStatusCard batchIndex={0} recipientCount={100} status="failed" />);
    expect(screen.getByText('failed')).toBeInTheDocument();
  });
  it('renders gas estimate when provided', () => {
    render(<BatchStatusCard batchIndex={0} recipientCount={100} status="confirmed" gasEstimate="500,000" />);
    expect(screen.getByText(/500,000/)).toBeInTheDocument();
  });
});
