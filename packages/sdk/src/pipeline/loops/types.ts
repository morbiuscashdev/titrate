export type LoopEvent =
  | 'tick-started'
  | 'tick-completed'
  | 'scan-progressed'
  | 'filter-progressed'
  | 'distribute-progressed'
  | 'pipeline-changed'
  | 'errored'
  | 'completed'
  | 'reconciliation-complete';

export type LoopStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'stopping'
  | 'errored'
  | 'completed';

export type LoopHandle = {
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
  readonly status: () => LoopStatus;
  readonly on: (event: LoopEvent, handler: () => void) => () => void;
};
