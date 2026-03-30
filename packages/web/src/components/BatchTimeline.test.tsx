import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BatchTimeline } from './BatchTimeline.js';

describe('BatchTimeline', () => {
  it('renders multiple batch cards', () => {
    const batches = [
      { batchIndex: 0, recipientCount: 200, status: 'confirmed' as const },
      { batchIndex: 1, recipientCount: 200, status: 'confirmed' as const },
      { batchIndex: 2, recipientCount: 150, status: 'pending' as const },
    ];
    render(<BatchTimeline batches={batches} />);
    expect(screen.getByText('Batch #1')).toBeInTheDocument();
    expect(screen.getByText('Batch #2')).toBeInTheDocument();
    expect(screen.getByText('Batch #3')).toBeInTheDocument();
  });
  it('renders empty state', () => {
    render(<BatchTimeline batches={[]} />);
    expect(screen.getByText(/no batches/i)).toBeInTheDocument();
  });
});
