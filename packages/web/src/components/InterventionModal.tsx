import { useIntervention } from '../providers/InterventionProvider.js';
import { createSpotCheck } from '@titrate/sdk';
import type { InterventionContext } from '@titrate/sdk';
import { Button, type ButtonVariant } from './ui/index.js';
import { useMode } from '../theme/index.js';

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

/** Derive the base explorer URL from context metadata. */
function getExplorerBaseUrl(context: InterventionContext): string {
  return (context.metadata?.explorerBaseUrl as string) ?? 'https://etherscan.io';
}

/** Render a tx hash as a clickable explorer link using brand tokens. */
function TxHashLink({ hash, explorerBaseUrl }: { readonly hash: string; readonly explorerBaseUrl: string }) {
  return (
    <a
      href={`${explorerBaseUrl}/tx/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded bg-[color:var(--bg-page)] px-1 py-0.5 text-xs font-mono text-[color:var(--color-info)] hover:underline"
    >
      {truncateHash(hash)}
    </a>
  );
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
    <div className="space-y-3 font-mono text-sm text-[color:var(--fg-primary)]">
      <p>
        Batch #{context.batchIndex ?? 0}: {addressCount} address{addressCount !== 1 ? 'es' : ''},{' '}
        {totalTokens.toString()} tokens total.
      </p>
      {spotCheck && spotCheck.samples.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--fg-muted)]">
            Spot Check ({spotCheck.sampleSize} of {spotCheck.totalCount})
          </p>
          <div className="space-y-1">
            {spotCheck.samples.map((sample) => (
              <div key={sample.index} className="flex items-center justify-between text-xs">
                <a
                  href={sample.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[color:var(--color-info)] hover:underline"
                >
                  {sample.address.slice(0, 10)}...{sample.address.slice(-6)}
                </a>
                {sample.amount !== undefined && (
                  <span className="text-[color:var(--fg-muted)]">
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
    <div className="space-y-2 font-mono text-sm text-[color:var(--fg-primary)]">
      <p>Batch #{context.batchIndex ?? 0} confirmed.</p>
      {context.txHash && (
        <p>
          TX: <TxHashLink hash={context.txHash} explorerBaseUrl={getExplorerBaseUrl(context)} />
        </p>
      )}
    </div>
  );
}

function StuckTransactionContent({ context }: { readonly context: InterventionContext }) {
  return (
    <div className="space-y-2 font-mono text-sm text-[color:var(--fg-primary)]">
      <p>
        Transaction{' '}
        {context.txHash ? (
          <TxHashLink hash={context.txHash} explorerBaseUrl={getExplorerBaseUrl(context)} />
        ) : (
          ''
        )}{' '}
        appears to be stuck.
      </p>
      <p className="text-xs text-[color:var(--fg-muted)]">
        You can bump gas to speed up the transaction, wait for it to confirm, or abort.
      </p>
    </div>
  );
}

function ValidationWarningContent({ context }: { readonly context: InterventionContext }) {
  const issues = context.issues ?? [];
  return (
    <div className="space-y-2 font-mono text-sm text-[color:var(--fg-primary)]">
      <p>{issues.length} warning{issues.length !== 1 ? 's' : ''} found:</p>
      <ul className="ml-4 list-disc space-y-1 text-xs text-[color:var(--color-warn)]">
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
    <div className="space-y-2 font-mono text-sm text-[color:var(--fg-primary)]">
      <p>{issues.length} error{issues.length !== 1 ? 's' : ''} found:</p>
      <ul className="ml-4 list-disc space-y-1 text-xs text-[color:var(--color-err)]">
        {issues.map((issue, index) => (
          <li key={index}>{issue.message}</li>
        ))}
      </ul>
    </div>
  );
}

function DefaultContent({ context }: { readonly context: InterventionContext }) {
  return (
    <div className="font-mono text-sm text-[color:var(--fg-primary)]">
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

type Action = { readonly label: string; readonly variant: ButtonVariant; readonly onClick: () => void };

function ActionRow({ actions }: { readonly actions: readonly Action[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Button key={action.label} variant={action.variant} size="md" onClick={action.onClick}>
          {action.label}
        </Button>
      ))}
    </div>
  );
}

function InterventionActions({ point }: { readonly point: InterventionContext['point'] }) {
  const { dismiss } = useIntervention();

  switch (point) {
    case 'batch-preview':
      return (
        <ActionRow
          actions={[
            { label: 'Approve', variant: 'primary', onClick: () => dismiss({ type: 'approve' }) },
            { label: 'Skip', variant: 'secondary', onClick: () => dismiss({ type: 'skip' }) },
            { label: 'Abort', variant: 'danger', onClick: () => dismiss({ type: 'abort' }) },
          ]}
        />
      );

    case 'batch-result':
      return (
        <ActionRow
          actions={[
            { label: 'Continue', variant: 'primary', onClick: () => dismiss({ type: 'approve' }) },
            { label: 'Pause', variant: 'secondary', onClick: () => dismiss({ type: 'pause' }) },
          ]}
        />
      );

    case 'stuck-transaction':
      return (
        <ActionRow
          actions={[
            { label: 'Bump Gas (1.5x)', variant: 'primary', onClick: () => dismiss({ type: 'bumpGas', multiplier: 1.5 }) },
            { label: 'Retry', variant: 'secondary', onClick: () => dismiss({ type: 'retry' }) },
            { label: 'Abort', variant: 'danger', onClick: () => dismiss({ type: 'abort' }) },
          ]}
        />
      );

    case 'validation-warning':
      return (
        <ActionRow
          actions={[
            { label: 'Override', variant: 'primary', onClick: () => dismiss({ type: 'overrideWarnings' }) },
            { label: 'Abort', variant: 'danger', onClick: () => dismiss({ type: 'abort' }) },
          ]}
        />
      );

    case 'validation-error':
      return (
        <ActionRow
          actions={[{ label: 'Abort', variant: 'danger', onClick: () => dismiss({ type: 'abort' }) }]}
        />
      );

    default:
      return (
        <ActionRow
          actions={[
            { label: 'Approve', variant: 'primary', onClick: () => dismiss({ type: 'approve' }) },
            { label: 'Skip', variant: 'secondary', onClick: () => dismiss({ type: 'skip' }) },
            { label: 'Abort', variant: 'danger', onClick: () => dismiss({ type: 'abort' }) },
          ]}
        />
      );
  }
}

// ---------------------------------------------------------------------------
// Point icon — brand token chip
// ---------------------------------------------------------------------------

type IconSpec = { readonly letter: string; readonly token: string };

function getIconSpec(point: InterventionContext['point']): IconSpec {
  switch (point) {
    case 'batch-preview':
      return { letter: 'B', token: 'var(--color-info)' };
    case 'batch-result':
      return { letter: 'R', token: 'var(--color-ok)' };
    case 'stuck-transaction':
      return { letter: '!', token: 'var(--color-warn)' };
    case 'validation-warning':
      return { letter: 'W', token: 'var(--color-warn)' };
    case 'validation-error':
      return { letter: 'E', token: 'var(--color-err)' };
    default:
      return { letter: '?', token: 'var(--fg-muted)' };
  }
}

function PointIcon({ point }: { readonly point: InterventionContext['point'] }) {
  const mode = useMode();
  const { letter, token } = getIconSpec(point);
  const shape = mode === 'brutalist' ? 'rounded-none border-2 border-[color:var(--edge)]' : 'rounded-full';
  return (
    <div
      className={`flex h-8 w-8 items-center justify-center font-mono text-sm font-bold text-[color:var(--bg-card)] ${shape}`}
      style={{ backgroundColor: token }}
      aria-hidden="true"
    >
      {letter}
    </div>
  );
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
  const mode = useMode();

  if (!state.isActive || !state.context) return null;

  const { point } = state.context;

  const panel = mode === 'brutalist'
    ? 'rounded-none border-2 border-[color:var(--edge)] shadow-[6px_6px_0_var(--shadow-color)]'
    : 'rounded-lg ring-1 ring-[color:var(--edge)]/30 shadow-xl';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--shadow-color)]/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={getTitle(point)}
    >
      <div className={`mx-4 w-full max-w-lg bg-[color:var(--bg-card)] p-6 ${panel}`}>
        <div className="mb-4 flex items-center gap-3">
          <PointIcon point={point} />
          <h2 className="font-sans text-lg font-semibold text-[color:var(--fg-primary)]">
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
