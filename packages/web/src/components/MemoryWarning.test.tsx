import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryWarning } from './MemoryWarning.js';

describe('MemoryWarning', () => {
  it('displays heap usage info', () => {
    render(<MemoryWarning heapUsedMB={3200} heapLimitMB={4096} usagePercent={78} />);
    expect(screen.getByText(/78%/)).toBeInTheDocument();
    expect(screen.getByText(/3200/)).toBeInTheDocument();
  });
  it('calls onDismiss when close button is clicked', () => {
    const onDismiss = vi.fn();
    render(<MemoryWarning heapUsedMB={3200} heapLimitMB={4096} usagePercent={78} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
  it('does not render close button without onDismiss', () => {
    render(<MemoryWarning heapUsedMB={3200} heapLimitMB={4096} usagePercent={78} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
