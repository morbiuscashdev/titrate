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

  it('renders start/end block fields for block-scan source', () => {
    render(<PipelineStepEditor stepType="source" sourceType="block-scan" params={{}} />);
    expect(screen.getByText('Start block')).toBeInTheDocument();
    expect(screen.getByText('End block')).toBeInTheDocument();
  });

  it('renders min/max nonce fields for nonce-range filter', () => {
    const onParamsChange = vi.fn();
    render(<PipelineStepEditor stepType="filter" filterType="nonce-range" params={{ minNonce: '5', maxNonce: '100' }} onParamsChange={onParamsChange} />);
    expect(screen.getByText('Min nonce')).toBeInTheDocument();
    expect(screen.getByText('Max nonce')).toBeInTheDocument();
    expect(screen.getByDisplayValue('5')).toBeInTheDocument();
    expect(screen.getByDisplayValue('100')).toBeInTheDocument();
  });

  it('renders token address field for token-recipients filter', () => {
    render(<PipelineStepEditor stepType="filter" filterType="token-recipients" params={{ tokenAddress: '0xabc' }} />);
    expect(screen.getByText('Token address')).toBeInTheDocument();
    expect(screen.getByDisplayValue('0xabc')).toBeInTheDocument();
  });

  it('renders exclusion CSV field for csv-exclusion filter', () => {
    render(<PipelineStepEditor stepType="filter" filterType="csv-exclusion" params={{ fileName: 'exclude.csv' }} />);
    expect(screen.getByText('Exclusion CSV')).toBeInTheDocument();
    expect(screen.getByDisplayValue('exclude.csv')).toBeInTheDocument();
  });

  it('renders file name field for csv source', () => {
    render(<PipelineStepEditor stepType="source" sourceType="csv" params={{ fileName: 'data.csv' }} />);
    expect(screen.getByText('File name')).toBeInTheDocument();
    expect(screen.getByDisplayValue('data.csv')).toBeInTheDocument();
  });

  it('renders start/end block fields for explorer-scan source', () => {
    render(<PipelineStepEditor stepType="source" sourceType="explorer-scan" params={{ startBlock: '100', endBlock: '200' }} />);
    expect(screen.getByText('Start block')).toBeInTheDocument();
    expect(screen.getByText('End block')).toBeInTheDocument();
    expect(screen.getByDisplayValue('100')).toBeInTheDocument();
    expect(screen.getByDisplayValue('200')).toBeInTheDocument();
  });

  it('calls onParamsChange for nonce-range min nonce field', () => {
    const onParamsChange = vi.fn();
    render(<PipelineStepEditor stepType="filter" filterType="nonce-range" params={{ minNonce: '0', maxNonce: '10' }} onParamsChange={onParamsChange} />);
    fireEvent.change(screen.getByDisplayValue('0'), { target: { value: '3' } });
    expect(onParamsChange).toHaveBeenCalledWith({ minNonce: '3', maxNonce: '10' });
  });

  it('shows no additional config message for contract-check filter', () => {
    render(<PipelineStepEditor stepType="filter" filterType="contract-check" params={{}} />);
    expect(screen.getByText('No additional configuration needed.')).toBeInTheDocument();
  });
});
