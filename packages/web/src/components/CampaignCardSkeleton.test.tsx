import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CampaignCardSkeleton } from './CampaignCardSkeleton.js';

describe('CampaignCardSkeleton', () => {
  it('renders skeleton elements', () => {
    render(<CampaignCardSkeleton />);
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThanOrEqual(7);
  });

  it('has the campaign card container styling', () => {
    const { container } = render(<CampaignCardSkeleton />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('rounded-lg');
    expect(wrapper.className).toContain('bg-gray-900');
    expect(wrapper.className).toContain('ring-gray-800');
  });

  it('renders a progress bar skeleton', () => {
    render(<CampaignCardSkeleton />);
    const skeletons = screen.getAllByTestId('skeleton');
    const progressBar = skeletons.find((s) => s.className.includes('w-full'));
    expect(progressBar).toBeDefined();
  });
});
