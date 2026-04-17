import { describe, it, expectTypeOf } from 'vitest';
import type { LoopEvent, LoopStatus, LoopHandle } from '../../pipeline/loops/types.js';

describe('LoopEvent', () => {
  it('enumerates the spec-defined events', () => {
    expectTypeOf<LoopEvent>().toEqualTypeOf<
      | 'tick-started'
      | 'tick-completed'
      | 'scan-progressed'
      | 'filter-progressed'
      | 'distribute-progressed'
      | 'pipeline-changed'
      | 'errored'
      | 'completed'
      | 'reconciliation-complete'
    >();
  });
});

describe('LoopStatus', () => {
  it('enumerates the spec-defined statuses', () => {
    expectTypeOf<LoopStatus>().toEqualTypeOf<
      'idle' | 'running' | 'paused' | 'stopping' | 'errored' | 'completed'
    >();
  });
});

describe('LoopHandle', () => {
  it('has start / stop / status / on', () => {
    type K = keyof LoopHandle;
    expectTypeOf<K>().toEqualTypeOf<'start' | 'stop' | 'status' | 'on'>();
  });
});
