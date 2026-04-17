import type { LoopEvent } from './types.js';

type Handler = () => void;

export type EventBus = {
  readonly on: (event: LoopEvent, handler: Handler) => () => void;
  readonly emit: (event: LoopEvent) => void;
  readonly once: (...events: LoopEvent[]) => Promise<LoopEvent>;
};

export function createEventBus(): EventBus {
  const handlers = new Map<LoopEvent, Handler[]>();

  const bus: EventBus = {
    on(event, handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return () => {
        const current = handlers.get(event);
        if (!current) return;
        const idx = current.indexOf(handler);
        if (idx >= 0) current.splice(idx, 1);
      };
    },

    emit(event) {
      const list = handlers.get(event);
      if (!list) return;
      for (const h of [...list]) {
        try { h(); } catch { /* emitter does not block on handler errors */ }
      }
    },

    once(...events) {
      if (events.length === 0) return Promise.resolve('tick-completed' as LoopEvent);
      return new Promise<LoopEvent>((resolve) => {
        const disposers: Array<() => void> = [];
        for (const e of events) {
          const off = bus.on(e, () => {
            for (const d of disposers) d();
            resolve(e);
          });
          disposers.push(off);
        }
      });
    },
  };

  return bus;
}
