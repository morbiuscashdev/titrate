import { describe, it, expect, beforeAll } from 'vitest';
import { parseEther, type Address } from 'viem';
import type { PipelineConfig } from '../types.js';
import { createPipeline, deserializePipeline } from '../pipeline/index.js';
import { createAnvilContext, fundAddress, type AnvilContext } from './helpers/anvil.js';
import { deployMockERC20 } from './helpers/mock-erc20.js';

// ---------------------------------------------------------------------------
// Pure pipeline construction tests (no Anvil)
// ---------------------------------------------------------------------------

describe('pipeline', () => {
  describe('createPipeline', () => {
    it('creates an empty pipeline', () => {
      const pipeline = createPipeline();
      const config = pipeline.serialize();
      expect(config.steps).toHaveLength(0);
    });

    it('adds a CSV source', () => {
      const pipeline = createPipeline().addSource('csv', {
        addresses: ['0x1234567890abcdef1234567890abcdef12345678'],
      });

      const config = pipeline.serialize();
      expect(config.steps).toHaveLength(1);
      expect(config.steps[0].type).toBe('source');
    });

    it('adds filters', () => {
      const pipeline = createPipeline()
        .addSource('csv', { addresses: ['0x1234567890abcdef1234567890abcdef12345678'] })
        .addFilter('contract-check', {})
        .addFilter('min-balance', { minBalance: '0.05' });

      const config = pipeline.serialize();
      expect(config.steps).toHaveLength(3);
      expect(config.steps[1].type).toBe('filter');
      expect(config.steps[2].type).toBe('filter');
    });
  });

  describe('serialization', () => {
    it('round-trips through serialize/deserialize', () => {
      const pipeline = createPipeline()
        .addSource('csv', { addresses: ['0xabc'] })
        .addFilter('min-balance', { minBalance: '1.0' });

      const config = pipeline.serialize();
      const json = JSON.stringify(config);
      const restored = deserializePipeline(JSON.parse(json) as PipelineConfig);
      const restoredConfig = restored.serialize();

      expect(restoredConfig).toEqual(config);
    });
  });

  describe('CSV source execution', () => {
    it('produces address set from CSV addresses', async () => {
      const pipeline = createPipeline().addSource('csv', {
        addresses: [
          '0x1234567890abcdef1234567890abcdef12345678',
          '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        ],
      });

      const addresses = new Set<string>();
      for await (const batch of pipeline.execute()) {
        for (const addr of batch) addresses.add(addr);
      }

      expect(addresses.size).toBe(2);
    });

    it('deduplicates addresses', async () => {
      const pipeline = createPipeline().addSource('csv', {
        addresses: [
          '0x1234567890abcdef1234567890abcdef12345678',
          '0x1234567890ABCDEF1234567890ABCDEF12345678',
        ],
      });

      const addresses = new Set<string>();
      for await (const batch of pipeline.execute()) {
        for (const addr of batch) addresses.add(addr);
      }

      expect(addresses.size).toBe(1);
    });
  });

  describe('CSV exclusion filter', () => {
    it('removes addresses in exclusion list', async () => {
      const pipeline = createPipeline()
        .addSource('csv', {
          addresses: [
            '0x1234567890abcdef1234567890abcdef12345678',
            '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
            '0x1111111111111111111111111111111111111111',
          ],
        })
        .addFilter('csv-exclusion', {
          addresses: ['0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'],
        });

      const addresses = new Set<string>();
      for await (const batch of pipeline.execute()) {
        for (const addr of batch) addresses.add(addr);
      }

      expect(addresses.size).toBe(2);
      expect(addresses.has('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd')).toBe(false);
    });
  });

  describe('union source', () => {
    it('combines two CSV sources and deduplicates', async () => {
      const pipeline = createPipeline().addSource('union', {
        sources: [
          {
            type: 'csv',
            params: {
              addresses: [
                '0x1111111111111111111111111111111111111111',
                '0x2222222222222222222222222222222222222222',
              ],
            },
          },
          {
            type: 'csv',
            params: {
              addresses: [
                '0x2222222222222222222222222222222222222222', // duplicate
                '0x3333333333333333333333333333333333333333',
              ],
            },
          },
        ],
      });

      const addresses = new Set<string>();
      for await (const batch of pipeline.execute()) {
        for (const addr of batch) addresses.add(addr);
      }

      // 3 unique addresses after deduplication via the pipeline's collected set
      expect(addresses.size).toBe(3);
      expect(addresses.has('0x1111111111111111111111111111111111111111')).toBe(true);
      expect(addresses.has('0x2222222222222222222222222222222222222222')).toBe(true);
      expect(addresses.has('0x3333333333333333333333333333333333333333')).toBe(true);
    });

    it('handles union of three CSV sources', async () => {
      const pipeline = createPipeline().addSource('union', {
        sources: [
          { type: 'csv', params: { addresses: ['0xaaaa000000000000000000000000000000000001'] } },
          { type: 'csv', params: { addresses: ['0xaaaa000000000000000000000000000000000002'] } },
          { type: 'csv', params: { addresses: ['0xaaaa000000000000000000000000000000000003'] } },
        ],
      });

      const addresses = new Set<string>();
      for await (const batch of pipeline.execute()) {
        for (const addr of batch) addresses.add(addr);
      }

      expect(addresses.size).toBe(3);
    });
  });
});

// ---------------------------------------------------------------------------
// On-chain pipeline tests (Anvil)
// ---------------------------------------------------------------------------

describe('pipeline (anvil)', () => {
  let ctx: AnvilContext;
  let contractAddress: Address;

  const ALICE = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address;
  const BOB = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as Address;

  beforeAll(async () => {
    ctx = createAnvilContext();

    // Deploy a real contract to test the contract-check filter
    contractAddress = await deployMockERC20(ctx, 'PipelineToken', 'PT', 18);

    // Fund Alice with enough ETH to pass min-balance tests
    await fundAddress(ctx, ALICE, parseEther('1'));
    // BOB gets no extra funding — minimal balance for min-balance filter tests
  });

  describe('block-scan source', () => {
    it('scans a block range and returns addresses', async () => {
      const currentBlock = await ctx.publicClient.getBlockNumber();

      const pipeline = createPipeline().addSource('block-scan', {
        startBlock: 0,
        endBlock: Number(currentBlock),
        extract: 'tx.from',
      });

      const addresses = new Set<string>();
      for await (const batch of pipeline.execute(ctx.publicClient)) {
        for (const addr of batch) addresses.add(addr);
      }

      expect(addresses.size).toBeGreaterThan(0);
      // Anvil deployer account should have sent transactions
      expect(addresses.has(ctx.account.address.toLowerCase())).toBe(true);
    });

    it('scans tx.to addresses from blocks', async () => {
      const currentBlock = await ctx.publicClient.getBlockNumber();

      const pipeline = createPipeline().addSource('block-scan', {
        startBlock: 0,
        endBlock: Number(currentBlock),
        extract: 'tx.to',
      });

      const addresses = new Set<string>();
      for await (const batch of pipeline.execute(ctx.publicClient)) {
        for (const addr of batch) addresses.add(addr);
      }

      // ALICE should have received funds
      expect(addresses.has(ALICE.toLowerCase())).toBe(true);
    });

    it('throws without an rpc client', async () => {
      const pipeline = createPipeline().addSource('block-scan', {
        startBlock: 0,
        endBlock: 10,
        extract: 'tx.from',
      });

      const iter = pipeline.execute();
      await expect(iter.next()).rejects.toThrow('block-scan source requires an RPC client');
    });
  });

  describe('contract-check filter', () => {
    it('removes contract addresses, keeps EOAs', async () => {
      const pipeline = createPipeline()
        .addSource('csv', {
          addresses: [ALICE, contractAddress],
        })
        .addFilter('contract-check', {});

      const addresses = new Set<string>();
      for await (const batch of pipeline.execute(ctx.publicClient)) {
        for (const addr of batch) addresses.add(addr);
      }

      // Only EOA should remain
      expect(addresses.has(ALICE.toLowerCase())).toBe(true);
      expect(addresses.has(contractAddress.toLowerCase())).toBe(false);
    });

    it('throws without an rpc client', async () => {
      const pipeline = createPipeline()
        .addSource('csv', { addresses: [ALICE] })
        .addFilter('contract-check', {});

      const iter = pipeline.execute();
      await expect(iter.next()).rejects.toThrow('contract-check filter requires an RPC client');
    });
  });

  describe('min-balance filter', () => {
    it('keeps addresses with sufficient balance', async () => {
      const pipeline = createPipeline()
        .addSource('csv', { addresses: [ALICE, BOB] })
        .addFilter('min-balance', { minBalance: '0.5' }); // 0.5 ETH threshold

      const addresses = new Set<string>();
      for await (const batch of pipeline.execute(ctx.publicClient)) {
        for (const addr of batch) addresses.add(addr);
      }

      // Alice was funded with 1 ETH, so she passes
      expect(addresses.has(ALICE.toLowerCase())).toBe(true);
    });

    it('removes addresses below minimum balance', async () => {
      // Use a threshold that only ALICE can pass (she has ~1 ETH from funding),
      // while a fresh zero-balance address cannot.
      const emptyAddress = '0xdead000000000000000000000000000000000001' as Address;

      const pipeline = createPipeline()
        .addSource('csv', { addresses: [ALICE, emptyAddress] })
        .addFilter('min-balance', { minBalance: '0.5' }); // 0.5 ETH threshold

      const addresses = new Set<string>();
      for await (const batch of pipeline.execute(ctx.publicClient)) {
        for (const addr of batch) addresses.add(addr);
      }

      // Only ALICE passes (has ~1 ETH), emptyAddress has no balance
      expect(addresses.has(ALICE.toLowerCase())).toBe(true);
      expect(addresses.has(emptyAddress.toLowerCase())).toBe(false);
      expect(addresses.size).toBe(1);
    });

    it('throws without an rpc client', async () => {
      const pipeline = createPipeline()
        .addSource('csv', { addresses: [ALICE] })
        .addFilter('min-balance', { minBalance: '0.1' });

      const iter = pipeline.execute();
      await expect(iter.next()).rejects.toThrow('min-balance filter requires an RPC client');
    });
  });
});
