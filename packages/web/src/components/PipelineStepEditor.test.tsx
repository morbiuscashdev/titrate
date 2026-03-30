import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PipelineStepEditor } from './PipelineStepEditor.js';

describe('PipelineStepEditor', () => {
  it('renders source type selector for source steps', () => {
    render(<PipelineStepEditor stepType="source" sourceType="csv" params={{ fileName: 'addresses.csv' }} />);
    expect(screen.getByText('CSV')).toBeInTheDocument();
    expect(screen.getByText('Block Scan')).toBeInTheDocument();
    expect(screen.getByText('Explorer')).toBeInTheDocument();
  });
  it('renders CSV params for CSV source', () => {
    render(<PipelineStepEditor stepType="source" sourceType="csv" params={{ fileName: 'list.csv' }} />);
    expect(screen.getByDisplayValue('list.csv')).toBeInTheDocument();
  });
  it('renders block scan params', () => {
    render(<PipelineStepEditor stepType="source" sourceType="block-scan" params={{ startBlock: '19000000', endBlock: '19100000' }} />);
    expect(screen.getByDisplayValue('19000000')).toBeInTheDocument();
    expect(screen.getByDisplayValue('19100000')).toBeInTheDocument();
  });
  it('renders filter type selector for filter steps', () => {
    render(<PipelineStepEditor stepType="filter" filterType="min-balance" params={{ minBalance: '0.1' }} />);
    expect(screen.getByText('Min Balance')).toBeInTheDocument();
    expect(screen.getByText('Exclude Contracts')).toBeInTheDocument();
  });
  it('renders min-balance param field', () => {
    render(<PipelineStepEditor stepType="filter" filterType="min-balance" params={{ minBalance: '0.1' }} />);
    expect(screen.getByDisplayValue('0.1')).toBeInTheDocument();
  });
  it('calls onParamsChange when a field changes', () => {
    const onParamsChange = vi.fn();
    render(<PipelineStepEditor stepType="filter" filterType="min-balance" params={{ minBalance: '0.1' }} onParamsChange={onParamsChange} />);
    fireEvent.change(screen.getByDisplayValue('0.1'), { target: { value: '0.5' } });
    expect(onParamsChange).toHaveBeenCalledWith({ minBalance: '0.5' });
  });
});
