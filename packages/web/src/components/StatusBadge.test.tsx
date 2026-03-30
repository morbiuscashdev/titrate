import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatusBadge } from './StatusBadge.js';

describe('StatusBadge', () => {
  it('renders the label text', () => {
    render(<StatusBadge status="complete" label="Done" />);
    expect(screen.getByText('Done')).toBeInTheDocument();
  });
  it('renders status as label when no label prop given', () => {
    render(<StatusBadge status="pending" />);
    expect(screen.getByText('pending')).toBeInTheDocument();
  });
  it('applies green styling for complete status', () => {
    render(<StatusBadge status="complete" />);
    const badge = screen.getByText('complete');
    expect(badge.className).toContain('green');
  });
  it('applies red styling for error status', () => {
    render(<StatusBadge status="error" />);
    const badge = screen.getByText('error');
    expect(badge.className).toContain('red');
  });
});
