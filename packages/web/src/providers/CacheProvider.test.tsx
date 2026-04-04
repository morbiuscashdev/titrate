import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Cache, CacheStore } from '@titrate/sdk';

const mockStore: CacheStore = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  clear: vi.fn(),
};

const mockCache: Cache = {
  get: vi.fn(),
  getOrCompute: vi.fn(),
  set: vi.fn(),
  invalidate: vi.fn(),
  clear: vi.fn(),
};

vi.mock('@titrate/storage-idb', () => ({
  createIDBCacheStore: vi.fn(),
}));

vi.mock('@titrate/sdk', () => ({
  createCache: vi.fn(),
}));

import { CacheProvider, useCache } from './CacheProvider.js';
import { createIDBCacheStore } from '@titrate/storage-idb';
import { createCache } from '@titrate/sdk';

const mockedCreateIDBCacheStore = vi.mocked(createIDBCacheStore);
const mockedCreateCache = vi.mocked(createCache);

beforeEach(() => {
  vi.clearAllMocks();
  mockedCreateIDBCacheStore.mockResolvedValue(mockStore);
  mockedCreateCache.mockReturnValue(mockCache);
});

describe('CacheProvider', () => {
  it('renders children', async () => {
    render(
      <CacheProvider>
        <div data-testid="child">hello</div>
      </CacheProvider>,
    );

    expect(screen.getByTestId('child')).toHaveTextContent('hello');
  });

  it('provides null cache before initialization completes', () => {
    // Never resolve the promise so initialization stays pending
    mockedCreateIDBCacheStore.mockReturnValue(new Promise(() => {}));

    function CacheConsumer() {
      const { cache } = useCache();
      return <div data-testid="cache-value">{cache === null ? 'null' : 'ready'}</div>;
    }

    render(
      <CacheProvider>
        <CacheConsumer />
      </CacheProvider>,
    );

    expect(screen.getByTestId('cache-value')).toHaveTextContent('null');
  });

  it('provides cache after initialization completes', async () => {
    function CacheConsumer() {
      const { cache } = useCache();
      return <div data-testid="cache-value">{cache === null ? 'null' : 'ready'}</div>;
    }

    render(
      <CacheProvider>
        <CacheConsumer />
      </CacheProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('cache-value')).toHaveTextContent('ready');
    });

    expect(mockedCreateIDBCacheStore).toHaveBeenCalledOnce();
    expect(mockedCreateCache).toHaveBeenCalledWith({ persistentStore: mockStore });
  });

  it('logs error when IDB cache store creation fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('IDB unavailable');
    mockedCreateIDBCacheStore.mockRejectedValue(error);

    render(
      <CacheProvider>
        <div>child</div>
      </CacheProvider>,
    );

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to initialize IDB cache store:',
        error,
      );
    });

    consoleSpy.mockRestore();
  });
});

describe('useCache', () => {
  it('throws when called outside CacheProvider', () => {
    expect(() => {
      renderHook(() => useCache());
    }).toThrow('useCache must be used within a CacheProvider');
  });

  it('returns context when called inside CacheProvider', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CacheProvider>{children}</CacheProvider>
    );

    const { result } = renderHook(() => useCache(), { wrapper });
    expect(result.current).toHaveProperty('cache');
  });
});
