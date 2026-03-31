import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createExplorerBus, getOrCreateBus, destroyAllBuses } from '../../explorer/bus.js';

function mockFetch(responses: Array<{ status: string; message: string; result: unknown }>): typeof fetch {
  let callIndex = 0;
  return vi.fn().mockImplementation(() => {
    const body = responses[Math.min(callIndex++, responses.length - 1)];
    return Promise.resolve({
      json: () => Promise.resolve(body),
    });
  }) as unknown as typeof fetch;
}

describe('createExplorerBus', () => {
  it('extracts domain from URL', () => {
    const bus = createExplorerBus('https://api.etherscan.io/api', {
      apiKey: 'test',
      fetchFn: mockFetch([]),
    });
    expect(bus.domain).toBe('api.etherscan.io');
    bus.destroy();
  });

  it('starts unthrottled', () => {
    const bus = createExplorerBus('https://api.etherscan.io/api', {
      apiKey: 'test',
      fetchFn: mockFetch([]),
    });
    expect(bus.getCurrentRate()).toBeNull();
    bus.destroy();
  });

  it('returns parsed result on successful request', async () => {
    const fetchFn = mockFetch([
      { status: '1', message: 'OK', result: [{ blockNumber: '100' }] },
    ]);
    const bus = createExplorerBus('https://api.etherscan.io/api', { apiKey: 'key', fetchFn });
    const result = await bus.request<unknown[]>({ module: 'account', action: 'txlist' });
    expect(result).toEqual([{ blockNumber: '100' }]);
    bus.destroy();
  });

  it('includes apikey in query string', async () => {
    const fetchFn = mockFetch([
      { status: '1', message: 'OK', result: [] },
    ]);
    const bus = createExplorerBus('https://api.etherscan.io/api', { apiKey: 'MY_KEY', fetchFn });
    await bus.request({ module: 'test' });
    expect(fetchFn).toHaveBeenCalledWith(expect.stringContaining('apikey=MY_KEY'));
    bus.destroy();
  });

  it('sets rate on first 429', async () => {
    const fetchFn = mockFetch([
      { status: '0', message: 'NOTOK', result: 'Max rate limit reached' },
      { status: '1', message: 'OK', result: [] },
    ]);
    const bus = createExplorerBus('https://api.etherscan.io/api', { apiKey: 'key', fetchFn });
    await bus.request({ module: 'test' });
    const rate = bus.getCurrentRate();
    expect(rate).not.toBeNull();
    expect(rate!).toBeGreaterThan(0);
    bus.destroy();
  });

  it('reduces rate by 5% on subsequent 429s', async () => {
    vi.useFakeTimers();

    const responses = [
      { status: '0', message: 'NOTOK', result: 'Max rate limit reached' },
      { status: '1', message: 'OK', result: [] },
      { status: '0', message: 'NOTOK', result: 'Max rate limit reached' },
      { status: '1', message: 'OK', result: [] },
    ];
    const bus = createExplorerBus('https://api.etherscan.io/api', {
      apiKey: 'key',
      fetchFn: mockFetch(responses),
    });

    const first = bus.request({ module: 'test' });
    await vi.runAllTimersAsync();
    await first;
    const firstRate = bus.getCurrentRate()!;

    const second = bus.request({ module: 'test' });
    await vi.runAllTimersAsync();
    await second;
    const secondRate = bus.getCurrentRate()!;

    expect(secondRate).toBeLessThan(firstRate);
    expect(secondRate).toBeCloseTo(firstRate * 0.95, 1);
    bus.destroy();
    vi.useRealTimers();
  });

  it('never drops below 1 req/sec', async () => {
    vi.useFakeTimers();

    const responses: Array<{ status: string; message: string; result: unknown }> = [];
    for (let i = 0; i < 100; i++) {
      responses.push({ status: '0', message: 'NOTOK', result: 'Max rate limit reached' });
    }
    responses.push({ status: '1', message: 'OK', result: [] });

    const bus = createExplorerBus('https://api.etherscan.io/api', {
      apiKey: 'key',
      fetchFn: mockFetch(responses),
    });

    const requests: Array<Promise<unknown>> = [];
    for (let i = 0; i < 50; i++) {
      requests.push(bus.request({ module: 'test' }).catch(() => {}));
      await vi.runAllTimersAsync();
    }
    await Promise.allSettled(requests);

    const rate = bus.getCurrentRate();
    expect(rate).toBeGreaterThanOrEqual(1);
    bus.destroy();
    vi.useRealTimers();
  });

  it('throws ExplorerApiError on non-rate-limit API errors', async () => {
    const bus = createExplorerBus('https://api.etherscan.io/api', {
      apiKey: 'key',
      fetchFn: mockFetch([
        { status: '0', message: 'NOTOK', result: 'Invalid API key' },
      ]),
    });
    await expect(bus.request({ module: 'test' })).rejects.toThrow('Invalid API key');
    bus.destroy();
  });
});

describe('getOrCreateBus', () => {
  afterEach(() => destroyAllBuses());

  it('returns same bus for same domain', () => {
    const bus1 = getOrCreateBus('https://api.etherscan.io/api', 'key1');
    const bus2 = getOrCreateBus('https://api.etherscan.io/api', 'key1');
    expect(bus1).toBe(bus2);
  });

  it('returns different buses for different domains', () => {
    const bus1 = getOrCreateBus('https://api.etherscan.io/api', 'key1');
    const bus2 = getOrCreateBus('https://api.basescan.org/api', 'key2');
    expect(bus1).not.toBe(bus2);
    expect(bus1.domain).toBe('api.etherscan.io');
    expect(bus2.domain).toBe('api.basescan.org');
  });
});

describe('destroyAllBuses', () => {
  it('clears the registry', () => {
    const bus1 = getOrCreateBus('https://api.etherscan.io/api', 'key1');
    destroyAllBuses();
    const bus2 = getOrCreateBus('https://api.etherscan.io/api', 'key1');
    expect(bus1).not.toBe(bus2);
  });
});
