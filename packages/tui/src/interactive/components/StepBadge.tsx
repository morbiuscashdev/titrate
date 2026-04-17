import type { StepStatus } from '../step-status.js';

const ICON: Record<StepStatus, string> = {
  done: '✓',
  todo: '○',
  blocked: '✗',
  warning: '!',
};

const COLOR: Record<StepStatus, string> = {
  done: 'green',
  todo: 'gray',
  blocked: 'red',
  warning: 'yellow',
};

export function StepBadge({ status }: { status: StepStatus }) {
  return (
    <text>
      <span fg={COLOR[status]}>{ICON[status]}</span>
    </text>
  );
}
