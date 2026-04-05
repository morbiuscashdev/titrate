import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { LoadingButton } from './LoadingButton.js';

describe('LoadingButton', () => {
  it('renders children', () => {
    render(<LoadingButton isLoading={false}>Click me</LoadingButton>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('shows spinner when loading', () => {
    const { container } = render(<LoadingButton isLoading>Loading</LoadingButton>);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass('animate-spin');
  });

  it('does not show spinner when not loading', () => {
    const { container } = render(<LoadingButton isLoading={false}>Idle</LoadingButton>);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeInTheDocument();
  });

  it('disables button when loading', () => {
    render(<LoadingButton isLoading>Working</LoadingButton>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('disables button when disabled prop is true', () => {
    render(<LoadingButton isLoading={false} disabled>Nope</LoadingButton>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('calls onClick when not loading', () => {
    const handleClick = vi.fn();
    render(<LoadingButton isLoading={false} onClick={handleClick}>Go</LoadingButton>);
    screen.getByRole('button').click();
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('does not call onClick when loading', () => {
    const handleClick = vi.fn();
    render(<LoadingButton isLoading onClick={handleClick}>Go</LoadingButton>);
    screen.getByRole('button').click();
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('applies primary variant classes by default', () => {
    render(<LoadingButton isLoading={false}>Primary</LoadingButton>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('bg-blue-600');
  });

  it('applies secondary variant classes', () => {
    render(<LoadingButton isLoading={false} variant="secondary">Secondary</LoadingButton>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('bg-gray-800');
  });

  it('passes through className', () => {
    render(<LoadingButton isLoading={false} className="mt-4">Styled</LoadingButton>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('mt-4');
  });
});
