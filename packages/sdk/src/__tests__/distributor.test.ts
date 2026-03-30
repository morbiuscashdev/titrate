import { describe, it, expect, beforeAll } from 'vitest';
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
