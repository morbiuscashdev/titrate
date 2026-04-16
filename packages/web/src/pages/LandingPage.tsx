import { useEffect } from 'react';
import { Link } from 'react-router';

/** Feature card with an icon, title, and description. */
function FeatureCard({
  icon,
  title,
  description,
}: {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-900 p-5 ring-1 ring-gray-200 dark:ring-gray-800">
      <div className="mb-3 text-blue-500">{icon}</div>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{title}</h3>
      <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">{description}</p>
    </div>
  );
}

/**
 * Landing page shown at the root URL.
 *
 * Explains what Titrate does, why it exists, and how it works.
 */
export function LandingPage() {
  useEffect(() => { document.title = 'Titrate — Token Distribution Platform'; }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      {/* Hero */}
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
          Titrate
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300 mb-2">
          Batch token distribution for EVM chains.
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
          Send ERC-20 tokens or native ETH to thousands of addresses in a single campaign.
          Configure your distribution, load recipients from a CSV, and Titrate handles
          batching, gas management, and transaction tracking.
        </p>
      </div>

      {/* Features */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-12">
        <FeatureCard
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5zm4.75 6.75a.75.75 0 00-1.5 0v2.546l-.943-1.048a.75.75 0 10-1.114 1.004l2.25 2.5a.75.75 0 001.114 0l2.25-2.5a.75.75 0 00-1.114-1.004l-.943 1.048V8.75z" clipRule="evenodd" /></svg>}
          title="CSV Import"
          description="Upload a CSV of recipient addresses and optional amounts. Supports any EVM address format."
        />
        <FeatureCard
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H4.598a.75.75 0 00-.75.75v3.634a.75.75 0 001.5 0v-2.033l.312.311a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.06-7.753a.75.75 0 00-1.5 0v2.033l-.312-.31A7 7 0 002.848 8.53a.75.75 0 001.449.39 5.5 5.5 0 019.201-2.466l.312.311H11.38a.75.75 0 000 1.5h3.634a.75.75 0 00.75-.75V3.671z" clipRule="evenodd" /></svg>}
          title="Automatic Batching"
          description="Recipients are split into batches and sent through a disperse contract. No manual chunking required."
        />
        <FeatureCard
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" /></svg>}
          title="Offline-First"
          description="All campaign data stays in your browser. Nothing is sent to a server. Your keys never leave your machine."
        />
        <FeatureCard
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zM10 7a3 3 0 100 6 3 3 0 000-6zM15.657 5.404a.75.75 0 10-1.06-1.06l-1.061 1.06a.75.75 0 001.06 1.06l1.06-1.06zM6.464 14.596a.75.75 0 10-1.06-1.06l-1.06 1.06a.75.75 0 001.06 1.06l1.06-1.06zM18 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 0118 10zM5 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 015 10zM14.596 15.657a.75.75 0 001.06-1.06l-1.06-1.061a.75.75 0 10-1.06 1.06l1.06 1.06zM5.404 6.464a.75.75 0 001.06-1.06l-1.06-1.06a.75.75 0 10-1.06 1.06l1.06 1.06z" /></svg>}
          title="Multi-Chain"
          description="Works on Ethereum, PulseChain, Arbitrum, Base, and any EVM-compatible chain with a public RPC."
        />
        <FeatureCard
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path fillRule="evenodd" d="M1 4a1 1 0 011-1h16a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V4zm12 4a3 3 0 11-6 0 3 3 0 016 0zM4 9a1 1 0 100-2 1 1 0 000 2zm12-1a1 1 0 11-2 0 1 1 0 012 0zM2 15.25h16a.75.75 0 010 1.5H2a.75.75 0 010-1.5z" clipRule="evenodd" /></svg>}
          title="Gas Controls"
          description="Set gas headroom, priority fee caps, base fee limits, and total gas budgets. Pause if costs spike."
        />
        <FeatureCard
          icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path fillRule="evenodd" d="M6 3.75A2.75 2.75 0 018.75 1h2.5A2.75 2.75 0 0114 3.75v.443c.572.055 1.14.122 1.706.2C17.053 4.582 18 5.75 18 7.07v3.469c0 1.126-.694 2.191-1.83 2.54-1.952.6-4.03.93-6.17.93-2.14 0-4.218-.33-6.17-.93C2.694 12.73 2 11.665 2 10.539V7.07c0-1.321.947-2.489 2.294-2.676A41.047 41.047 0 016 4.193V3.75zm6.5 0v.325a41.622 41.622 0 00-5 0V3.75c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25zM10 10a1 1 0 00-1 1v.01a1 1 0 001 1h.01a1 1 0 001-1V11a1 1 0 00-1-1H10z" clipRule="evenodd" /><path d="M3 15.055v-.684c.126.053.255.1.39.142 2.092.642 4.313.987 6.61.987 2.297 0 4.518-.345 6.61-.987.135-.041.264-.089.39-.142v.684c0 1.347-.985 2.53-2.363 2.686A41.454 41.454 0 0110 18c-1.572 0-3.118-.12-4.637-.259C3.985 17.585 3 16.402 3 15.055z" /></svg>}
          title="Hot Wallet Derivation"
          description="Derive multiple hot wallets from a single cold key for parallel distribution. Sweep residual balances when done."
        />
      </div>

      {/* How it works */}
      <div className="mb-12">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 text-center">How it works</h2>
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-0 sm:items-start">
          <Step number={1} title="Configure" description="Pick your chain, token, and contract variant." />
          <Arrow />
          <Step number={2} title="Load addresses" description="Upload a CSV or paste addresses directly." />
          <Arrow />
          <Step number={3} title="Set amounts" description="Uniform amount for all, or per-recipient from CSV." />
          <Arrow />
          <Step number={4} title="Distribute" description="Deploy the contract and send in automated batches." />
        </div>
      </div>

      {/* CTA */}
      <div className="text-center">
        <Link
          to="/dashboard"
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-6 py-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950"
        >
          Dashboard
        </Link>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          No account required. All data stays in your browser.
        </p>
      </div>
    </div>
  );
}

/** Step indicator for the "how it works" section. */
function Step({ number, title, description }: { readonly number: number; readonly title: string; readonly description: string }) {
  return (
    <div className="flex-1 text-center px-2">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-600/20 text-sm font-bold text-blue-400 mb-2">
        {number}
      </span>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{description}</p>
    </div>
  );
}

/** Arrow between steps (hidden on mobile, shown as horizontal arrow on sm+). */
function Arrow() {
  return (
    <div className="hidden sm:flex items-center justify-center px-1 pt-4">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-gray-400 dark:text-gray-600">
        <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
      </svg>
    </div>
  );
}
