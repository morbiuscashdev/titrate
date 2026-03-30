import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AppShell } from './AppShell.js';
import type { TimelineStep } from './TimelineRail.js';

const steps: TimelineStep[] = [
  { id: 'campaign', label: 'Campaign', status: 'complete' },
  { id: 'addresses', label: 'Addresses', status: 'active' },
];

describe('AppShell', () => {
  it('renders the timeline rail', () => {
    render(<AppShell steps={steps} activeStepId="addresses"><p>content</p></AppShell>);
    expect(screen.getByText('Campaign')).toBeInTheDocument();
    expect(screen.getByText('Addresses')).toBeInTheDocument();
  });
  it('renders children in the content area', () => {
    render(<AppShell steps={steps} activeStepId="addresses"><p>panel content</p></AppShell>);
    expect(screen.getByText('panel content')).toBeInTheDocument();
  });
});
