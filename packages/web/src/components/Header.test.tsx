import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Header } from './Header.js';

vi.mock('./ThemeToggle.js', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

describe('Header', () => {
  it('renders the Titrate wordmark', () => {
    render(<Header />);
    expect(screen.getByText('Titrate')).toBeInTheDocument();
  });

  it('wordmark links to /', () => {
    render(<Header />);
    const link = screen.getByText('Titrate').closest('a');
    expect(link).toHaveAttribute('href', '/');
  });

  it('settings link points to /settings', () => {
    render(<Header />);
    const settingsLink = screen.getByLabelText('Settings').closest('a');
    expect(settingsLink).toHaveAttribute('href', '/settings');
  });

  it('renders the ThemeToggle', () => {
    render(<Header />);
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
  });

  it('renders children in the wallet badge slot', () => {
    render(
      <Header>
        <span data-testid="wallet-badge">0xabc</span>
      </Header>,
    );
    expect(screen.getByTestId('wallet-badge')).toBeInTheDocument();
    expect(screen.getByText('0xabc')).toBeInTheDocument();
  });
});
