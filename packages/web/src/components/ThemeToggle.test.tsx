import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThemeToggle } from './ThemeToggle.js';

const mockSetTheme = vi.fn();
let mockTheme = 'system' as 'light' | 'dark' | 'system';
let mockResolved = 'dark' as 'light' | 'dark';

vi.mock('../providers/ThemeProvider.js', () => ({
  useTheme: () => ({
    theme: mockTheme,
    resolvedTheme: mockResolved,
    setTheme: mockSetTheme,
  }),
}));

describe('ThemeToggle', () => {
  beforeEach(() => {
    mockSetTheme.mockClear();
    mockTheme = 'system';
    mockResolved = 'dark';
  });

  it('renders two buttons', () => {
    render(<ThemeToggle />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
  });

  it('shows moon icon when resolved theme is dark', () => {
    render(<ThemeToggle />);
    const lightDarkButton = screen.getByLabelText('Switch to light mode');
    expect(lightDarkButton).toBeInTheDocument();
  });

  it('shows sun icon when resolved theme is light', () => {
    mockResolved = 'light';
    render(<ThemeToggle />);
    const lightDarkButton = screen.getByLabelText('Switch to dark mode');
    expect(lightDarkButton).toBeInTheDocument();
  });

  it('toggles to light when in system dark mode and left button clicked', () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByLabelText('Switch to light mode'));
    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });

  it('toggles to dark when currently light', () => {
    mockTheme = 'light';
    mockResolved = 'light';
    render(<ThemeToggle />);
    fireEvent.click(screen.getByLabelText('Switch to dark mode'));
    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('sets system mode when system button clicked', () => {
    mockTheme = 'dark';
    render(<ThemeToggle />);
    fireEvent.click(screen.getByLabelText('Use system theme'));
    expect(mockSetTheme).toHaveBeenCalledWith('system');
  });

  it('marks system button active when theme is system', () => {
    render(<ThemeToggle />);
    const systemButton = screen.getByLabelText('Use system theme');
    expect(systemButton.getAttribute('aria-pressed')).toBe('true');
    expect(systemButton.className).toContain('bg-gray-700');
  });

  it('marks light/dark button active when theme is manual', () => {
    mockTheme = 'dark';
    render(<ThemeToggle />);
    const ldButton = screen.getByLabelText('Switch to light mode');
    expect(ldButton.getAttribute('aria-pressed')).toBe('true');
    expect(ldButton.className).toContain('bg-gray-700');
  });
});
