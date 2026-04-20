import { useEffect } from 'react';
import { Link } from 'react-router';
import { Wordmark, Chip, Card, Button } from '../components/ui';
import { ModeProvider } from '../theme';

/**
 * Landing page — brutalist-B hero. First view users see.
 *
 * Uses the brand primitive library: Wordmark (hero size), three verb Chips
 * for the tagline, Card primitives for features, Button (primary, brutalist)
 * for the CTA. The whole page is wrapped in ModeProvider[brutalist] so all
 * descendants render with the brutalist token set.
 */
export function LandingPage() {
  useEffect(() => {
    document.title = 'Titrate — Sovereign airdrop tooling';
  }, []);

  return (
    <ModeProvider
      mode="brutalist"
      className="min-h-screen bg-[color:var(--bg-page)] text-[color:var(--fg-primary)]"
    >
      <div className="mx-auto max-w-3xl px-6 py-20">
        {/* Hero — mark + wordmark + one-liner + verb chips */}
        <div className="text-center">
          <div className="inline-block">
            <Wordmark size="hero" />
          </div>
          <p className="mt-6 font-mono text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--fg-muted)]">
            Sovereign airdrop tooling
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Chip color="yellow">Sign cold</Chip>
            <Chip color="green">Run local</Chip>
            <Chip color="pink">Deploy anywhere</Chip>
          </div>
        </div>

        {/* How it works — four numbered steps */}
        <div className="mt-20">
          <h2 className="font-sans text-xl font-extrabold tracking-tight mb-6">How it works</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[color:var(--color-pink-600)]">01 · Configure</p>
              <p className="mt-2 font-mono text-[13px] leading-relaxed text-[color:var(--fg-primary)]">
                Pick your chain, token, and contract variant. Every parameter is declarative and lives in a
                manifest file you control.
              </p>
            </Card>
            <Card>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[color:var(--color-pink-600)]">02 · Load addresses</p>
              <p className="mt-2 font-mono text-[13px] leading-relaxed text-[color:var(--fg-primary)]">
                Upload a CSV, paste a list, or scan on-chain logs. Set operations (union, difference,
                intersection) are applied locally.
              </p>
            </Card>
            <Card>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[color:var(--color-pink-600)]">03 · Sign cold</p>
              <p className="mt-2 font-mono text-[13px] leading-relaxed text-[color:var(--fg-primary)]">
                One EIP-712 signature from your cold wallet seeds every hot wallet. Private keys never leave
                their originating device.
              </p>
            </Card>
            <Card>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[color:var(--color-pink-600)]">04 · Distribute</p>
              <p className="mt-2 font-mono text-[13px] leading-relaxed text-[color:var(--fg-primary)]">
                The pipeline scans, filters, and batches transactions across hot wallets in parallel.
                Resumable, auditable, and cancelable at any block.
              </p>
            </Card>
          </div>
        </div>

        {/* Compatible with — data providers + integrations */}
        <div className="mt-16">
          <h2 className="font-sans text-xl font-extrabold tracking-tight mb-6">Compatible with</h2>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Chip color="yellow">Etherscan</Chip>
            <Chip color="green">Blockscout</Chip>
            <Chip color="pink">Sourcify</Chip>
            <Chip color="yellow">TrueBlocks</Chip>
            <Chip color="green">Your RPC</Chip>
          </div>
          <p className="mt-4 text-center font-mono text-[12px] leading-relaxed text-[color:var(--fg-muted)]">
            Address discovery through Etherscan logs or TrueBlocks appearances.
            Contract verification fans out in parallel to Sourcify, Blockscout v2, and any
            Etherscan-compat API — a single success verifies. RPC traffic goes to whatever
            endpoint you point it at.
          </p>
        </div>

        {/* Principles — what makes it sovereign */}
        <div className="mt-16">
          <h2 className="font-sans text-xl font-extrabold tracking-tight mb-6">Principles</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <h3 className="font-sans text-base font-extrabold tracking-tight">Your keys. Your hardware.</h3>
              <p className="mt-2 font-mono text-[12px] leading-relaxed text-[color:var(--fg-muted)]">
                No custody, no server, no account. Hot wallets derive from a single cold signature and get
                swept back at the end.
              </p>
            </Card>
            <Card>
              <h3 className="font-sans text-base font-extrabold tracking-tight">Your RPC.</h3>
              <p className="mt-2 font-mono text-[12px] leading-relaxed text-[color:var(--fg-muted)]">
                Point it at your own node, a public RPC, or a paid provider. Titrate never talks to a
                vendor-specific backend.
              </p>
            </Card>
            <Card>
              <h3 className="font-sans text-base font-extrabold tracking-tight">Your surface.</h3>
              <p className="mt-2 font-mono text-[12px] leading-relaxed text-[color:var(--fg-muted)]">
                Run it in a browser, a terminal (TUI), or both. Same manifest, same state, same pipeline —
                different chrome.
              </p>
            </Card>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-20 text-center">
          <Link to="/dashboard" className="inline-block">
            <Button variant="primary" size="lg">Launch dashboard</Button>
          </Link>
          <p className="mt-4 font-mono text-xs text-[color:var(--fg-muted)]">
            No account required. All data stays in your browser.
          </p>
        </div>
      </div>
    </ModeProvider>
  );
}
