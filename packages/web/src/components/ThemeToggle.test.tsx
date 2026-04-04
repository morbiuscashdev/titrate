import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThemeToggle } from './ThemeToggle.js';

// Mock useTheme to isolate ThemeToggle tests from the provider
const mockSetTheme = vi.fn();
vi.mock('../providers/ThemeProvider.js', () => ({
  useTheme: () => ({
    theme: 'system' as const,
    resolvedTheme: 'dark' as const,
    setTheme: mockSetTheme,
  }),
}));

describe('ThemeToggle', () => {
  beforeEach(() => {
    mockSetTheme.mockClear();
  });

  it('renders three buttons: Light, Dark, System', () => {
    render(<ThemeToggle />);
    expect(screen.getByText('Light')).toBeInTheDocument();
    expect(screen.getByText('Dark')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
  });

  it('calls setTheme with "light" when Light is clicked', () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByText('Light'));
    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });

  it('calls setTheme with "dark" when Dark is clicked', () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByText('Dark'));
    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('calls setTheme with "system" when System is clicked', () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByText('System'));
    expect(mockSetTheme).toHaveBeenCalledWith('system');
  });

  it('marks the active button with aria-pressed and highlighted styling', () => {
    render(<ThemeToggle />);
    const systemButton = screen.getByText('System');
    expect(systemButton.getAttribute('aria-pressed')).toBe('true');
    expect(systemButton.className).toContain('bg-gray-700');
  });

  it('marks inactive buttons with non-highlighted styling', () => {
    render(<ThemeToggle />);
    const lightButton = screen.getByText('Light');
    expect(lightButton.getAttribute('aria-pressed')).toBe('false');
    expect(lightButton.className).toContain('bg-gray-900');
  });
});
