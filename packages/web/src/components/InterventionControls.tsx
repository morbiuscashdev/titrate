import type { InterventionPoint } from '@titrate/sdk';
import { Card } from './ui';

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
    <Card className="sm:p-4">
      <h3 className="mb-3 font-sans text-sm font-extrabold tracking-tight text-[color:var(--fg-primary)]">
        Intervention Points
      </h3>
      <div className="space-y-3">
        {TOGGLEABLE_POINTS.map(({ point, label, description }) => (
          <label key={point} className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enabledPoints.has(point)}
              onChange={() => handleToggle(point)}
              style={{ accentColor: 'var(--color-pink-500)' }}
              className="mt-0.5 h-4 w-4"
            />
            <div className="flex-1">
              <span className="font-mono text-sm font-semibold text-[color:var(--fg-primary)]">
                {label}
              </span>
              <p className="font-mono text-xs text-[color:var(--fg-muted)]">
                {description}
              </p>
            </div>
          </label>
        ))}
      </div>
    </Card>
  );
}
