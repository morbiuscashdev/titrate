import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TimelineRail } from './TimelineRail.js';
import type { TimelineStep } from './TimelineRail.js';

const steps: TimelineStep[] = [
  { id: 'campaign', label: 'Campaign', status: 'complete', summary: 'Base · USDC' },
  { id: 'addresses', label: 'Addresses', status: 'active' },
  { id: 'filters', label: 'Filters', status: 'locked' },
];

describe('TimelineRail', () => {
  it('renders all step labels', () => {
    render(<TimelineRail steps={steps} />);
    expect(screen.getByText('Campaign')).toBeInTheDocument();
    expect(screen.getByText('Addresses')).toBeInTheDocument();
    expect(screen.getByText('Filters')).toBeInTheDocument();
  });
  it('renders summary for complete steps', () => {
    render(<TimelineRail steps={steps} />);
    expect(screen.getByText('Base · USDC')).toBeInTheDocument();
  });
  it('calls onStepClick with step ID for non-locked steps', () => {
    const onClick = vi.fn();
    render(<TimelineRail steps={steps} onStepClick={onClick} />);
    fireEvent.click(screen.getByText('Campaign'));
    expect(onClick).toHaveBeenCalledWith('campaign');
  });
  it('does not call onStepClick for locked steps', () => {
    const onClick = vi.fn();
    render(<TimelineRail steps={steps} onStepClick={onClick} />);
    fireEvent.click(screen.getByText('Filters'));
    expect(onClick).not.toHaveBeenCalled();
  });
});
