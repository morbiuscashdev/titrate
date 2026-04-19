export type TimelineStep = {
  readonly id: string;
  readonly label: string;
  readonly status: 'complete' | 'active' | 'locked';
  readonly summary?: string;
};

export type TimelineRailProps = {
  readonly steps: readonly TimelineStep[];
  readonly onStepClick?: (stepId: string) => void;
};

const dotStyles: Record<TimelineStep['status'], string> = {
  complete: 'bg-[color:var(--color-pink-500)] border-[color:var(--color-pink-500)]',
  active: 'bg-[color:var(--bg-page)] border-[color:var(--color-pink-500)] ring-4 ring-[color:var(--color-pink-500)]/20',
  locked: 'bg-transparent border-[color:var(--edge)]/40',
};

export function TimelineRail({ steps, onStepClick }: TimelineRailProps) {
  return (
    <nav aria-label="Campaign steps" className="flex flex-col gap-0">
      {steps.map((step, i) => {
        const isLocked = step.status === 'locked';
        const isActive = step.status === 'active';
        return (
          <div key={step.id} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div
                data-status={step.status}
                className={`h-3 w-3 rounded-full border-2 shrink-0 mt-1.5 ${dotStyles[step.status]}`}
              />
              {i < steps.length - 1 && <div className="w-px flex-1 min-h-8 bg-[color:var(--edge)]/30" />}
            </div>
            <button
              type="button"
              disabled={isLocked}
              onClick={() => !isLocked && onStepClick?.(step.id)}
              className={`text-left pb-6 font-mono text-sm focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-[1px] focus-visible:outline-[color:var(--color-info)] rounded-sm ${
                isLocked
                  ? 'text-[color:var(--fg-muted)]/60 cursor-not-allowed'
                  : 'text-[color:var(--fg-primary)] hover:text-[color:var(--color-pink-600)] cursor-pointer'
              } ${isActive ? 'font-bold' : ''}`}
            >
              <span>{step.label}</span>
              {step.summary && step.status === 'complete' && (
                <span className="block text-xs text-[color:var(--fg-muted)] mt-0.5 font-mono">{step.summary}</span>
              )}
            </button>
          </div>
        );
      })}
    </nav>
  );
}
