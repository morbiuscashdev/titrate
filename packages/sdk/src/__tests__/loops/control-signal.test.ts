import { describe, it, expect } from 'vitest';
import { createControlSignal } from '../../pipeline/loops/control-signal.js';
import type { StageControl } from '../../types.js';

const ALL_RUNNING: StageControl = { scan: 'running', filter: 'running', distribute: 'running' };

describe('ControlSignal', () => {
  it('get() returns the current state', () => {
    const sig = createControlSignal(ALL_RUNNING);
    expect(sig.get()).toEqual(ALL_RUNNING);
  });

  it('waitForResume(stage) resolves immediately if the stage is running', async () => {
    const sig = createControlSignal(ALL_RUNNING);
    await expect(sig.waitForResume('scan')).resolves.toBeUndefined();
  });

  it('waitForResume blocks while paused and resolves when flipped to running', async () => {
    const sig = createControlSignal({ ...ALL_RUNNING, filter: 'paused' });
    let resolved = false;
    const promise = sig.waitForResume('filter').then(() => { resolved = true; });

    await new Promise((r) => setTimeout(r, 5));
    expect(resolved).toBe(false);

    await sig.update({ ...ALL_RUNNING, filter: 'running' });
    await promise;
    expect(resolved).toBe(true);
  });

  it('update() notifies subscribers via onChange', async () => {
    const sig = createControlSignal(ALL_RUNNING);
    const seen: StageControl[] = [];
    const off = sig.onChange((c) => seen.push(c));

    await sig.update({ ...ALL_RUNNING, scan: 'paused' });
    await sig.update(ALL_RUNNING);
    off();
    await sig.update({ ...ALL_RUNNING, distribute: 'paused' });

    expect(seen.length).toBe(2);
    expect(seen[0].scan).toBe('paused');
    expect(seen[1].scan).toBe('running');
  });
});
