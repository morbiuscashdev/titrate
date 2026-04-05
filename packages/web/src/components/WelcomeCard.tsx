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
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-900 p-4 ring-1 ring-gray-200 dark:ring-gray-800">
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600/20 text-sm font-bold text-blue-400">
          {number}
        </span>
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{description}</p>
        </div>
      </div>
    </div>
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
    <div className="mx-auto max-w-2xl px-4 py-16">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Welcome to Titrate
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
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
        <button
          type="button"
          onClick={onCreateCampaign}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-6 py-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950"
        >
          Create Your First Campaign
        </button>
        <p className="mt-3 text-xs text-gray-500">
          Connect your wallet first using the button above.
        </p>
      </div>
    </div>
  );
}
