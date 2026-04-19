import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChainSelector } from './ChainSelector.js';

const chains = [
  { chainId: 1, name: 'Ethereum' },
  { chainId: 8453, name: 'Base' },
  { chainId: 42161, name: 'Arbitrum' },
];

describe('ChainSelector', () => {
  it('renders all chain options', () => {
    render(<ChainSelector chains={chains} selectedChainId={null} />);
    expect(screen.getByText('Ethereum')).toBeInTheDocument();
    expect(screen.getByText('Base')).toBeInTheDocument();
    expect(screen.getByText('Arbitrum')).toBeInTheDocument();
  });
  it('highlights selected chain', () => {
    render(<ChainSelector chains={chains} selectedChainId={8453} />);
    const base = screen.getByText('Base').closest('button');
    expect(base?.getAttribute('aria-pressed')).toBe('true');
  });
  it('calls onSelect with chainId', () => {
    const onSelect = vi.fn();
    render(<ChainSelector chains={chains} selectedChainId={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Base'));
    expect(onSelect).toHaveBeenCalledWith(8453);
  });
});
