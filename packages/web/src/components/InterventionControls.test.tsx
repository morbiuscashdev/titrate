import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { InterventionControls } from './InterventionControls.js';
import type { InterventionPoint } from '@titrate/sdk';

describe('InterventionControls', () => {
  it('renders all toggleable intervention points', () => {
    const onChange = vi.fn();
    render(
      <InterventionControls
        enabledPoints={new Set<InterventionPoint>()}
        onChange={onChange}
      />,
    );

    expect(screen.getByText('Intervention Points')).toBeInTheDocument();
    expect(screen.getByText('Review each batch before sending')).toBeInTheDocument();
    expect(screen.getByText('Pause on stuck transactions')).toBeInTheDocument();
    expect(screen.getByText('Review batch results')).toBeInTheDocument();
    expect(screen.getByText('Stop on validation warnings')).toBeInTheDocument();
  });

  it('reflects enabled points as checked checkboxes', () => {
    const onChange = vi.fn();
    render(
      <InterventionControls
        enabledPoints={new Set<InterventionPoint>(['stuck-transaction', 'batch-preview'])}
        onChange={onChange}
      />,
    );

    const checkboxes = screen.getAllByRole('checkbox');
    // batch-preview and stuck-transaction should be checked (indices 0, 1)
    expect(checkboxes[0]).toBeChecked(); // batch-preview
    expect(checkboxes[1]).toBeChecked(); // stuck-transaction
    expect(checkboxes[2]).not.toBeChecked(); // batch-result
    expect(checkboxes[3]).not.toBeChecked(); // validation-warning
  });

  it('calls onChange with point added when unchecked checkbox is clicked', () => {
    const onChange = vi.fn();
    render(
      <InterventionControls
        enabledPoints={new Set<InterventionPoint>(['stuck-transaction'])}
        onChange={onChange}
      />,
    );

    // Click the batch-preview checkbox (first one)
    const checkboxes = screen.getAllByRole('checkbox');
    act(() => {
      checkboxes[0].click();
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    const newSet = onChange.mock.calls[0][0] as Set<InterventionPoint>;
    expect(newSet.has('batch-preview')).toBe(true);
    expect(newSet.has('stuck-transaction')).toBe(true);
  });

  it('calls onChange with point removed when checked checkbox is clicked', () => {
    const onChange = vi.fn();
    render(
      <InterventionControls
        enabledPoints={new Set<InterventionPoint>(['stuck-transaction', 'batch-preview'])}
        onChange={onChange}
      />,
    );

    // Click the stuck-transaction checkbox (second one) to disable it
    const checkboxes = screen.getAllByRole('checkbox');
    act(() => {
      checkboxes[1].click();
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    const newSet = onChange.mock.calls[0][0] as Set<InterventionPoint>;
    expect(newSet.has('stuck-transaction')).toBe(false);
    expect(newSet.has('batch-preview')).toBe(true);
  });
});
