import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Skeleton } from './Skeleton.js';

describe('Skeleton', () => {
  it('renders with default classes', () => {
    render(<Skeleton />);
    const element = screen.getByTestId('skeleton');
    expect(element).toBeInTheDocument();
    expect(element.className).toContain('animate-pulse');
    expect(element.className).toContain('rounded');
    expect(element.className).toContain('bg-gray-800');
  });

  it('appends custom className', () => {
    render(<Skeleton className="h-4 w-32" />);
    const element = screen.getByTestId('skeleton');
    expect(element.className).toContain('h-4');
    expect(element.className).toContain('w-32');
  });

  it('has animate-pulse for loading animation', () => {
    render(<Skeleton />);
    const element = screen.getByTestId('skeleton');
    expect(element.className).toContain('animate-pulse');
  });
});
