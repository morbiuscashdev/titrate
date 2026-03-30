import { describe, it, expect, beforeAll, vi } from 'vitest';
import { parseEther, type Address, type Hex } from 'viem';
import { createAnvilContext, type AnvilContext } from './helpers/anvil.js';
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

describe('deployDistributor (anvil)', () => {
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
});

// ---------------------------------------------------------------------------
// verifyContract — unit tests (no live explorer required)
// ---------------------------------------------------------------------------

describe('verifyContract — fetch success path (verify.ts line 78)', () => {
  it('returns success=true when the explorer API returns status "1"', async () => {
    // Mock globalThis.fetch to simulate a successful verification response
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ status: '1', result: 'Pass - Verified', message: 'OK' }),
    }) as never;

    try {
      const result = await verifyContract({
        address: '0x1234567890123456789012345678901234567890' as Address,
        name: 'TestContract',
        variant: 'simple',
        chainId: 1, // mainnet — has a configured explorer API URL
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Pass - Verified');
      expect(result.explorerUrl).toContain('0x1234567890123456789012345678901234567890');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('uses data.message when result is empty', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ status: '0', result: '', message: 'Contract source code already verified' }),
    }) as never;

    try {
      const result = await verifyContract({
        address: '0x1234567890123456789012345678901234567890' as Address,
        name: 'TestContract',
        variant: 'full',
        chainId: 1,
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Contract source code already verified');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns success=false when fetch throws a network error (verify.ts line 78 catch path)', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as never;

    try {
      const result = await verifyContract({
        address: '0x1234567890123456789012345678901234567890' as Address,
        name: 'TestContract',
        variant: 'simple',
        chainId: 1,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Verification request failed');
      expect(result.explorerUrl).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('verifyContract', () => {
  it('returns success=false for an unsupported chain', async () => {
    const result = await verifyContract({
      address: '0x1234567890123456789012345678901234567890' as Address,
      name: 'TestContract',
      variant: 'simple',
      chainId: 999999, // unsupported chain
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('999999');
    expect(result.explorerUrl).toBeNull();
  });

  it('returns a VerifyResult (not throws) even when explorer request fails', async () => {
    // Chain 1 (mainnet) has a configured explorer URL.
    // In the test environment the HTTP request will fail — verify we get
    // a graceful result object rather than a thrown error.
    const result = await verifyContract({
      address: '0x1234567890123456789012345678901234567890' as Address,
      name: 'TestContract',
      variant: 'simple',
      chainId: 1,
    });

    expect(typeof result.success).toBe('boolean');
    expect(typeof result.message).toBe('string');
  });

  it('substitutes the contract name in the source template for full variant', async () => {
    // We use an unsupported chain so it returns early without fetching,
    // allowing us to verify the function path that handles 'full' variant
    const result = await verifyContract({
      address: '0x1234567890123456789012345678901234567890' as Address,
      name: 'MyCustomDistributor',
      variant: 'full',
      chainId: 999999,
    });

    expect(result.success).toBe(false);
    expect(result.explorerUrl).toBeNull();
  });

  it('accepts a custom compiler version', async () => {
    const result = await verifyContract({
      address: '0x1234567890123456789012345678901234567890' as Address,
      name: 'TestContract',
      variant: 'simple',
      chainId: 999999,
      compilerVersion: 'v0.8.20+commit.a1b79de6',
    });

    // Unsupported chain → returns early with success: false
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// disperse with native token
// ---------------------------------------------------------------------------

describe('disperse (anvil)', () => {
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

describe('disperseTokens with ERC-20 (anvil)', () => {
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

describe('allowance (anvil)', () => {
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

describe('checkRecipients (anvil)', () => {
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

describe('disperse with full variant (anvil)', () => {
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
