import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import {
  GasConfigPanel,
  DEFAULT_GAS_CONFIG,
  percentToFeeBumpWad,
  type GasConfigState,
} from './GasConfigPanel.js';

describe('GasConfigPanel', () => {
  const defaultProps = {
    config: DEFAULT_GAS_CONFIG,
    onChange: vi.fn(),
  };

  it('renders collapsed by default', () => {
    render(<GasConfigPanel {...defaultProps} />);
    expect(screen.getByText('Advanced Gas Settings')).toBeInTheDocument();
    expect(screen.queryByText('Gas Speed')).not.toBeInTheDocument();
  });

  it('expands on click', () => {
    render(<GasConfigPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('Advanced Gas Settings'));
    expect(screen.getByText('Gas Speed')).toBeInTheDocument();
    expect(screen.getByText('Fee Caps')).toBeInTheDocument();
    expect(screen.getByText('Cost Limit')).toBeInTheDocument();
    expect(screen.getByText('Pipelining')).toBeInTheDocument();
    expect(screen.getByText('Revalidation')).toBeInTheDocument();
  });

  it('collapses when toggled again', () => {
    render(<GasConfigPanel {...defaultProps} />);
    const toggle = screen.getByText('Advanced Gas Settings');
    fireEvent.click(toggle);
    expect(screen.getByText('Gas Speed')).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByText('Gas Speed')).not.toBeInTheDocument();
  });

  it('sets aria-expanded correctly', () => {
    render(<GasConfigPanel {...defaultProps} />);
    const toggle = screen.getByRole('button', { name: /advanced gas settings/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('fires onChange when headroom speed is toggled', () => {
    const onChange = vi.fn();
    render(<GasConfigPanel config={DEFAULT_GAS_CONFIG} onChange={onChange} />);
    fireEvent.click(screen.getByText('Advanced Gas Settings'));

    const slowButtons = screen.getAllByRole('radio', { name: 'slow' });
    // First group is headroom
    fireEvent.click(slowButtons[0]);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ headroom: 'slow' }),
    );
  });

  it('fires onChange when priority speed is toggled', () => {
    const onChange = vi.fn();
    render(<GasConfigPanel config={DEFAULT_GAS_CONFIG} onChange={onChange} />);
    fireEvent.click(screen.getByText('Advanced Gas Settings'));

    const fastButtons = screen.getAllByRole('radio', { name: 'fast' });
    // Second group is priority
    fireEvent.click(fastButtons[1]);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 'fast' }),
    );
  });

  it('fires onChange when max base fee input changes', () => {
    const onChange = vi.fn();
    render(<GasConfigPanel config={DEFAULT_GAS_CONFIG} onChange={onChange} />);
    fireEvent.click(screen.getByText('Advanced Gas Settings'));

    const input = screen.getByLabelText(/max base fee/i);
    fireEvent.change(input, { target: { value: '50' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ maxBaseFeeGwei: '50' }),
    );
  });

  it('fires onChange when max priority fee input changes', () => {
    const onChange = vi.fn();
    render(<GasConfigPanel config={DEFAULT_GAS_CONFIG} onChange={onChange} />);
    fireEvent.click(screen.getByText('Advanced Gas Settings'));

    const input = screen.getByLabelText(/max priority fee/i);
    fireEvent.change(input, { target: { value: '2' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ maxPriorityFeeGwei: '2' }),
    );
  });

  it('fires onChange when cost limit input changes', () => {
    const onChange = vi.fn();
    render(<GasConfigPanel config={DEFAULT_GAS_CONFIG} onChange={onChange} />);
    fireEvent.click(screen.getByText('Advanced Gas Settings'));

    const input = screen.getByLabelText(/cost limit/i);
    fireEvent.change(input, { target: { value: '0.5' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ maxTotalGasCostEth: '0.5' }),
    );
  });

  it('fires onChange when fee bump percent changes', () => {
    const onChange = vi.fn();
    render(<GasConfigPanel config={DEFAULT_GAS_CONFIG} onChange={onChange} />);
    fireEvent.click(screen.getByText('Advanced Gas Settings'));

    const input = screen.getByLabelText(/fee bump/i);
    fireEvent.change(input, { target: { value: '15' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ feeBumpPercent: '15' }),
    );
  });

  it('fires onChange when nonce window changes', () => {
    const onChange = vi.fn();
    render(<GasConfigPanel config={DEFAULT_GAS_CONFIG} onChange={onChange} />);
    fireEvent.click(screen.getByText('Advanced Gas Settings'));

    const input = screen.getByLabelText(/pipelining/i);
    fireEvent.change(input, { target: { value: '5' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ nonceWindow: 5 }),
    );
  });

  it('clamps nonce window to 1-10 range', () => {
    const onChange = vi.fn();
    render(<GasConfigPanel config={DEFAULT_GAS_CONFIG} onChange={onChange} />);
    fireEvent.click(screen.getByText('Advanced Gas Settings'));

    const input = screen.getByLabelText(/pipelining/i);
    fireEvent.change(input, { target: { value: '20' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ nonceWindow: 10 }),
    );

    fireEvent.change(input, { target: { value: '0' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ nonceWindow: 1 }),
    );
  });

  it('fires onChange when revalidation checkbox is toggled', () => {
    const onChange = vi.fn();
    render(<GasConfigPanel config={DEFAULT_GAS_CONFIG} onChange={onChange} />);
    fireEvent.click(screen.getByText('Advanced Gas Settings'));

    const checkbox = screen.getByLabelText(/revalidation/i);
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ enableRevalidation: true }),
    );
  });

  it('shows invalid threshold input when revalidation is enabled', () => {
    const config: GasConfigState = { ...DEFAULT_GAS_CONFIG, enableRevalidation: true };
    render(<GasConfigPanel config={config} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText('Advanced Gas Settings'));

    expect(screen.getByLabelText(/invalid threshold/i)).toBeInTheDocument();
  });

  it('hides invalid threshold input when revalidation is disabled', () => {
    render(<GasConfigPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('Advanced Gas Settings'));

    expect(screen.queryByLabelText(/invalid threshold/i)).not.toBeInTheDocument();
  });

  it('fires onChange when invalid threshold changes', () => {
    const onChange = vi.fn();
    const config: GasConfigState = { ...DEFAULT_GAS_CONFIG, enableRevalidation: true };
    render(<GasConfigPanel config={config} onChange={onChange} />);
    fireEvent.click(screen.getByText('Advanced Gas Settings'));

    const input = screen.getByLabelText(/invalid threshold/i);
    fireEvent.change(input, { target: { value: '5' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ invalidThreshold: 5 }),
    );
  });

  it('renders unit suffixes for fee inputs', () => {
    render(<GasConfigPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('Advanced Gas Settings'));

    expect(screen.getAllByText('gwei')).toHaveLength(2);
    expect(screen.getByText('ETH')).toBeInTheDocument();
    expect(screen.getByText('%')).toBeInTheDocument();
  });

  it('highlights the active headroom speed', () => {
    render(<GasConfigPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('Advanced Gas Settings'));

    const mediumButtons = screen.getAllByRole('radio', { name: 'medium' });
    // Both headroom and priority default to medium
    expect(mediumButtons[0]).toHaveAttribute('aria-checked', 'true');
    expect(mediumButtons[1]).toHaveAttribute('aria-checked', 'true');
  });

  it('renders help text for fee bump', () => {
    render(<GasConfigPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('Advanced Gas Settings'));

    expect(
      screen.getByText(/percentage increase applied when replacing a stuck transaction/i),
    ).toBeInTheDocument();
  });

  it('renders help text for pipelining', () => {
    render(<GasConfigPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('Advanced Gas Settings'));

    expect(
      screen.getByText(/submit n batches before waiting for confirmation/i),
    ).toBeInTheDocument();
  });

  it('renders help text for revalidation', () => {
    const config: GasConfigState = { ...DEFAULT_GAS_CONFIG, enableRevalidation: true };
    render(<GasConfigPanel config={config} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText('Advanced Gas Settings'));

    expect(
      screen.getByText(/re-check pending batches and replace if addresses become invalid/i),
    ).toBeInTheDocument();
  });
});

describe('percentToFeeBumpWad', () => {
  it('converts 12.5% to the default WAD value', () => {
    expect(percentToFeeBumpWad('12.5')).toBe(125_000_000_000_000_000n);
  });

  it('converts 10% correctly', () => {
    expect(percentToFeeBumpWad('10')).toBe(100_000_000_000_000_000n);
  });

  it('converts 25% correctly', () => {
    expect(percentToFeeBumpWad('25')).toBe(250_000_000_000_000_000n);
  });

  it('converts 1% correctly', () => {
    expect(percentToFeeBumpWad('1')).toBe(10_000_000_000_000_000n);
  });

  it('converts 0.5% correctly', () => {
    expect(percentToFeeBumpWad('0.5')).toBe(5_000_000_000_000_000n);
  });

  it('returns default for empty string', () => {
    expect(percentToFeeBumpWad('')).toBe(125_000_000_000_000_000n);
  });

  it('returns default for non-numeric string', () => {
    expect(percentToFeeBumpWad('abc')).toBe(125_000_000_000_000_000n);
  });

  it('returns default for zero', () => {
    expect(percentToFeeBumpWad('0')).toBe(125_000_000_000_000_000n);
  });

  it('returns default for negative value', () => {
    expect(percentToFeeBumpWad('-5')).toBe(125_000_000_000_000_000n);
  });

  it('handles 100%', () => {
    expect(percentToFeeBumpWad('100')).toBe(1_000_000_000_000_000_000n);
  });
});
