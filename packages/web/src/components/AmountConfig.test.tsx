import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AmountConfig } from './AmountConfig.js';

describe('AmountConfig', () => {
  it('renders mode toggle', () => {
    render(<AmountConfig mode="uniform" format="integer" uniformAmount="" />);
    expect(screen.getByText('Uniform')).toBeInTheDocument();
    expect(screen.getByText('Variable')).toBeInTheDocument();
  });
  it('renders amount input for uniform mode', () => {
    render(<AmountConfig mode="uniform" format="integer" uniformAmount="1000" />);
    expect(screen.getByDisplayValue('1000')).toBeInTheDocument();
  });
  it('hides amount input for variable mode', () => {
    render(<AmountConfig mode="variable" format="integer" uniformAmount="" />);
    expect(screen.queryByPlaceholderText(/amount/i)).toBeNull();
  });
  it('calls onModeChange', () => {
    const onModeChange = vi.fn();
    render(<AmountConfig mode="uniform" format="integer" uniformAmount="" onModeChange={onModeChange} />);
    fireEvent.click(screen.getByText('Variable'));
    expect(onModeChange).toHaveBeenCalledWith('variable');
  });
  it('calls onAmountChange', () => {
    const onAmountChange = vi.fn();
    render(<AmountConfig mode="uniform" format="integer" uniformAmount="" onAmountChange={onAmountChange} />);
    fireEvent.change(screen.getByPlaceholderText(/amount/i), { target: { value: '500' } });
    expect(onAmountChange).toHaveBeenCalledWith('500');
  });
  it('calls onFormatChange when format toggle is clicked', () => {
    const onFormatChange = vi.fn();
    render(<AmountConfig mode="uniform" format="integer" uniformAmount="" onFormatChange={onFormatChange} />);
    fireEvent.click(screen.getByText('Decimal'));
    expect(onFormatChange).toHaveBeenCalledWith('decimal');
  });
  it('shows variable mode message instead of input', () => {
    render(<AmountConfig mode="variable" format="integer" uniformAmount="" />);
    expect(screen.getByText(/amounts will be read from the csv file/i)).toBeInTheDocument();
  });
});
