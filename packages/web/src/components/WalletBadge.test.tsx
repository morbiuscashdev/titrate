import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { WalletBadge } from './WalletBadge.js';

describe('WalletBadge', () => {
  it('renders address and chain', () => {
    render(<WalletBadge address="0xabc…def" chainName="Ethereum" />);
    expect(screen.getByText('0xabc…def')).toBeInTheDocument();
    expect(screen.getByText('Ethereum')).toBeInTheDocument();
  });
  it('renders balance when provided', () => {
    render(<WalletBadge address="0xabc…def" chainName="Base" balance="1.5" balanceSymbol="ETH" />);
    expect(screen.getByText('1.5 ETH')).toBeInTheDocument();
  });
  it('renders perry mode indicator', () => {
    render(<WalletBadge address="0xhot…addr" chainName="Base" perryMode={{ hotAddress: '0xhot…addr', coldAddress: '0xcold…addr' }} />);
    expect(screen.getByText(/perry/i)).toBeInTheDocument();
    expect(screen.getByText(/0xcold…addr/)).toBeInTheDocument();
  });
  it('does not show perry mode when not provided', () => {
    render(<WalletBadge address="0xabc…def" chainName="Ethereum" />);
    expect(screen.queryByText(/perry/i)).toBeNull();
  });
});
