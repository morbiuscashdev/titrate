import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createRequestBus,
  getOrCreateBus,
  destroyBus,
  destroyAllBuses,
} from '../request-bus.js';

describe('createRequestBus', () => {
  it('stores the key', () => {
    const bus = createRequestBus('test-key');
    expect(bus.key).toBe('test-key');
    bus.destroy();
  });

  it('starts unthrottled', () => {
    const bus = createRequestBus('test');
    expect(bus.getCurrentRate()).toBeNull();
    bus.destroy();
  });

  it('executes fn immediately when unthrottled', async () => {
    const bus = createRequestBus('test');
    const fn = vi.fn().mockResolvedValue(42);
    const result = await bus.execute(fn);
    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledOnce();
    bus.destroy();
  });

  it('sets rate to 80% of burst on first rate limit error', async () => {
    let callCount = 0;
    const bus = createRequestBus('test', {
      isRateLimitError: (err) => (err as Error).message === 'rate limited',
    });

    const fn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error('rate limited'));
      return Promise.resolve('ok');
    });

    const result = await bus.execute(fn);
    expect(result).toBe('ok');
    const rate = bus.getCurrentRate();
    expect(rate).not.toBeNull();
    expect(rate!).toBeGreaterThan(0);
    bus.destroy();
  });

  it('reduces rate by 5% on subsequent rate limit errors', async () => {
    let callCount = 0;
    const bus = createRequestBus('test', {
      isRateLimitError: (err) => (err as Error).message === 'rate limited',
    });

    // First call: rate limit → sets initial rate
    // Second call: succeeds
    // Third call: rate limit → reduces by 5%
    // Fourth call: succeeds
    const fn1 = vi.fn()
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockResolvedValueOnce('ok');
    await bus.execute(fn1);
    const firstRate = bus.getCurrentRate()!;

    const fn2 = vi.fn()
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockResolvedValueOnce('ok');
    await bus.execute(fn2);
    const secondRate = bus.getCurrentRate()!;

    expect(secondRate).toBeLessThan(firstRate);
    expect(secondRate).toBeCloseTo(firstRate * 0.95, 1);
    bus.destroy();
  });

  it('throws non-rate-limit errors without retry', async () => {
    const bus = createRequestBus('test', {
      isRateLimitError: () => false,
    });
    const fn = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(bus.execute(fn)).rejects.toThrow('network down');
    expect(fn).toHaveBeenCalledOnce();
    bus.destroy();
  });

  it('deduplicates in-flight requests with same requestKey', async () => {
    const bus = createRequestBus('test');
    let resolvePromise: (v: string) => void;
    const slowFn = vi.fn().mockReturnValue(
      new Promise<string>((resolve) => { resolvePromise = resolve; }),
    );

    const p1 = bus.execute(slowFn, 'same-key');
    const p2 = bus.execute(slowFn, 'same-key');

    expect(slowFn).toHaveBeenCalledOnce(); // only one execution

    resolvePromise!('result');
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe('result');
    expect(r2).toBe('result');
    bus.destroy();
  });

  it('does not deduplicate different requestKeys', async () => {
    const bus = createRequestBus('test');
    const fn = vi.fn().mockResolvedValue('ok');

    await Promise.all([
      bus.execute(fn, 'key-a'),
      bus.execute(fn, 'key-b'),
    ]);

    expect(fn).toHaveBeenCalledTimes(2);
    bus.destroy();
  });

  it('removes dedup entry after settlement', async () => {
    const bus = createRequestBus('test');
    const fn = vi.fn().mockResolvedValue('ok');

    await bus.execute(fn, 'key');
    // Second call with same key should execute again (first settled)
    await bus.execute(fn, 'key');

    expect(fn).toHaveBeenCalledTimes(2);
    bus.destroy();
  });

  it('does not deduplicate when no requestKey provided', async () => {
    const bus = createRequestBus('test');
    const fn = vi.fn().mockResolvedValue('ok');

    await Promise.all([bus.execute(fn), bus.execute(fn)]);
    expect(fn).toHaveBeenCalledTimes(2);
    bus.destroy();
  });
});

describe('getOrCreateBus', () => {
  afterEach(() => destroyAllBuses());

  it('returns same bus for same key', () => {
    const bus1 = getOrCreateBus('shared');
    const bus2 = getOrCreateBus('shared');
    expect(bus1).toBe(bus2);
  });

  it('returns different buses for different keys', () => {
    const bus1 = getOrCreateBus('alpha');
    const bus2 = getOrCreateBus('beta');
    expect(bus1).not.toBe(bus2);
    expect(bus1.key).toBe('alpha');
    expect(bus2.key).toBe('beta');
  });

  it('passes options to new bus', async () => {
    const bus = getOrCreateBus('test', {
      isRateLimitError: (err) => (err as Error).message === 'rl',
    });
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('rl'))
      .mockResolvedValueOnce('ok');
    await bus.execute(fn);
    expect(bus.getCurrentRate()).not.toBeNull();
  });
});

describe('destroyBus', () => {
  afterEach(() => destroyAllBuses());

  it('removes specific bus from registry', () => {
    const bus1 = getOrCreateBus('target');
    destroyBus('target');
    const bus2 = getOrCreateBus('target');
    expect(bus1).not.toBe(bus2);
  });
});

describe('destroyAllBuses', () => {
  it('clears entire registry', () => {
    const bus1 = getOrCreateBus('a');
    const bus2 = getOrCreateBus('b');
    destroyAllBuses();
    const bus3 = getOrCreateBus('a');
    expect(bus1).not.toBe(bus3);
  });
});
