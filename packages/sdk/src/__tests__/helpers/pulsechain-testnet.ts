import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const FAUCET_BASE_URL = 'https://faucet.v4.testnet.pulsechain.com';
const DEFAULT_RPC_URL = 'https://rpc.v4.testnet.pulsechain.com';

/**
 * PulseChain v4 testnet chain descriptor for viem. Matches the production
 * chain-config entry in `packages/sdk/src/chains/config.ts` (chainId 943,
 * native token tPLS).
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

export type TestnetContext = {
  readonly rpcUrl: string;
  readonly publicClient: PublicClient;
  readonly walletClient: WalletClient;
  readonly account: { readonly address: Address; readonly privateKey: Hex };
};

/**
 * Creates a viem client pair for PulseChain v4 testnet.
 *
 * If `PULSECHAIN_TESTNET_PRIVATE_KEY` is set in the environment, that key is
 * reused (good for deterministic, re-fundable CI accounts). Otherwise a fresh
 * random key is generated — useful for local runs so each invocation gets a
 * clean nonce and wallet.
 */
export function createTestnetContext(options: {
  readonly rpcUrl?: string;
  readonly privateKey?: Hex;
} = {}): TestnetContext {
  const rpcUrl = options.rpcUrl ?? DEFAULT_RPC_URL;
  const privateKey: Hex =
    options.privateKey
    ?? (process.env.PULSECHAIN_TESTNET_PRIVATE_KEY as Hex | undefined)
    ?? generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  const publicClient = createPublicClient({
    chain: pulsechainV4Testnet,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    chain: pulsechainV4Testnet,
    transport: http(rpcUrl),
    account,
  });

  return {
    rpcUrl,
    publicClient,
    walletClient,
    account: { address: account.address, privateKey },
  };
}

/**
 * Claims tPLS from the PulseChain v4 testnet faucet for the given address.
 * Returns the faucet tx hash on success.
 *
 * The faucet is a public Heroku service (no captcha, no API key). It has a
 * per-address cooldown; attempting a second claim within that window will
 * return a non-ok response whose body contains an error message.
 *
 * @throws When the faucet endpoint returns a non-2xx response. The error
 *         message includes the faucet's response body for easier debugging.
 */
export async function claimFromFaucet(address: Address, options: {
  readonly signal?: AbortSignal;
} = {}): Promise<Hex> {
  const form = new FormData();
  form.append('address', address);

  const response = await fetch(`${FAUCET_BASE_URL}/api/claim`, {
    method: 'POST',
    body: form,
    signal: options.signal,
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Faucet claim failed (${response.status}): ${body}`);
  }

  const trimmed = body.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
    throw new Error(`Faucet returned unexpected body: ${trimmed.slice(0, 200)}`);
  }

  return trimmed as Hex;
}

/**
 * Waits until the given address has at least `minBalance` wei, polling every
 * `intervalMs` until `timeoutMs` elapses.
 *
 * @throws When the timeout expires before the balance target is reached.
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
