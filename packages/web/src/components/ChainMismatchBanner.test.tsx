import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChainMismatchBanner } from './ChainMismatchBanner.js';
import type { ChainMismatch } from '../hooks/useChainMismatch.js';

function mismatchFixture(overrides: Partial<ChainMismatch> = {}): ChainMismatch {
  return {
    mismatched: true,
    walletChainId: 1,
    campaignChainId: 8453,
    switching: false,
    switchError: null,
    switchChain: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('ChainMismatchBanner', () => {
  it('renders nothing when there is no mismatch', () => {
    const { container } = render(
      <ChainMismatchBanner mismatch={mismatchFixture({ mismatched: false })} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders an alert role with wallet + campaign chain IDs', () => {
    render(<ChainMismatchBanner mismatch={mismatchFixture()} />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeTruthy();
    expect(alert.textContent).toContain('chain 1');
    expect(alert.textContent).toContain('chain 8453');
  });

  it('uses the campaign chain name in the CTA when provided', () => {
    render(
      <ChainMismatchBanner
        mismatch={mismatchFixture()}
        campaignChainName="Base"
      />,
    );

    expect(
      screen.getByRole('button', { name: /switch to base \(chain 8453\)/i }),
    ).toBeTruthy();
  });

  it('falls back to "chain N" when no name is provided', () => {
    render(<ChainMismatchBanner mismatch={mismatchFixture()} />);
    expect(
      screen.getByRole('button', { name: /switch to chain 8453/i }),
    ).toBeTruthy();
  });

  it('calls switchChain on click', () => {
    const switchChain = vi.fn().mockResolvedValue(undefined);
    render(
      <ChainMismatchBanner mismatch={mismatchFixture({ switchChain })} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /switch/i }));
    expect(switchChain).toHaveBeenCalledTimes(1);
  });

  it('disables the button and shows "Switching…" when switching', () => {
    render(
      <ChainMismatchBanner mismatch={mismatchFixture({ switching: true })} />,
    );
    const button = screen.getByRole('button', { name: /switching/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('surfaces switch errors inline', () => {
    render(
      <ChainMismatchBanner
        mismatch={mismatchFixture({
          switchError: new Error('user rejected'),
        })}
      />,
    );
    expect(screen.getByText(/user rejected/i)).toBeTruthy();
  });
});
