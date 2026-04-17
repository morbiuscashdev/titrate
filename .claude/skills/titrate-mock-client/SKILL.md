---
name: titrate-mock-client
description: Use when writing tests for TUI screens that consume `useClient()` from the context — Addresses filter preview, CampaignSetup token probe, Distribute screen, anything that reads from chain state. Also use when a TUI test requires `@titrate/sdk` functions that make RPC calls (probeToken, checkRecipients, getAllowance, scanBlocks, etc.). Provides a viem-compatible `PublicClient` mock that returns canned responses, so tests exercise probe-success / probe-error / balance-check flows deterministically without requiring Anvil. Do NOT use when the test already runs against Anvil (use `titrate-dev-services` instead).
---

# Titrate Mock Client

## Why

Several TUI screens depend on a live RPC client injected through React context:

- `CampaignSetup` auto-probes the token address via `probeToken(client, address)` → `{ symbol, decimals, totalSupply }`
- A future `Addresses` filter preview will call `getAddressProperties(client, addresses)` → balance / nonce / isContract
- `Distribute` reads allowances via `getAllowance({ client, ... })`

Without a mock, tests either (a) point at a real RPC (fragile, slow, network-dependent) or (b) skip the code path entirely (bad coverage). The mock lets tests assert on UI state transitions — "loading → success → renders symbol ✓" — deterministically.

## The fixture

Create `packages/tui/__tests__/__fixtures__/mock-client.ts`:

```typescript
import type { PublicClient, Address, Hex } from 'viem';

/**
 * Build a viem-compatible PublicClient mock that returns canned responses.
 * Only implements the subset of methods actually used by TUI screens.
 */
export type MockClientOptions = {
  readonly chainId?: number;
  readonly tokenMetadata?: Record<string, { symbol: string; decimals: number; totalSupply: bigint }>;
  readonly balances?: Record<string, bigint>;
  readonly nonces?: Record<string, number>;
  readonly codeAt?: Record<string, Hex>;     // address -> bytecode (non-empty = contract)
  readonly latestBlock?: bigint;
};

export function createMockClient(options: MockClientOptions = {}): PublicClient {
  const chainId = options.chainId ?? 1;
  const tokens = options.tokenMetadata ?? {};
  const balances = options.balances ?? {};
  const nonces = options.nonces ?? {};
  const code = options.codeAt ?? {};
  const latest = options.latestBlock ?? 100n;

  // Return an object shaped enough like PublicClient that the functions
  // used by TUI screens succeed. Cast through unknown to satisfy TS.
  const mock = {
    chain: { id: chainId },
    readContract: async ({ address, functionName }: { address: Address; functionName: string }) => {
      const meta = tokens[address.toLowerCase()];
      if (!meta) throw new Error(`MockClient: no token metadata for ${address}`);
      switch (functionName) {
        case 'symbol': return meta.symbol;
        case 'decimals': return meta.decimals;
        case 'totalSupply': return meta.totalSupply;
        default: throw new Error(`MockClient: unsupported readContract ${functionName}`);
      }
    },
    getBalance: async ({ address }: { address: Address }) => balances[address.toLowerCase()] ?? 0n,
    getTransactionCount: async ({ address }: { address: Address }) => nonces[address.toLowerCase()] ?? 0,
    getBytecode: async ({ address }: { address: Address }) => code[address.toLowerCase()] ?? '0x' as Hex,
    getBlockNumber: async () => latest,
    getChainId: async () => chainId,
  };
  return mock as unknown as PublicClient;
}
```

## Wiring into a test

Override the `ClientProvider` for the test render:

```tsx
import { createContext } from 'react';
import { createMockClient } from '../__fixtures__/mock-client.ts';
import { CampaignStorageProvider, SharedStorageProvider, ManifestProvider } from '../../src/interactive/context.js';

// ClientProvider wraps a context — for testing, inject directly via the raw provider.
// Easiest pattern: render the screen inside a test-only provider stack.

test('CampaignSetup probes token and shows symbol', async () => {
  const mockClient = createMockClient({
    chainId: 1,
    tokenMetadata: {
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': {
        symbol: 'USDC', decimals: 6, totalSupply: 1000000000000n,
      },
    },
  });

  // Export the raw Context from context.tsx if not already (see note below).
  const { renderer, captureCharFrame } = await createTestRenderer({ width: 60, height: 20 });
  createRoot(renderer).render(
    <TestProviders mockClient={mockClient}>
      <CampaignSetup onDone={() => {}} onBack={() => {}} />
    </TestProviders>,
  );

  // Simulate typing the token address
  // ... keyboard events ...
  await new Promise((r) => setTimeout(r, 50));
  expect(captureCharFrame()).toContain('USDC');
  expect(captureCharFrame()).toContain('(6 decimals)');
});
```

## Required context.tsx adjustment

`packages/tui/src/interactive/context.tsx` currently builds the `PublicClient` internally from `manifest.rpcUrl`. For mockability, either:

**(A) Export the raw Context and a test-only Provider**:

```tsx
// In context.tsx, add:
export const ClientCtx = createContext<PublicClient | null>(null);

// Tests use:
<ClientCtx.Provider value={mockClient}>{children}</ClientCtx.Provider>
```

**(B) Allow injection via props on `ClientProvider`**:

```tsx
export function ClientProvider({ children, override }: { children: ReactNode; override?: PublicClient }) {
  const { manifest } = useManifest();
  const [client, setClient] = useState<PublicClient | null>(override ?? null);
  useEffect(() => {
    if (override) { setClient(override); return; }
    setClient(createPublicClient({ transport: http(manifest.rpcUrl) }));
  }, [manifest.rpcUrl, override]);
  return <ClientCtx.Provider value={client}>{children}</ClientCtx.Provider>;
}
```

**Recommendation**: (A) is less invasive. Just add `export` to the existing `const ClientCtx`.

## Scope

This skill is for **unit tests of TUI screens**. For:
- SDK / storage-campaign tests → they don't need a client at all
- Full end-to-end flow verification → use `titrate-dev-services` (real Anvil)
- Web app tests → web has its own wagmi/viem setup; this mock is TUI-specific

## When the mock isn't enough

If a screen uses a method the mock doesn't implement (e.g., `watchContractEvent`), extend `createMockClient` with that method rather than shoehorning a partial stub. The mock should be discoverable — if a test fails with `TypeError: client.xxx is not a function`, add `xxx` with a sensible canned response.
