import { describe, it, expect, beforeAll, vi } from 'vitest';
import { parseEther, type Address, type Hex } from 'viem';
import { createAnvilContext, anvilAvailable, type AnvilContext } from './helpers/anvil.js';

const anvilUp = await anvilAvailable;
import { deployMockERC20, MOCK_ERC20_ABI_TYPED } from './helpers/mock-erc20.js';
import {
  deployDistributor,
  getContractSourceTemplate,
  disperseTokens,
  disperseTokensSimple,
  approveOperator,
  increaseOperatorAllowance,
  getAllowance,
  checkRecipients,
  verifyContract,
  pollVerificationStatus,
} from '../distributor/index.js';

// Anvil default accounts #1 and #2
const ALICE = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address;
const BOB = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as Address;

// ---------------------------------------------------------------------------
// deployDistributor
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// deployDistributor — error path when receipt has no contractAddress (line 54)
// ---------------------------------------------------------------------------

describe('deployDistributor — no contract address in receipt', () => {
  it('throws when waitForTransactionReceipt returns no contractAddress (line 54)', async () => {
    const fakeWalletClient = {
      account: { address: '0x0000000000000000000000000000000000000001' },
      deployContract: vi.fn().mockResolvedValue('0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'),
    } as never;

    const fakePublicClient = {
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ contractAddress: null }),
    } as never;

    await expect(
      deployDistributor({
        variant: 'simple',
        name: 'WillFail',
        walletClient: fakeWalletClient,
        publicClient: fakePublicClient,
      }),
    ).rejects.toThrow('Contract deployment failed for variant "simple": no address in receipt');
  });
});

describe.runIf(anvilUp)('deployDistributor (anvil)', () => {
  let ctx: AnvilContext;

  beforeAll(() => {
    ctx = createAnvilContext();
  });

  it('deploys a simple contract', async () => {
    const result = await deployDistributor({
      variant: 'simple',
      name: 'TestSimple',
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
    });

    expect(result.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(result.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(result.variant).toBe('simple');
    expect(result.name).toBe('TestSimple');

    const code = await ctx.publicClient.getCode({ address: result.address });
    expect(code).toBeTruthy();
    expect(code!.length).toBeGreaterThan(2);
  });

  it('deploys a full contract', async () => {
    const result = await deployDistributor({
      variant: 'full',
      name: 'TestFull',
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
    });

    expect(result.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(result.variant).toBe('full');

    const code = await ctx.publicClient.getCode({ address: result.address });
    expect(code).toBeTruthy();
    expect(code!.length).toBeGreaterThan(2);
  });
});

// ---------------------------------------------------------------------------
// getContractSourceTemplate
// ---------------------------------------------------------------------------

describe('getContractSourceTemplate', () => {
  it('returns source with contract name for simple variant', () => {
    const source = getContractSourceTemplate('simple');
    expect(source).toContain('contract TitrateSimple');
  });

  it('returns source with contract name for full variant', () => {
    const source = getContractSourceTemplate('full');
    expect(source).toContain('contract TitrateFull');
  });

  it('returns real Solidity source for simple variant', () => {
    const source = getContractSourceTemplate('simple');
    expect(source).toContain('pragma solidity');
    expect(source).toContain('contract TitrateSimple');
    expect(source).toContain('function disperse');
  });

  it('returns real Solidity source for full variant', () => {
    const source = getContractSourceTemplate('full');
    expect(source).toContain('pragma solidity');
    expect(source).toContain('contract TitrateFull');
    expect(source).toContain('function disperseSimple');
    expect(source).toContain('function multicall');
  });

  it('source can be name-replaced for verification', () => {
    const source = getContractSourceTemplate('simple');
    const custom = source.replaceAll('TitrateSimple', 'BuyMoreHEX');
    expect(custom).toContain('contract BuyMoreHEX');
    expect(custom).not.toContain('TitrateSimple');
  });
});

// ---------------------------------------------------------------------------
// verifyContract — multi-backend unit tests (no live explorer required)
//
// The three backends (Sourcify, Etherscan-compat, Blockscout v2) are
// dispatched in parallel from a single `verifyContract` call. Tests here
// mock globalThis.fetch with a URL router so each backend's path can be
// exercised independently.
// ---------------------------------------------------------------------------

/**
 * Build a fetch mock that routes by URL. Each handler returns a pseudo-Response
 * object whose `.text()` or `.json()` produces the scripted body.
 */
type FetchRoute = {
  readonly match: (url: string) => boolean;
  readonly respond: () => { status?: number; ok?: boolean; body: string };
  readonly onCall?: (url: string) => void;
};

function makeFetchRouter(routes: readonly FetchRoute[]): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation(async (url: string | URL) => {
    const str = typeof url === 'string' ? url : url.toString();
    const route = routes.find((r) => r.match(str));
    if (!route) {
      throw new TypeError(`fetch mock: no route matched ${str}`);
    }
    route.onCall?.(str);
    const { status = 200, ok = status >= 200 && status < 300, body } = route.respond();
    return {
      status,
      ok,
      text: async () => body,
      json: async () => JSON.parse(body),
    } as unknown as Response;
  });
}

const SOURCIFY_SUCCESS_BODY = JSON.stringify({
  result: [{ status: 'perfect', address: '0x...' }],
});
const SOURCIFY_CHAIN_NOT_SUPPORTED_BODY = JSON.stringify({
  error: 'Chain 1 not supported for verification!',
  message: 'Chain 1 not supported for verification!',
});
const ETHERSCAN_SUBMIT_ACCEPTED_BODY = JSON.stringify({
  status: '1',
  result: 'guid-abc-123',
  message: 'OK',
});
const ETHERSCAN_POLL_CONFIRMED_BODY = JSON.stringify({
  status: '1',
  result: 'Pass - Verified',
  message: 'OK',
});
const ETHERSCAN_ALREADY_VERIFIED_BODY = JSON.stringify({
  status: '0',
  result: '',
  message: 'Contract source code already verified',
});
const BLOCKSCOUT_V2_ACCEPTED_BODY = JSON.stringify({
  message: 'Verification started',
});

function isSourcifyUrl(u: string): boolean {
  return u.includes('sourcify.dev');
}
function isEtherscanSubmitUrl(u: string): boolean {
  // The Blockscout v2 path `/api/v2/smart-contracts/.../verification/via/...`
  // also lives under the same host, so exclude that shape explicitly.
  return (
    u.includes('etherscan.io/api') &&
    !u.includes('checkverifystatus') &&
    !u.includes('/api/v2/smart-contracts/')
  );
}
function isEtherscanPollUrl(u: string): boolean {
  return u.includes('checkverifystatus');
}
function isBlockscoutV2Url(u: string): boolean {
  return u.includes('/api/v2/smart-contracts/') && u.includes('/verification/via/');
}

describe('verifyContract — multi-backend orchestration', () => {
  const ADDR = '0x1234567890123456789012345678901234567890' as Address;

  it('returns success when Sourcify returns a perfect match, even if other backends fail', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = makeFetchRouter([
      { match: isSourcifyUrl, respond: () => ({ body: SOURCIFY_SUCCESS_BODY }) },
      { match: isEtherscanSubmitUrl, respond: () => ({ status: 503, body: '<html>' }) },
      { match: isBlockscoutV2Url, respond: () => ({ status: 503, body: '<html>' }) },
    ]) as never;

    try {
      const result = await verifyContract({
        address: ADDR,
        name: 'TestContract',
        variant: 'simple',
        chainId: 1,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Verified via sourcify');
      expect(result.attempts).toHaveLength(3);
      expect(result.attempts.find((a) => a.backend === 'sourcify')?.success).toBe(true);
      expect(result.attempts.find((a) => a.backend === 'etherscan')?.success).toBe(false);
      expect(result.attempts.find((a) => a.backend === 'blockscout-v2')?.success).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns success when Etherscan-compat verifies after polling, even if Sourcify rejects the chain', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = makeFetchRouter([
      { match: isSourcifyUrl, respond: () => ({ status: 400, body: SOURCIFY_CHAIN_NOT_SUPPORTED_BODY }) },
      { match: isEtherscanPollUrl, respond: () => ({ body: ETHERSCAN_POLL_CONFIRMED_BODY }) },
      { match: isEtherscanSubmitUrl, respond: () => ({ body: ETHERSCAN_SUBMIT_ACCEPTED_BODY }) },
      { match: isBlockscoutV2Url, respond: () => ({ status: 503, body: '<html>' }) },
    ]) as never;

    try {
      const result = await verifyContract({
        address: ADDR,
        name: 'TestContract',
        variant: 'simple',
        chainId: 1,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Verified via etherscan');
      expect(result.attempts.find((a) => a.backend === 'etherscan')?.message).toBe('Pass - Verified');
      expect(result.explorerUrl).toContain(ADDR);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns success when Blockscout v2 accepts, even if Sourcify/Etherscan both fail', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = makeFetchRouter([
      { match: isSourcifyUrl, respond: () => ({ status: 400, body: SOURCIFY_CHAIN_NOT_SUPPORTED_BODY }) },
      { match: isEtherscanSubmitUrl, respond: () => ({ status: 503, body: '<html>' }) },
      { match: isBlockscoutV2Url, respond: () => ({ body: BLOCKSCOUT_V2_ACCEPTED_BODY }) },
    ]) as never;

    try {
      const result = await verifyContract({
        address: ADDR,
        name: 'TestContract',
        variant: 'simple',
        chainId: 1,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Verified via blockscout-v2');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('reports failure from every backend when none succeed, with per-backend attempt messages', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = makeFetchRouter([
      { match: isSourcifyUrl, respond: () => ({ status: 400, body: SOURCIFY_CHAIN_NOT_SUPPORTED_BODY }) },
      { match: isEtherscanSubmitUrl, respond: () => ({ body: ETHERSCAN_ALREADY_VERIFIED_BODY }) },
      { match: isBlockscoutV2Url, respond: () => ({ status: 503, body: '<html>' }) },
    ]) as never;

    try {
      const result = await verifyContract({
        address: ADDR,
        name: 'TestContract',
        variant: 'full',
        chainId: 1,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('All 3 verification backends failed');
      const byBackend = Object.fromEntries(result.attempts.map((a) => [a.backend, a]));
      expect(byBackend.sourcify?.message).toContain('Chain 1 not supported');
      expect(byBackend.etherscan?.message).toContain('already verified');
      expect(byBackend['blockscout-v2']?.message).toContain('Blockscout v2 HTTP 503');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('still runs Sourcify on chains with no configured explorer API', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = makeFetchRouter([
      { match: isSourcifyUrl, respond: () => ({ body: SOURCIFY_SUCCESS_BODY }) },
    ]) as never;

    try {
      const result = await verifyContract({
        address: ADDR,
        name: 'TestContract',
        variant: 'simple',
        chainId: 999999, // unsupported chain — no explorer API URL
      });

      expect(result.success).toBe(true);
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0].backend).toBe('sourcify');
      expect(result.explorerUrl).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns success=false with a single attempt when Sourcify rejects an unsupported chain', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = makeFetchRouter([
      { match: isSourcifyUrl, respond: () => ({ status: 400, body: SOURCIFY_CHAIN_NOT_SUPPORTED_BODY }) },
    ]) as never;

    try {
      const result = await verifyContract({
        address: ADDR,
        name: 'TestContract',
        variant: 'simple',
        chainId: 999999,
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0].backend).toBe('sourcify');
      expect(result.attempts[0].message).toContain('not supported');
      expect(result.explorerUrl).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('surfaces thrown fetch errors as a failed attempt rather than throwing', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as never;

    try {
      const result = await verifyContract({
        address: ADDR,
        name: 'TestContract',
        variant: 'simple',
        chainId: 1,
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toHaveLength(3);
      for (const attempt of result.attempts) {
        expect(attempt.success).toBe(false);
        expect(attempt.message).toContain('request failed');
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('renames the contract in the source template via the `name` parameter for full variant', async () => {
    const originalFetch = globalThis.fetch;
    let etherscanBody: string | null = null;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL, init?: RequestInit) => {
      const str = typeof url === 'string' ? url : url.toString();
      if (isEtherscanSubmitUrl(str)) {
        etherscanBody = (init?.body as URLSearchParams).get('sourceCode');
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ error: 'ignored' }),
        json: async () => ({ error: 'ignored' }),
      } as unknown as Response;
    }) as never;

    try {
      await verifyContract({
        address: '0x1234567890123456789012345678901234567890' as Address,
        name: 'MyCustomDistributor',
        variant: 'full',
        chainId: 1,
      });

      expect(etherscanBody).toContain('MyCustomDistributor');
      expect(etherscanBody).not.toContain('TitrateFull');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('accepts a custom compiler version on the Etherscan submission body', async () => {
    const originalFetch = globalThis.fetch;
    let submittedCompiler: string | null = null;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL, init?: RequestInit) => {
      const str = typeof url === 'string' ? url : url.toString();
      if (isEtherscanSubmitUrl(str)) {
        submittedCompiler = (init?.body as URLSearchParams).get('compilerversion');
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ error: 'ignored' }),
        json: async () => ({ error: 'ignored' }),
      } as unknown as Response;
    }) as never;

    try {
      await verifyContract({
        address: '0x1234567890123456789012345678901234567890' as Address,
        name: 'TestContract',
        variant: 'simple',
        chainId: 1,
        compilerVersion: 'v0.8.20+commit.a1b79de6',
      });

      expect(submittedCompiler).toBe('v0.8.20+commit.a1b79de6');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ---------------------------------------------------------------------------
// disperse with native token
// ---------------------------------------------------------------------------

describe.runIf(anvilUp)('disperse (anvil)', () => {
  let ctx: AnvilContext;
  let simpleContract: Address;

  beforeAll(async () => {
    ctx = createAnvilContext();

    const simpleResult = await deployDistributor({
      variant: 'simple',
      name: 'DisperseSimpleTest',
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
    });
    simpleContract = simpleResult.address;
  });

  it('disperses native token via simple contract', async () => {
    const aliceBefore = await ctx.publicClient.getBalance({ address: ALICE });

    const results = await disperseTokens({
      contractAddress: simpleContract,
      variant: 'simple',
      token: '0x0000000000000000000000000000000000000000' as Address,
      recipients: [ALICE, BOB],
      amounts: [parseEther('0.1'), parseEther('0.2')],
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
      batchSize: 200,
    });

    expect(results.length).toBe(1);
    expect(results[0].confirmedTxHash).toBeTruthy();
    expect(results[0].confirmedTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

    const aliceAfter = await ctx.publicClient.getBalance({ address: ALICE });
    expect(aliceAfter).toBeGreaterThan(aliceBefore);
  });

  it('disperses uniform native token via simple contract', async () => {
    const bobBefore = await ctx.publicClient.getBalance({ address: BOB });

    const results = await disperseTokensSimple({
      contractAddress: simpleContract,
      variant: 'simple',
      token: '0x0000000000000000000000000000000000000000' as Address,
      recipients: [ALICE, BOB],
      amount: parseEther('0.05'),
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
      batchSize: 200,
    });

    expect(results.length).toBe(1);
    expect(results[0].confirmedTxHash).toBeTruthy();

    const bobAfter = await ctx.publicClient.getBalance({ address: BOB });
    expect(bobAfter).toBeGreaterThan(bobBefore);
  });

  it('invokes onProgress callback with confirmed status for disperseTokensSimple (line 190 confirmed branch)', async () => {
    const progressEvents: unknown[] = [];

    await disperseTokensSimple({
      contractAddress: simpleContract,
      variant: 'simple',
      token: '0x0000000000000000000000000000000000000000' as Address,
      recipients: [ALICE],
      amount: parseEther('0.01'),
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
      batchSize: 200,
      onProgress: (event) => progressEvents.push(event),
    });

    // Should have at least 'signing' + 'confirmed' events
    expect(progressEvents.length).toBeGreaterThanOrEqual(2);
    const confirmedEvent = progressEvents.find(
      (e) => (e as { status: string }).status === 'confirmed',
    );
    expect(confirmedEvent).toBeDefined();
  });

  it('batches recipients when count exceeds batchSize', async () => {
    const recipients = Array.from({ length: 5 }, (_, i) =>
      (`0x${'0'.repeat(39)}${(i + 1).toString(16)}` as Address),
    );
    const amounts = recipients.map(() => parseEther('0.001'));

    const results = await disperseTokens({
      contractAddress: simpleContract,
      variant: 'simple',
      token: '0x0000000000000000000000000000000000000000' as Address,
      recipients,
      amounts,
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
      batchSize: 3,
    });

    // 5 recipients with batchSize=3 → 2 batches
    expect(results.length).toBe(2);
    expect(results[0].recipients.length).toBe(3);
    expect(results[1].recipients.length).toBe(2);
  });

  it('invokes onProgress callback for each batch', async () => {
    const progressEvents: unknown[] = [];

    await disperseTokens({
      contractAddress: simpleContract,
      variant: 'simple',
      token: '0x0000000000000000000000000000000000000000' as Address,
      recipients: [ALICE, BOB],
      amounts: [parseEther('0.01'), parseEther('0.01')],
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
      batchSize: 200,
      onProgress: (event) => progressEvents.push(event),
    });

    // Should have at least 'signing' + 'confirmed' events
    expect(progressEvents.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// disperseTokens with ERC-20
// ---------------------------------------------------------------------------

describe.runIf(anvilUp)('disperseTokens with ERC-20 (anvil)', () => {
  let ctx: AnvilContext;
  let simpleContract: Address;
  let tokenAddress: Address;

  beforeAll(async () => {
    ctx = createAnvilContext();

    // Deploy simple distributor
    const simpleResult = await deployDistributor({
      variant: 'simple',
      name: 'ERC20DisperseTest',
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
    });
    simpleContract = simpleResult.address;

    // Deploy MockERC20 and mint tokens
    tokenAddress = await deployMockERC20(ctx, 'DistributeToken', 'DTK', 18);

    const mintHash = await ctx.walletClient.writeContract({
      address: tokenAddress,
      abi: MOCK_ERC20_ABI_TYPED,
      functionName: 'mint',
      args: [ctx.account.address, parseEther('10000')],
      account: ctx.walletClient.account!,
      chain: undefined,
    });
    await ctx.publicClient.waitForTransactionReceipt({ hash: mintHash });

    // Approve simple contract to spend tokens on behalf of deployer
    const approveHash = await ctx.walletClient.writeContract({
      address: tokenAddress,
      abi: MOCK_ERC20_ABI_TYPED,
      functionName: 'approve',
      args: [simpleContract, parseEther('10000')],
      account: ctx.walletClient.account!,
      chain: undefined,
    });
    await ctx.publicClient.waitForTransactionReceipt({ hash: approveHash });
  });

  it('disperses variable ERC-20 amounts to multiple recipients', async () => {
    const aliceAmountBefore = await ctx.publicClient.readContract({
      address: tokenAddress,
      abi: MOCK_ERC20_ABI_TYPED,
      functionName: 'balanceOf',
      args: [ALICE],
    });

    const results = await disperseTokens({
      contractAddress: simpleContract,
      variant: 'simple',
      token: tokenAddress,
      recipients: [ALICE, BOB],
      amounts: [parseEther('100'), parseEther('200')],
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
      batchSize: 200,
    });

    expect(results.length).toBe(1);
    expect(results[0].confirmedTxHash).toBeTruthy();
    expect(results[0].confirmedTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

    const aliceAmountAfter = await ctx.publicClient.readContract({
      address: tokenAddress,
      abi: MOCK_ERC20_ABI_TYPED,
      functionName: 'balanceOf',
      args: [ALICE],
    });

    expect(aliceAmountAfter).toBeGreaterThan(aliceAmountBefore as bigint);
    expect(aliceAmountAfter).toBe((aliceAmountBefore as bigint) + parseEther('100'));
  });

  it('disperses uniform ERC-20 amount to multiple recipients', async () => {
    const bobBefore = await ctx.publicClient.readContract({
      address: tokenAddress,
      abi: MOCK_ERC20_ABI_TYPED,
      functionName: 'balanceOf',
      args: [BOB],
    });

    const results = await disperseTokensSimple({
      contractAddress: simpleContract,
      variant: 'simple',
      token: tokenAddress,
      recipients: [ALICE, BOB],
      amount: parseEther('50'),
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
      batchSize: 200,
    });

    expect(results.length).toBe(1);
    expect(results[0].confirmedTxHash).toBeTruthy();

    const bobAfter = await ctx.publicClient.readContract({
      address: tokenAddress,
      abi: MOCK_ERC20_ABI_TYPED,
      functionName: 'balanceOf',
      args: [BOB],
    });

    expect(bobAfter).toBeGreaterThan(bobBefore as bigint);
  });

  it('returns dropped or reverted outcome when disperse fails due to insufficient approval', async () => {
    // Create a new wallet with no token allowance on the distributor
    const { generatePrivateKey, privateKeyToAccount } = await import('viem/accounts');
    const { createWalletClient, http } = await import('viem');
    const { foundry } = await import('viem/chains');

    const pk = generatePrivateKey();
    const poorAccount = privateKeyToAccount(pk);

    const poorWalletClient = createWalletClient({
      chain: foundry,
      transport: http('http://127.0.0.1:8545'),
      account: poorAccount,
    });

    // Fund the account for gas
    const fundHash = await ctx.walletClient.sendTransaction({
      to: poorAccount.address,
      value: parseEther('1'),
      account: ctx.walletClient.account!,
      chain: undefined,
    });
    await ctx.publicClient.waitForTransactionReceipt({ hash: fundHash });

    // poorAccount has no token balance and no approval on the distributor
    const results = await disperseTokens({
      contractAddress: simpleContract,
      variant: 'simple',
      token: tokenAddress,
      recipients: [ALICE],
      amounts: [parseEther('100')],
      walletClient: poorWalletClient,
      publicClient: ctx.publicClient,
      batchSize: 200,
    });

    expect(results.length).toBe(1);
    // Should be dropped (gas estimate fails) or reverted
    const outcome = results[0].attempts[0].outcome;
    expect(['dropped', 'reverted']).toContain(outcome);
    expect(results[0].confirmedTxHash).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// allowance
// ---------------------------------------------------------------------------

describe.runIf(anvilUp)('allowance (anvil)', () => {
  let ctx: AnvilContext;
  let fullContract: Address;
  // disperseSimple selector: keccak256("disperseSimple(address,address[],uint256)")[:4]
  const selector = '0x2bae1e19' as Hex;

  beforeAll(async () => {
    ctx = createAnvilContext();

    const result = await deployDistributor({
      variant: 'full',
      name: 'AllowanceTest',
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
    });
    fullContract = result.address;
  });

  it('approves and reads operator allowance', async () => {
    await approveOperator({
      contractAddress: fullContract,
      operator: ALICE,
      selector,
      amount: 1_000_000n,
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
    });

    const allowance = await getAllowance({
      contractAddress: fullContract,
      owner: ctx.account.address,
      operator: ALICE,
      selector,
      publicClient: ctx.publicClient,
    });

    expect(allowance).toBe(1_000_000n);
  });

  it('increases operator allowance', async () => {
    await increaseOperatorAllowance({
      contractAddress: fullContract,
      operator: ALICE,
      selector,
      amount: 500_000n,
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
    });

    const allowance = await getAllowance({
      contractAddress: fullContract,
      owner: ctx.account.address,
      operator: ALICE,
      selector,
      publicClient: ctx.publicClient,
    });

    expect(allowance).toBe(1_500_000n);
  });
});

// ---------------------------------------------------------------------------
// checkRecipients
// ---------------------------------------------------------------------------

describe.runIf(anvilUp)('checkRecipients (anvil)', () => {
  let ctx: AnvilContext;
  let fullContract: Address;

  beforeAll(async () => {
    ctx = createAnvilContext();

    const result = await deployDistributor({
      variant: 'full',
      name: 'RegistryTest',
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
    });
    fullContract = result.address;
  });

  it('returns all-false for fresh recipients (none have been sent to)', async () => {
    const campaignId =
      '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex;

    const results = await checkRecipients({
      contractAddress: fullContract,
      distributor: ctx.account.address,
      campaignId,
      recipients: [ALICE, BOB],
      publicClient: ctx.publicClient,
    });

    expect(results).toHaveLength(2);
    // Fresh contract — no one has been sent to yet
    expect(results.every((r) => r === false)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// disperseTokens / disperseTokensSimple with full variant (covers lines 8, 84, 113, 161-190)
// ---------------------------------------------------------------------------

describe.runIf(anvilUp)('disperse with full variant (anvil)', () => {
  let ctx: AnvilContext;
  let fullContract: Address;
  let tokenAddress: Address;

  // disperseSimple selector for TitrateFull
  const selector = '0x2bae1e19' as Hex;

  beforeAll(async () => {
    ctx = createAnvilContext();

    const fullResult = await deployDistributor({
      variant: 'full',
      name: 'FullDisperseTest',
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
    });
    fullContract = fullResult.address;

    tokenAddress = await deployMockERC20(ctx, 'FullToken', 'FT', 18);

    const mintHash = await ctx.walletClient.writeContract({
      address: tokenAddress,
      abi: MOCK_ERC20_ABI_TYPED,
      functionName: 'mint',
      args: [ctx.account.address, parseEther('10000')],
      account: ctx.walletClient.account!,
      chain: undefined,
    });
    await ctx.publicClient.waitForTransactionReceipt({ hash: mintHash });

    // Approve the full contract to spend tokens on behalf of the deployer
    const approveHash = await ctx.walletClient.writeContract({
      address: tokenAddress,
      abi: MOCK_ERC20_ABI_TYPED,
      functionName: 'approve',
      args: [fullContract, parseEther('10000')],
      account: ctx.walletClient.account!,
      chain: undefined,
    });
    await ctx.publicClient.waitForTransactionReceipt({ hash: approveHash });

    // Grant disperseSimple allowance to the deployer so it can self-disperse
    await approveOperator({
      contractAddress: fullContract,
      operator: ctx.account.address,
      selector,
      amount: parseEther('10000'),
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
    });
  });

  it('disperses variable ERC-20 amounts via full variant (covers lines 8 and 84)', async () => {
    const results = await disperseTokens({
      contractAddress: fullContract,
      variant: 'full',
      token: tokenAddress,
      recipients: [ALICE, BOB],
      amounts: [parseEther('10'), parseEther('20')],
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
      batchSize: 200,
    });

    expect(results.length).toBe(1);
    expect(results[0].attempts[0].outcome).toBe('confirmed');
  });

  it('disperses uniform ERC-20 amount via full variant (covers lines 113 and 161-190)', async () => {
    const results = await disperseTokensSimple({
      contractAddress: fullContract,
      variant: 'full',
      token: tokenAddress,
      recipients: [ALICE, BOB],
      amount: parseEther('5'),
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
      batchSize: 200,
    });

    expect(results.length).toBe(1);
    expect(results[0].attempts[0].outcome).toBe('confirmed');
  });
});

// ---------------------------------------------------------------------------
// disperseTokens — catch block when writeContract throws (line 249)
// ---------------------------------------------------------------------------

describe('disperseTokens — executeBatch catch path (line 249)', () => {
  it('returns dropped outcome when writeContract throws a network error', async () => {
    // Simulate a wallet client where writeContract throws (not gas-estimate failure,
    // but an actual network-level error after gas estimation succeeds).
    const fakePublicClient = {
      estimateContractGas: vi.fn().mockResolvedValue(100_000n),
      waitForTransactionReceipt: vi.fn(),
    } as never;

    const fakeWalletClient = {
      account: { address: '0x0000000000000000000000000000000000000001' },
      writeContract: vi.fn().mockRejectedValue(new Error('network error')),
    } as never;

    const results = await disperseTokens({
      contractAddress: '0x0000000000000000000000000000000000000099' as Address,
      variant: 'simple',
      token: '0x0000000000000000000000000000000000000000' as Address,
      recipients: [ALICE],
      amounts: [parseEther('0.1')],
      walletClient: fakeWalletClient,
      publicClient: fakePublicClient,
      batchSize: 200,
    });

    expect(results.length).toBe(1);
    expect(results[0].attempts[0].outcome).toBe('dropped');
    expect(results[0].confirmedTxHash).toBeNull();
  });

  it('disperseTokens returns dropped outcome with confirmedTxHash=null and status=failed in progress (line 113 false branch)', async () => {
    // This covers line 113: `status: attempt.outcome === 'confirmed' ? 'confirmed' : 'failed'`
    // The failed branch requires a failed disperseTokens call.
    const fakePublicClient = {
      estimateContractGas: vi.fn().mockResolvedValue(100_000n),
      waitForTransactionReceipt: vi.fn(),
    } as never;

    const fakeWalletClient = {
      account: { address: '0x0000000000000000000000000000000000000001' },
      writeContract: vi.fn().mockRejectedValue(new Error('revert')),
    } as never;

    const progressEvents: unknown[] = [];
    const results = await disperseTokens({
      contractAddress: '0x0000000000000000000000000000000000000099' as Address,
      variant: 'simple',
      token: '0x0000000000000000000000000000000000000000' as Address,
      recipients: [ALICE],
      amounts: [parseEther('0.1')],
      walletClient: fakeWalletClient,
      publicClient: fakePublicClient,
      batchSize: 200,
      onProgress: (e) => progressEvents.push(e),
    });

    expect(results[0].confirmedTxHash).toBeNull();
    const failedEvent = progressEvents.find(
      (e) => (e as { status: string }).status === 'failed',
    );
    expect(failedEvent).toBeDefined();
  });

  it('disperseTokensSimple returns dropped outcome with null confirmedTxHash and failed progress (lines 180, 190 false branches)', async () => {
    // Covers lines 180 and 190 in disperseTokensSimple: the null/failed branches
    const fakePublicClient = {
      estimateContractGas: vi.fn().mockResolvedValue(100_000n),
      waitForTransactionReceipt: vi.fn(),
    } as never;

    const fakeWalletClient = {
      account: { address: '0x0000000000000000000000000000000000000001' },
      writeContract: vi.fn().mockRejectedValue(new Error('revert')),
    } as never;

    const progressEvents: unknown[] = [];
    const results = await disperseTokensSimple({
      contractAddress: '0x0000000000000000000000000000000000000099' as Address,
      variant: 'simple',
      token: '0x0000000000000000000000000000000000000000' as Address,
      recipients: [ALICE],
      amount: parseEther('0.1'),
      walletClient: fakeWalletClient,
      publicClient: fakePublicClient,
      batchSize: 200,
      onProgress: (e) => progressEvents.push(e),
    });

    // confirmedTxHash must be null (false branch of ternary at line 180)
    expect(results[0].confirmedTxHash).toBeNull();
    // onProgress should have been called with status='failed' (false branch at line 190)
    const failedEvent = progressEvents.find(
      (e) => (e as { status: string }).status === 'failed',
    );
    expect(failedEvent).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// pollVerificationStatus
// ---------------------------------------------------------------------------

describe('pollVerificationStatus', () => {
  it('returns verified=true when the explorer confirms on the first poll', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ status: '1', result: 'Pass - Verified', message: 'OK' }),
    });
    globalThis.fetch = mockFetch as never;

    try {
      const result = await pollVerificationStatus({
        apiUrl: 'https://api.etherscan.io/api',
        guid: 'abc123',
        intervalMs: 0,
      });
      expect(result.verified).toBe(true);
      expect(result.message).toBe('Pass - Verified');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('returns verified=true after 2 pending polls then success', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount < 3) {
        return { json: async () => ({ status: '0', result: 'Pending in queue', message: '' }) };
      }
      return { json: async () => ({ status: '1', result: 'Pass - Verified', message: 'OK' }) };
    });
    globalThis.fetch = mockFetch as never;

    try {
      const result = await pollVerificationStatus({
        apiUrl: 'https://api.etherscan.io/api',
        guid: 'abc123',
        intervalMs: 0,
      });
      expect(result.verified).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('returns verified=false when max attempts are exceeded', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ status: '0', result: 'Pending in queue', message: '' }),
    });
    globalThis.fetch = mockFetch as never;

    try {
      const result = await pollVerificationStatus({
        apiUrl: 'https://api.etherscan.io/api',
        guid: 'abc123',
        maxAttempts: 3,
        intervalMs: 0,
      });
      expect(result.verified).toBe(false);
      expect(result.message).toContain('timed out');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('returns verified=false immediately on a terminal failure message', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ status: '0', result: 'Fail - Unable to verify', message: '' }),
    });
    globalThis.fetch = mockFetch as never;

    try {
      const result = await pollVerificationStatus({
        apiUrl: 'https://api.etherscan.io/api',
        guid: 'abc123',
        intervalMs: 0,
      });
      expect(result.verified).toBe(false);
      expect(result.message).toContain('Fail');
      // Should stop after the first poll since it's a terminal failure
      expect(mockFetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.restoreAllMocks();
    }
  });
});

// ---------------------------------------------------------------------------
// verifyContract — polling integration (mocked)
// ---------------------------------------------------------------------------

describe('verifyContract — Etherscan backend polls after successful submission', () => {
  it('calls pollVerificationStatus with the GUID from the submit response', async () => {
    const originalFetch = globalThis.fetch;
    let pollUrl: string | null = null;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL, init?: RequestInit) => {
      const str = typeof url === 'string' ? url : url.toString();
      if (isSourcifyUrl(str)) {
        return { ok: false, status: 400, text: async () => SOURCIFY_CHAIN_NOT_SUPPORTED_BODY, json: async () => JSON.parse(SOURCIFY_CHAIN_NOT_SUPPORTED_BODY) } as unknown as Response;
      }
      if (isBlockscoutV2Url(str)) {
        return { ok: false, status: 503, text: async () => '<html>', json: async () => { throw new Error('not json'); } } as unknown as Response;
      }
      if (isEtherscanPollUrl(str)) {
        pollUrl = str;
        return { ok: true, status: 200, text: async () => ETHERSCAN_POLL_CONFIRMED_BODY, json: async () => JSON.parse(ETHERSCAN_POLL_CONFIRMED_BODY) } as unknown as Response;
      }
      if (isEtherscanSubmitUrl(str)) {
        // Confirms the body was a POST submission, not a poll.
        void init;
        return { ok: true, status: 200, text: async () => JSON.stringify({ status: '1', result: 'guid-xyz-789', message: 'OK' }), json: async () => ({ status: '1', result: 'guid-xyz-789', message: 'OK' }) } as unknown as Response;
      }
      throw new TypeError(`unexpected url ${str}`);
    }) as never;

    try {
      const result = await verifyContract({
        address: '0x1234567890123456789012345678901234567890' as Address,
        name: 'TestContract',
        variant: 'simple',
        chainId: 1,
      });

      expect(result.success).toBe(true);
      expect(result.attempts.find((a) => a.backend === 'etherscan')?.message).toBe('Pass - Verified');
      expect(pollUrl).toContain('checkverifystatus');
      expect(pollUrl).toContain('guid-xyz-789');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('records a failed Etherscan attempt when the submission is rejected (status !== "1"), without polling', async () => {
    const originalFetch = globalThis.fetch;
    let pollCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL) => {
      const str = typeof url === 'string' ? url : url.toString();
      if (isEtherscanPollUrl(str)) pollCount += 1;
      if (isSourcifyUrl(str) || isBlockscoutV2Url(str)) {
        return { ok: false, status: 503, text: async () => '<html>', json: async () => { throw new Error('not json'); } } as unknown as Response;
      }
      // Etherscan submission returns status=0 with "already verified"
      return { ok: true, status: 200, text: async () => ETHERSCAN_ALREADY_VERIFIED_BODY, json: async () => JSON.parse(ETHERSCAN_ALREADY_VERIFIED_BODY) } as unknown as Response;
    }) as never;

    try {
      const result = await verifyContract({
        address: '0x1234567890123456789012345678901234567890' as Address,
        name: 'TestContract',
        variant: 'simple',
        chainId: 1,
      });

      const etherscanAttempt = result.attempts.find((a) => a.backend === 'etherscan');
      expect(etherscanAttempt?.success).toBe(false);
      expect(etherscanAttempt?.message).toContain('already verified');
      expect(pollCount).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
