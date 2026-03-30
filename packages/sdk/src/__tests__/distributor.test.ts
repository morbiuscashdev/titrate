import { describe, it, expect, beforeAll } from 'vitest';
import { parseEther, type Address, type Hex } from 'viem';
import { createAnvilContext, type AnvilContext } from './helpers/anvil.js';
import {
  deployDistributor,
  getContractSourceTemplate,
  disperseTokens,
  disperseTokensSimple,
  approveOperator,
  increaseOperatorAllowance,
  getAllowance,
  checkRecipients,
} from '../distributor/index.js';

// Anvil default accounts #1 and #2
const ALICE = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address;
const BOB = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as Address;

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
});

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
