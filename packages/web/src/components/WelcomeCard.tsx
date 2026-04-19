import { Button, Card } from './ui';
import { ModeProvider } from '../theme';

/** Step card displaying a numbered workflow step. */
function StepCard({
  number,
  title,
  description,
}: {
  readonly number: number;
  readonly title: string;
  readonly description: string;
}) {
  const label = String(number).padStart(2, '0');
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[color:var(--color-pink-600)]">
          {label}
        </span>
        <div>
          <h3 className="font-sans text-sm font-extrabold tracking-tight text-[color:var(--fg-primary)]">{title}</h3>
          <p className="mt-1 font-mono text-xs leading-relaxed text-[color:var(--fg-muted)]">{description}</p>
        </div>
      </div>
    </Card>
  );
}

/**
 * Welcome card shown on the home page when no campaigns exist.
 *
 * Gives first-time users a quick overview of the four-step distribution
 * workflow and a prominent call-to-action to create their first campaign.
 */
export function WelcomeCard({
  onCreateCampaign,
}: {
  readonly onCreateCampaign: () => void;
}) {
  return (
    <ModeProvider mode="brutalist" className="mx-auto max-w-2xl px-4 py-16">
      <div className="text-center mb-8">
        <h1 className="font-sans text-2xl font-extrabold tracking-tight text-[color:var(--fg-primary)] mb-2">
          Welcome to Titrate
        </h1>
        <p className="font-mono text-sm text-[color:var(--fg-muted)]">
          Distribute ERC-20 tokens to multiple recipients on any EVM chain.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 mb-8">
        <StepCard
          number={1}
          title="Configure"
          description="Select chain, token, and contract type"
        />
        <StepCard
          number={2}
          title="Load Addresses"
          description="Upload CSV or paste recipient addresses"
        />
        <StepCard
          number={3}
          title="Set Amounts"
          description="Uniform or variable amounts per recipient"
        />
        <StepCard
          number={4}
          title="Distribute"
          description="Deploy contract and send tokens in batches"
        />
      </div>

      <div className="text-center">
        <Button variant="primary" size="lg" onClick={onCreateCampaign}>
          Create Your First Campaign
        </Button>
        <p className="mt-3 font-mono text-xs text-[color:var(--fg-muted)]">
          Connect your wallet first using the button above.
        </p>
      </div>
    </ModeProvider>
  );
}
