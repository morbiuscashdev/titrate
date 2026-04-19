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
  it('tags complete status via data-status', () => {
    render(<StatusBadge status="complete" />);
    const badge = screen.getByText('complete');
    expect(badge.getAttribute('data-status')).toBe('complete');
  });
  it('tags error status via data-status', () => {
    render(<StatusBadge status="error" />);
    const badge = screen.getByText('error');
    expect(badge.getAttribute('data-status')).toBe('error');
  });
});
