import { useIntervention } from '../providers/InterventionProvider.js';
import { createSpotCheck } from '@titrate/sdk';
import type { InterventionContext } from '@titrate/sdk';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Human-readable title for each intervention point. */
function getTitle(point: InterventionContext['point']): string {
  switch (point) {
    case 'batch-preview':
      return 'Batch Preview';
    case 'batch-result':
      return 'Batch Result';
    case 'stuck-transaction':
      return 'Stuck Transaction';
    case 'validation-warning':
      return 'Validation Warnings';
    case 'validation-error':
      return 'Validation Errors';
    case 'address-review':
      return 'Address Review';
    case 'filter-review':
      return 'Filter Review';
    case 'amount-review':
      return 'Amount Review';
  }
}

/** Truncate a hex string to 0x1234...abcd format. */
function truncateHash(hash: string): string {
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Point-specific content renderers
// ---------------------------------------------------------------------------

function BatchPreviewContent({ context }: { readonly context: InterventionContext }) {
  const addressCount = context.addresses?.length ?? 0;
  const totalTokens = context.amounts
    ? context.amounts.reduce((sum, a) => sum + a, 0n)
    : 0n;

  const spotCheck = context.addresses && context.addresses.length > 0
    ? createSpotCheck(
        context.addresses,
        (context.metadata?.explorerBaseUrl as string) ?? 'https://etherscan.io',
        {
          sampleSize: Math.min(5, context.addresses.length),
          amounts: context.amounts,
        },
      )
    : null;

  return (
    <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
      <p>
        Batch #{context.batchIndex ?? 0}: {addressCount} address{addressCount !== 1 ? 'es' : ''},{' '}
        {totalTokens.toString()} tokens total.
      </p>
      {spotCheck && spotCheck.samples.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            Spot Check ({spotCheck.sampleSize} of {spotCheck.totalCount})
          </p>
          <div className="space-y-1">
            {spotCheck.samples.map((sample) => (
              <div key={sample.index} className="flex items-center justify-between text-xs">
                <a
                  href={sample.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
                >
                  {sample.address.slice(0, 10)}...{sample.address.slice(-6)}
                </a>
                {sample.amount !== undefined && (
                  <span className="text-gray-500 dark:text-gray-400">
                    {sample.amount.toString()} tokens
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BatchResultContent({ context }: { readonly context: InterventionContext }) {
  return (
    <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
      <p>Batch #{context.batchIndex ?? 0} confirmed.</p>
      {context.txHash && (
        <p>
          TX:{' '}
          <code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-800">
            {truncateHash(context.txHash)}
          </code>
        </p>
      )}
    </div>
  );
}

function StuckTransactionContent({ context }: { readonly context: InterventionContext }) {
  return (
    <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
      <p>
        Transaction{' '}
        {context.txHash ? (
          <code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-800">
            {truncateHash(context.txHash)}
          </code>
        ) : (
          ''
        )}{' '}
        appears to be stuck.
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        You can bump gas to speed up the transaction, wait for it to confirm, or abort.
      </p>
    </div>
  );
}

function ValidationWarningContent({ context }: { readonly context: InterventionContext }) {
  const issues = context.issues ?? [];
  return (
    <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
      <p>{issues.length} warning{issues.length !== 1 ? 's' : ''} found:</p>
      <ul className="ml-4 list-disc space-y-1 text-xs text-yellow-600 dark:text-yellow-400">
        {issues.map((issue, index) => (
          <li key={index}>{issue.message}</li>
        ))}
      </ul>
    </div>
  );
}

function ValidationErrorContent({ context }: { readonly context: InterventionContext }) {
  const issues = context.issues ?? [];
  return (
    <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
      <p>{issues.length} error{issues.length !== 1 ? 's' : ''} found:</p>
      <ul className="ml-4 list-disc space-y-1 text-xs text-red-500 dark:text-red-400">
        {issues.map((issue, index) => (
          <li key={index}>{issue.message}</li>
        ))}
      </ul>
    </div>
  );
}

function DefaultContent({ context }: { readonly context: InterventionContext }) {
  return (
    <div className="text-sm text-gray-700 dark:text-gray-300">
      <p>Intervention at <strong>{context.point}</strong>.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content dispatcher
// ---------------------------------------------------------------------------

function InterventionContent({ context }: { readonly context: InterventionContext }) {
  switch (context.point) {
    case 'batch-preview':
      return <BatchPreviewContent context={context} />;
    case 'batch-result':
      return <BatchResultContent context={context} />;
    case 'stuck-transaction':
      return <StuckTransactionContent context={context} />;
    case 'validation-warning':
      return <ValidationWarningContent context={context} />;
    case 'validation-error':
      return <ValidationErrorContent context={context} />;
    default:
      return <DefaultContent context={context} />;
  }
}

// ---------------------------------------------------------------------------
// Action buttons per intervention point
// ---------------------------------------------------------------------------

function InterventionActions({ point }: { readonly point: InterventionContext['point'] }) {
  const { dismiss } = useIntervention();

  switch (point) {
    case 'batch-preview':
      return (
        <div className="flex flex-wrap gap-2">
          <ActionButton label="Approve" onClick={() => dismiss({ type: 'approve' })} variant="primary" />
          <ActionButton label="Skip" onClick={() => dismiss({ type: 'skip' })} variant="secondary" />
          <ActionButton label="Abort" onClick={() => dismiss({ type: 'abort' })} variant="danger" />
        </div>
      );

    case 'batch-result':
      return (
        <div className="flex flex-wrap gap-2">
          <ActionButton label="Continue" onClick={() => dismiss({ type: 'approve' })} variant="primary" />
          <ActionButton label="Pause" onClick={() => dismiss({ type: 'pause' })} variant="secondary" />
        </div>
      );

    case 'stuck-transaction':
      return (
        <div className="flex flex-wrap gap-2">
          <ActionButton label="Bump Gas (1.5x)" onClick={() => dismiss({ type: 'bumpGas', multiplier: 1.5 })} variant="primary" />
          <ActionButton label="Retry" onClick={() => dismiss({ type: 'retry' })} variant="secondary" />
          <ActionButton label="Abort" onClick={() => dismiss({ type: 'abort' })} variant="danger" />
        </div>
      );

    case 'validation-warning':
      return (
        <div className="flex flex-wrap gap-2">
          <ActionButton label="Override" onClick={() => dismiss({ type: 'overrideWarnings' })} variant="primary" />
          <ActionButton label="Abort" onClick={() => dismiss({ type: 'abort' })} variant="danger" />
        </div>
      );

    case 'validation-error':
      return (
        <div className="flex flex-wrap gap-2">
          <ActionButton label="Abort" onClick={() => dismiss({ type: 'abort' })} variant="danger" />
        </div>
      );

    default:
      return (
        <div className="flex flex-wrap gap-2">
          <ActionButton label="Approve" onClick={() => dismiss({ type: 'approve' })} variant="primary" />
          <ActionButton label="Skip" onClick={() => dismiss({ type: 'skip' })} variant="secondary" />
          <ActionButton label="Abort" onClick={() => dismiss({ type: 'abort' })} variant="danger" />
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Shared button
// ---------------------------------------------------------------------------

type ActionButtonVariant = 'primary' | 'secondary' | 'danger';

const VARIANT_CLASSES: Record<ActionButtonVariant, string> = {
  primary:
    'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500',
  secondary:
    'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 focus-visible:ring-gray-400',
  danger:
    'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500',
};

function ActionButton({
  label,
  onClick,
  variant,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly variant: ActionButtonVariant;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900 ${VARIANT_CLASSES[variant]}`}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Point icon
// ---------------------------------------------------------------------------

function PointIcon({ point }: { readonly point: InterventionContext['point'] }) {
  const baseClass = 'h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold';

  switch (point) {
    case 'batch-preview':
      return <div className={`${baseClass} bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400`}>B</div>;
    case 'batch-result':
      return <div className={`${baseClass} bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400`}>R</div>;
    case 'stuck-transaction':
      return <div className={`${baseClass} bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400`}>!</div>;
    case 'validation-warning':
      return <div className={`${baseClass} bg-yellow-100 text-yellow-600 dark:bg-yellow-900/40 dark:text-yellow-400`}>W</div>;
    case 'validation-error':
      return <div className={`${baseClass} bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400`}>E</div>;
    default:
      return <div className={`${baseClass} bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400`}>?</div>;
  }
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

/**
 * Renders a modal overlay when the SDK hits an intervention point.
 *
 * The modal pauses the disperse loop until the user takes an action.
 * Content and available actions vary by intervention point type.
 */
export function InterventionModal() {
  const { state } = useIntervention();

  if (!state.isActive || !state.context) return null;

  const { point } = state.context;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={getTitle(point)}
    >
      <div className="mx-4 w-full max-w-lg rounded-lg bg-white p-6 shadow-xl ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-800">
        <div className="mb-4 flex items-center gap-3">
          <PointIcon point={point} />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {getTitle(point)}
          </h2>
        </div>

        <div className="mb-6">
          <InterventionContent context={state.context} />
        </div>

        <InterventionActions point={point} />
      </div>
    </div>
  );
}
