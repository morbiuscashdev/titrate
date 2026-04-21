import {
  createPublicClient,
  defineChain,
  http,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const FAUCET_BASE_URL = 'https://faucet.v4.testnet.pulsechain.com';
/**
 * RPC fallback list — the primary v4 endpoint is a single Heroku dyno that
 * periodically returns 5xx / hangs. `rpc-testnet-pulsechain.g4mm4.io` is a
 * community mirror; adding more mirrors here is a drop-in change.
 */
const RPC_URLS = [
  'https://rpc.v4.testnet.pulsechain.com',
  'https://rpc-testnet-pulsechain.g4mm4.io',
] as const;
const DEFAULT_RPC_URL = RPC_URLS[0];

/**
 * Minimal duplicate of the SDK's PulseChain v4 helper, local to the web E2E
 * suite so the helper doesn't cross package boundaries. Keep in sync with
 * `packages/sdk/src/__tests__/helpers/pulsechain-testnet.ts` if chain facts
 * change.
 */
export const pulsechainV4Testnet = defineChain({
  id: 943,
  name: 'PulseChain Testnet v4',
  nativeCurrency: { name: 'tPLS', symbol: 'tPLS', decimals: 18 },
  rpcUrls: {
    default: { http: [DEFAULT_RPC_URL] },
  },
  blockExplorers: {
    default: { name: 'PulseScan', url: 'https://scan.v4.testnet.pulsechain.com' },
  },
  testnet: true,
});

export type TestnetAccount = {
  readonly address: Address;
  readonly privateKey: Hex;
  readonly rpcUrl: string;
  readonly publicClient: PublicClient;
};

/**
 * Probes the v4 RPC mirrors and returns the first one that answers
 * `eth_chainId` with `0x3af` (943) within the timeout. Throws if none
 * respond — the spec should `test.skip()` on that.
 */
export async function selectLiveRpc(
  timeoutMs = 10_000,
  candidates: readonly string[] = RPC_URLS,
): Promise<string> {
  for (const url of candidates) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_chainId',
          params: [],
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) continue;
      const json = (await resp.json()) as { result?: string };
      if (json.result === '0x3af') return url;
    } catch {
      // try next candidate
    }
  }
  throw new Error(
    `No responsive PulseChain v4 RPC in ${candidates.join(', ')}`,
  );
}

/**
 * Resolves a testnet account. Prefers `PULSECHAIN_TESTNET_PRIVATE_KEY` so
 * repeated runs reuse one faucet claim. Falls back to a fresh random key —
 * the caller is responsible for claiming from the faucet in that case.
 */
export function resolveAccount(rpcUrl: string = DEFAULT_RPC_URL): TestnetAccount {
  const envKey = process.env.PULSECHAIN_TESTNET_PRIVATE_KEY as Hex | undefined;
  const privateKey: Hex = envKey ?? generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({
    chain: pulsechainV4Testnet,
    transport: http(rpcUrl),
  });
  return { address: account.address, privateKey, rpcUrl, publicClient };
}

/**
 * Claims tPLS from the PulseChain v4 testnet faucet. Throws with the faucet's
 * own error body when the claim is rejected (most often per-IP cooldown).
 */
export async function claimFromFaucet(address: Address): Promise<Hex> {
  const form = new FormData();
  form.append('address', address);
  const response = await fetch(`${FAUCET_BASE_URL}/api/claim`, {
    method: 'POST',
    body: form,
  });
  const body = (await response.text()).trim();
  if (!response.ok) {
    throw new Error(`Faucet claim failed (${response.status}): ${body}`);
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(body)) {
    throw new Error(`Faucet returned unexpected body: ${body.slice(0, 200)}`);
  }
  return body as Hex;
}

/**
 * Polls until the given address has at least `minBalance`. Throws on timeout.
 */
export async function waitForBalance(
  publicClient: PublicClient,
  address: Address,
  options: {
    readonly minBalance: bigint;
    readonly timeoutMs?: number;
    readonly intervalMs?: number;
  },
): Promise<bigint> {
  const { minBalance, timeoutMs = 60_000, intervalMs = 3_000 } = options;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const balance = await publicClient.getBalance({ address });
    if (balance >= minBalance) return balance;
    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(
    `Timed out waiting for ${address} to reach balance ${minBalance} wei on PulseChain v4 testnet`,
  );
}

/**
 * Ensures the account has at least `minBalance` wei. Returns a helpful
 * skip reason when funding cannot be achieved (faucet rejected, no env key).
 * The spec should `test.skip()` on a non-null reason instead of throwing so
 * flaky faucet outages don't produce red CI.
 */
export async function ensureFunded(
  account: TestnetAccount,
  minBalance: bigint,
): Promise<{ readonly ok: true; readonly balance: bigint } | { readonly ok: false; readonly reason: string }> {
  const balance = await account.publicClient.getBalance({ address: account.address });
  if (balance >= minBalance) return { ok: true, balance };

  try {
    await claimFromFaucet(account.address);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `faucet unavailable: ${message}` };
  }

  try {
    const final = await waitForBalance(account.publicClient, account.address, {
      minBalance,
    });
    return { ok: true, balance: final };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: message };
  }
}
