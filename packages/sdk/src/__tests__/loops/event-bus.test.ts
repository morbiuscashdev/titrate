import { describe, it, expect, vi } from 'vitest';
import { createEventBus } from '../../pipeline/loops/event-bus.js';

describe('EventBus', () => {
  it('delivers events to subscribers in registration order', () => {
    const bus = createEventBus();
    const calls: string[] = [];
    bus.on('scan-progressed', () => calls.push('a'));
    bus.on('scan-progressed', () => calls.push('b'));
    bus.emit('scan-progressed');
    expect(calls).toEqual(['a', 'b']);
  });

  it('returns a disposer that removes the handler', () => {
    const bus = createEventBus();
    const fn = vi.fn();
    const off = bus.on('filter-progressed', fn);
    bus.emit('filter-progressed');
    off();
    bus.emit('filter-progressed');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('isolates events by name', () => {
    const bus = createEventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('scan-progressed', a);
    bus.on('filter-progressed', b);
    bus.emit('scan-progressed');
    expect(a).toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('once(event) resolves on next emit', async () => {
    const bus = createEventBus();
    const promise = bus.once('scan-progressed');
    bus.emit('scan-progressed');
    await expect(promise).resolves.toBe('scan-progressed');
  });

  it('once(...events) resolves on the first one to fire', async () => {
    const bus = createEventBus();
    const promise = bus.once('scan-progressed', 'filter-progressed');
    bus.emit('filter-progressed');
    await expect(promise).resolves.toBe('filter-progressed');
  });

  it('handlers throwing do not stop later handlers', () => {
    const bus = createEventBus();
    const later = vi.fn();
    bus.on('scan-progressed', () => { throw new Error('boom'); });
    bus.on('scan-progressed', later);
    expect(() => bus.emit('scan-progressed')).not.toThrow();
    expect(later).toHaveBeenCalled();
  });
});
