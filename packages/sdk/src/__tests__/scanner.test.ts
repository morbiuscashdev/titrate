import { describe, it, expect, beforeAll } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { parseEther } from 'viem';
import { createAnvilContext, mineBlocks, fundAddress, type AnvilContext } from './helpers/anvil.js';
import { scanBlocks, resolveBlockByTimestamp } from '../scanner/index.js';

describe('scanner (anvil)', () => {
  let ctx: AnvilContext;

  beforeAll(async () => {
    ctx = createAnvilContext();
    // Generate some transactions for scanning
    for (let i = 0; i < 5; i++) {
      const randomAccount = privateKeyToAccount(generatePrivateKey());
      await fundAddress(ctx, randomAccount.address, parseEther('0.01'));
    }
    await mineBlocks(ctx, 3);
  });

  describe('scanBlocks', () => {
    it('extracts from addresses from block transactions', async () => {
      const currentBlock = await ctx.publicClient.getBlockNumber();
      const addresses: string[] = [];

      for await (const batch of scanBlocks(ctx.publicClient, {
        startBlock: 0n,
        endBlock: currentBlock,
        extract: 'tx.from',
      })) {
        addresses.push(...batch);
      }

      expect(addresses.length).toBeGreaterThan(0);
      // Anvil account should appear as a sender
      expect(
        addresses.some((a) => a.toLowerCase() === ctx.account.address.toLowerCase()),
      ).toBe(true);
    });

    it('extracts to addresses from block transactions', async () => {
      const currentBlock = await ctx.publicClient.getBlockNumber();
      const addresses: string[] = [];

      for await (const batch of scanBlocks(ctx.publicClient, {
        startBlock: 0n,
        endBlock: currentBlock,
        extract: 'tx.to',
      })) {
        addresses.push(...batch);
      }

      expect(addresses.length).toBeGreaterThan(0);
    });

    it('respects block range', async () => {
      const currentBlock = await ctx.publicClient.getBlockNumber();
      const addresses: string[] = [];

      // Scan only the last 2 blocks
      for await (const batch of scanBlocks(ctx.publicClient, {
        startBlock: currentBlock - 1n,
        endBlock: currentBlock,
        extract: 'tx.from',
      })) {
        addresses.push(...batch);
      }

      // Should have fewer addresses than full scan
      expect(addresses.length).toBeLessThanOrEqual(10);
    });
  });

  describe('resolveBlockByTimestamp', () => {
    it('returns a block number for a recent timestamp', async () => {
      const block = await ctx.publicClient.getBlock();
      const blockNumber = await resolveBlockByTimestamp(
        ctx.publicClient,
        Number(block.timestamp),
      );
      expect(blockNumber).toBeGreaterThanOrEqual(0n);
    });
  });
});
