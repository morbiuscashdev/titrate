import { describe, it, expect } from 'vitest';
import type { PipelineConfig } from '../types.js';
import { createPipeline, deserializePipeline } from '../pipeline/index.js';

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
});
