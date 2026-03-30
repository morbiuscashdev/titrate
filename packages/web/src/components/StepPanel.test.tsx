import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StepPanel } from './StepPanel.js';

describe('StepPanel', () => {
  it('renders title', () => {
    render(<StepPanel title="Configure Filters"><p>content</p></StepPanel>);
    expect(screen.getByText('Configure Filters')).toBeInTheDocument();
  });
  it('renders description when provided', () => {
    render(<StepPanel title="Filters" description="Set up address filters"><p>content</p></StepPanel>);
    expect(screen.getByText('Set up address filters')).toBeInTheDocument();
  });
  it('renders children', () => {
    render(<StepPanel title="Filters"><p>child content</p></StepPanel>);
    expect(screen.getByText('child content')).toBeInTheDocument();
  });
});
