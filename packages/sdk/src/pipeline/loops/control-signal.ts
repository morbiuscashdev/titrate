import type { StageControl } from '../../types.js';

type Stage = keyof StageControl;
type ChangeHandler = (next: StageControl) => void;

export type ControlSignal = {
  readonly get: () => StageControl;
  readonly update: (next: StageControl) => Promise<void>;
  readonly waitForResume: (stage: Stage) => Promise<void>;
  readonly onChange: (handler: ChangeHandler) => () => void;
};

const STAGES: readonly Stage[] = ['scan', 'filter', 'distribute'];

export function createControlSignal(initial: StageControl): ControlSignal {
  let current = initial;
  const handlers = new Set<ChangeHandler>();
  const waiters = new Map<Stage, Array<() => void>>();

  function notifyResume(stage: Stage): void {
    const list = waiters.get(stage);
    if (!list || list.length === 0) return;
    const fns = list.splice(0, list.length);
    for (const fn of fns) fn();
  }

  return {
    get: () => current,

    async update(next) {
      const prev = current;
      current = next;
      for (const h of [...handlers]) {
        try { h(current); } catch { /* swallow */ }
      }
      for (const s of STAGES) {
        if (prev[s] === 'paused' && next[s] === 'running') notifyResume(s);
      }
    },

    waitForResume(stage) {
      if (current[stage] === 'running') return Promise.resolve();
      return new Promise<void>((resolve) => {
        const list = waiters.get(stage) ?? [];
        list.push(resolve);
        waiters.set(stage, list);
      });
    },

    onChange(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
  };
}
