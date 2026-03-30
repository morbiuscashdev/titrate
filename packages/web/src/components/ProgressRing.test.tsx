import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ProgressRing } from './ProgressRing.js';

describe('ProgressRing', () => {
  it('displays the percentage', () => {
    render(<ProgressRing percent={75} />);
    expect(screen.getByText('75%')).toBeInTheDocument();
  });
  it('displays a label when provided', () => {
    render(<ProgressRing percent={50} label="Scanning" />);
    expect(screen.getByText('Scanning')).toBeInTheDocument();
  });
  it('clamps percent to 0-100 range', () => {
    render(<ProgressRing percent={150} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
  it('renders an SVG element', () => {
    const { container } = render(<ProgressRing percent={50} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
