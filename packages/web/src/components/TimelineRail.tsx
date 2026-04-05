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
  complete: 'bg-green-500',
  active: 'bg-blue-500 ring-4 ring-blue-500/20',
  locked: 'bg-gray-400 dark:bg-gray-600',
};

export function TimelineRail({ steps, onStepClick }: TimelineRailProps) {
  return (
    <nav aria-label="Campaign steps" className="flex flex-col gap-0">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-start gap-3">
          <div className="flex flex-col items-center">
            <div className={`h-3 w-3 rounded-full shrink-0 mt-1 ${dotStyles[step.status]}`} />
            {i < steps.length - 1 && <div className="w-px flex-1 min-h-8 bg-gray-300 dark:bg-gray-700" />}
          </div>
          <button
            type="button"
            disabled={step.status === 'locked'}
            onClick={() => step.status !== 'locked' && onStepClick?.(step.id)}
            className={`text-left pb-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-sm ${
              step.status === 'locked' ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed' : 'text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white cursor-pointer'
            } ${step.status === 'active' ? 'font-semibold' : ''}`}
          >
            <span className="text-sm">{step.label}</span>
            {step.summary && step.status === 'complete' && (
              <span className="block text-xs text-gray-400 dark:text-gray-500 mt-0.5">{step.summary}</span>
            )}
          </button>
        </div>
      ))}
    </nav>
  );
}
