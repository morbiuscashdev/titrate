import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  http,
  parseAbiParameters,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Anvil default account #0 — always prefunded with 10000 ETH on a fresh spawn. */
export const ANVIL_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;

export type AnvilHandle = {
  readonly rpcUrl: string;
  readonly address: Address;
  readonly privateKey: Hex;
  readonly publicClient: PublicClient;
  readonly walletClient: WalletClient;
  readonly shutdown: () => Promise<void>;
};

type StartOptions = {
  readonly port?: number;
  readonly blockTime?: number;
  /** Fail fast if anvil doesn't respond within this many ms. */
  readonly startupTimeoutMs?: number;
};

async function probeRpc(rpcUrl: string): Promise<boolean> {
  try {
    const resp = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_chainId',
        params: [],
      }),
      signal: AbortSignal.timeout(800),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Spawns an Anvil subprocess on the given port and waits until it answers
 * `eth_chainId`. Returns a handle with viem clients tied to the first
 * default Anvil account, plus a `shutdown()` that kills the subprocess.
 *
 * The helper does NOT return a shared singleton — each call spawns a fresh
 * instance so parallel specs don't collide. Pick distinct ports per worker.
 */
export async function startAnvil(
  options: StartOptions = {},
): Promise<AnvilHandle> {
  const { port = 8559, blockTime, startupTimeoutMs = 10_000 } = options;
  const rpcUrl = `http://127.0.0.1:${port}`;

  const args = ['--port', String(port), '--silent'];
  if (blockTime !== undefined) {
    args.push('--block-time', String(blockTime));
  }

  const proc: ChildProcess = spawn('anvil', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const crashed = new Promise<never>((_, reject) => {
    proc.once('exit', (code) => {
      reject(
        new Error(`anvil exited before becoming ready (code=${code ?? 'null'})`),
      );
    });
    proc.once('error', (err) => reject(err));
  });

  const readiness = (async () => {
    const deadline = Date.now() + startupTimeoutMs;
    while (Date.now() < deadline) {
      if (await probeRpc(rpcUrl)) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`anvil did not answer ${rpcUrl} within ${startupTimeoutMs}ms`);
  })();

  try {
    await Promise.race([readiness, crashed]);
  } catch (err) {
    if (!proc.killed) proc.kill('SIGKILL');
    throw err;
  }

  const account = privateKeyToAccount(ANVIL_PRIVATE_KEY);
  const publicClient = createPublicClient({
    chain: foundry,
    transport: http(rpcUrl),
  });
  const walletClient = createWalletClient({
    chain: foundry,
    transport: http(rpcUrl),
    account,
  });

  const shutdown = async (): Promise<void> => {
    if (proc.killed || proc.exitCode !== null) return;
    await new Promise<void>((resolveShutdown) => {
      proc.once('exit', () => resolveShutdown());
      proc.kill('SIGTERM');
      // Hard timeout — SIGKILL if SIGTERM didn't take.
      setTimeout(() => {
        if (proc.exitCode === null) proc.kill('SIGKILL');
      }, 2_000);
    });
  };

  return {
    rpcUrl,
    address: account.address,
    privateKey: ANVIL_PRIVATE_KEY,
    publicClient,
    walletClient,
    shutdown,
  };
}

/**
 * Returns true when an `anvil` binary is reachable via PATH. Use to skip
 * specs cleanly on machines without Foundry installed rather than failing.
 */
export async function anvilInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = spawn('anvil', ['--version'], { stdio: 'ignore' });
    probe.once('exit', (code) => resolve(code === 0));
    probe.once('error', () => resolve(false));
  });
}

// ---------------------------------------------------------------------------
// MockERC20 deploy — bytecode + ABI read from the Foundry output directory.
// ---------------------------------------------------------------------------

type Artifact = {
  abi: readonly Record<string, unknown>[];
  bytecode: { object: string };
};

const ARTIFACT_PATH = resolve(
  __dirname,
  '../../../contracts/out/MockERC20.sol/MockERC20.json',
);

let cachedArtifact: Artifact | null = null;

function loadArtifact(): Artifact {
  if (cachedArtifact) return cachedArtifact;
  const raw = readFileSync(ARTIFACT_PATH, 'utf8');
  cachedArtifact = JSON.parse(raw) as Artifact;
  return cachedArtifact;
}

export type MockErc20 = {
  readonly address: Address;
  readonly abi: readonly Record<string, unknown>[];
  readonly decimals: number;
};

/**
 * Deploys a MockERC20 to the given Anvil handle and mints `mintAmount` to
 * the deployer. Returns the token address + ABI so the caller can pass it
 * to the UI (token address) and build viem contract reads.
 */
export async function deployMockErc20(
  anvil: AnvilHandle,
  options: {
    readonly name?: string;
    readonly symbol?: string;
    readonly decimals?: number;
    readonly mintAmount?: bigint;
  } = {},
): Promise<MockErc20> {
  const {
    name = 'TitrateTestToken',
    symbol = 'TTT',
    decimals = 18,
    mintAmount = 1_000_000n * 10n ** 18n,
  } = options;

  const artifact = loadArtifact();
  const constructorArgs = encodeAbiParameters(
    parseAbiParameters('string, string, uint8'),
    [name, symbol, decimals],
  );
  const bytecode = artifact.bytecode.object as Hex;
  const deployBytecode = (bytecode + constructorArgs.slice(2)) as Hex;

  const deployHash = await anvil.walletClient.deployContract({
    abi: artifact.abi as never,
    bytecode: deployBytecode,
    account: anvil.walletClient.account!,
    chain: foundry,
  });
  const receipt = await anvil.publicClient.waitForTransactionReceipt({
    hash: deployHash,
  });
  if (!receipt.contractAddress) {
    throw new Error('MockERC20 deploy failed: no contract address in receipt');
  }

  // Mint the deployer a working balance.
  const mintHash = await anvil.walletClient.writeContract({
    address: receipt.contractAddress,
    abi: artifact.abi as never,
    functionName: 'mint',
    args: [anvil.address, mintAmount],
    account: anvil.walletClient.account!,
    chain: foundry,
  });
  await anvil.publicClient.waitForTransactionReceipt({ hash: mintHash });

  return {
    address: receipt.contractAddress,
    abi: artifact.abi,
    decimals,
  };
}
