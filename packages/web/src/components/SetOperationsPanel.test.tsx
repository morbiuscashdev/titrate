import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SetOperationsPanel } from './SetOperationsPanel.js';

const mockGetByCampaign = vi.fn();
const mockGetBySet = vi.fn();
const mockPutAddressSet = vi.fn().mockResolvedValue(undefined);
const mockPutBatch = vi.fn().mockResolvedValue(undefined);

vi.mock('../providers/CampaignProvider.js', () => ({
  useCampaign: () => ({
    activeCampaign: { id: 'campaign-1' },
  }),
}));

vi.mock('../providers/StorageProvider.js', () => ({
  useStorage: () => ({
    storage: {
      addressSets: { getByCampaign: mockGetByCampaign, put: mockPutAddressSet },
      addresses: { getBySet: mockGetBySet, putBatch: mockPutBatch },
    },
  }),
}));

vi.mock('@titrate/sdk', () => ({
  union: (a: string[], b: string[]) => [...new Set([...a, ...b])],
  intersect: (a: string[], b: string[]) => a.filter((x) => b.includes(x)),
  difference: (a: string[], b: string[]) => a.filter((x) => !b.includes(x)),
  symmetricDifference: (a: string[], b: string[]) => {
    const setB = new Set(b);
    const setA = new Set(a);
    return [...a.filter((x) => !setB.has(x)), ...b.filter((x) => !setA.has(x))];
  },
}));

vi.stubGlobal('crypto', {
  ...globalThis.crypto,
  randomUUID: () => 'derived-set-1',
});

describe('SetOperationsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetByCampaign.mockResolvedValue([
      { id: 'set-1', name: 'Source A', type: 'source', addressCount: 3 },
      { id: 'set-2', name: 'Source B', type: 'source', addressCount: 2 },
    ]);
    mockGetBySet.mockImplementation((setId: string) => {
      if (setId === 'set-1') {
        return Promise.resolve([
          { address: '0x1111111111111111111111111111111111111111' },
          { address: '0x2222222222222222222222222222222222222222' },
          { address: '0x3333333333333333333333333333333333333333' },
        ]);
      }
      return Promise.resolve([
        { address: '0x2222222222222222222222222222222222222222' },
        { address: '0x4444444444444444444444444444444444444444' },
      ]);
    });
  });

  it('renders when at least 2 sets exist', async () => {
    render(<SetOperationsPanel />);
    await waitFor(() => {
      expect(screen.getByText('Set Operations')).toBeInTheDocument();
    });
  });

  it('does not render when fewer than 2 sets exist', async () => {
    mockGetByCampaign.mockResolvedValue([
      { id: 'set-1', name: 'Only One', type: 'source', addressCount: 1 },
    ]);
    render(<SetOperationsPanel />);
    // Give time for the effect to run
    await waitFor(() => {
      expect(mockGetByCampaign).toHaveBeenCalled();
    });
    expect(screen.queryByText('Set Operations')).not.toBeInTheDocument();
  });

  it('shows set selectors and operation buttons', async () => {
    render(<SetOperationsPanel />);
    await waitFor(() => {
      expect(screen.getByText('Set A')).toBeInTheDocument();
    });
    expect(screen.getByText('Set B')).toBeInTheDocument();
    expect(screen.getByText('Union (A + B)')).toBeInTheDocument();
    expect(screen.getByText('Intersect (A \u2229 B)')).toBeInTheDocument();
    expect(screen.getByText('Difference (A - B)')).toBeInTheDocument();
  });

  it('computes union and saves result', async () => {
    render(<SetOperationsPanel />);
    await waitFor(() => {
      expect(screen.getByText('Set Operations')).toBeInTheDocument();
    });

    // Select sets
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'set-1' } });
    fireEvent.change(selects[1], { target: { value: 'set-2' } });

    // Click apply (union is default)
    fireEvent.click(screen.getByText('Apply'));

    await waitFor(() => {
      expect(screen.getByText(/addresses in result/)).toBeInTheDocument();
    });

    expect(mockPutAddressSet).toHaveBeenCalled();
    expect(mockPutBatch).toHaveBeenCalled();
  });

  it('computes intersection', async () => {
    render(<SetOperationsPanel />);
    await waitFor(() => {
      expect(screen.getByText('Set Operations')).toBeInTheDocument();
    });

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'set-1' } });
    fireEvent.change(selects[1], { target: { value: 'set-2' } });
    fireEvent.click(screen.getByText('Intersect (A \u2229 B)'));
    fireEvent.click(screen.getByText('Apply'));

    await waitFor(() => {
      expect(screen.getByText(/addresses in result/)).toBeInTheDocument();
    });
  });

  it('disables apply when no sets selected', async () => {
    render(<SetOperationsPanel />);
    await waitFor(() => {
      expect(screen.getByText('Set Operations')).toBeInTheDocument();
    });
    expect(screen.getByText('Apply')).toBeDisabled();
  });
});
