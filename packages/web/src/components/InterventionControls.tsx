import type { InterventionPoint } from '@titrate/sdk';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Intervention points the user can toggle, with labels and descriptions. */
const TOGGLEABLE_POINTS: readonly {
  readonly point: InterventionPoint;
  readonly label: string;
  readonly description: string;
}[] = [
  {
    point: 'batch-preview',
    label: 'Review each batch before sending',
    description: 'Pause before each batch to review addresses and amounts.',
  },
  {
    point: 'stuck-transaction',
    label: 'Pause on stuck transactions',
    description: 'Show options to bump gas or abort when a transaction stalls.',
  },
  {
    point: 'batch-result',
    label: 'Review batch results',
    description: 'Pause after each batch to review the transaction result.',
  },
  {
    point: 'validation-warning',
    label: 'Stop on validation warnings',
    description: 'Halt distribution when non-critical warnings are found.',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export type InterventionControlsProps = {
  readonly enabledPoints: ReadonlySet<InterventionPoint>;
  readonly onChange: (points: ReadonlySet<InterventionPoint>) => void;
};

/**
 * Checkbox controls for enabling/disabling intervention points
 * during the distribution flow.
 */
export function InterventionControls({ enabledPoints, onChange }: InterventionControlsProps) {
  const handleToggle = (point: InterventionPoint) => {
    const next = new Set(enabledPoints);
    if (next.has(point)) {
      next.delete(point);
    } else {
      next.add(point);
    }
    onChange(next);
  };

  return (
    <div className="rounded-lg bg-gray-50 p-3 ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-800 sm:p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
        Intervention Points
      </h3>
      <div className="space-y-3">
        {TOGGLEABLE_POINTS.map(({ point, label, description }) => (
          <label key={point} className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enabledPoints.has(point)}
              onChange={() => handleToggle(point)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800"
            />
            <div className="flex-1">
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {label}
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {description}
              </p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
