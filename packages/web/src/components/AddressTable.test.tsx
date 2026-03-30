import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AddressTable } from './AddressTable.js';

const rows = [
  { address: '0xaaaa…1111', amount: '1000' },
  { address: '0xbbbb…2222', amount: '2000' },
  { address: '0xcccc…3333' },
];

describe('AddressTable', () => {
  it('renders address rows', () => {
    render(<AddressTable rows={rows} page={0} pageSize={10} totalRows={3} />);
    expect(screen.getByText('0xaaaa…1111')).toBeInTheDocument();
    expect(screen.getByText('0xbbbb…2222')).toBeInTheDocument();
  });
  it('renders amounts when showAmounts is true', () => {
    render(<AddressTable rows={rows} page={0} pageSize={10} totalRows={3} showAmounts />);
    expect(screen.getByText('1000')).toBeInTheDocument();
    expect(screen.getByText('2000')).toBeInTheDocument();
  });
  it('hides amount column when showAmounts is false', () => {
    render(<AddressTable rows={rows} page={0} pageSize={10} totalRows={3} />);
    expect(screen.queryByText('Amount')).toBeNull();
  });
  it('highlights conflicting rows', () => {
    const conflictRows = [{ address: '0xaaaa…1111', conflict: true }];
    const { container } = render(<AddressTable rows={conflictRows} page={0} pageSize={10} totalRows={1} />);
    expect(container.querySelector('.bg-red-900\\/20')).toBeInTheDocument();
  });
  it('renders pagination info', () => {
    render(<AddressTable rows={rows} page={0} pageSize={2} totalRows={3} />);
    expect(screen.getByText(/1–2 of 3/)).toBeInTheDocument();
  });
  it('calls onPageChange when next is clicked', () => {
    const onPageChange = vi.fn();
    render(<AddressTable rows={rows} page={0} pageSize={2} totalRows={5} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByText('Next'));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });
});
