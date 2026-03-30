import type { Address, PublicClient } from 'viem';
import type {
  SourceType,
  FilterType,
  PipelineConfig,
  PipelineStep,
  ProgressCallback,
} from '../types.js';
import { createSource, type SourceParams } from './sources.js';
import { createFilter, type FilterParams } from './filters.js';

export type Pipeline = {
  addSource(sourceType: SourceType, params: SourceParams): Pipeline;
  addFilter(filterType: FilterType, params: FilterParams): Pipeline;
  serialize(): PipelineConfig;
  execute(rpc?: PublicClient, onProgress?: ProgressCallback): AsyncGenerator<Address[]>;
};

/**
 * Creates a composable pipeline for building and executing address sets.
 * Sources are collected first, then filters are applied in declaration order.
 */
export function createPipeline(config?: PipelineConfig): Pipeline {
  const steps: PipelineStep[] = config ? [...config.steps] : [];

  const pipeline: Pipeline = {
    addSource(sourceType, params) {
      steps.push({ type: 'source', sourceType, params });
      return pipeline;
    },

    addFilter(filterType, params) {
      steps.push({ type: 'filter', filterType, params });
      return pipeline;
    },

    serialize(): PipelineConfig {
      return { steps: [...steps] };
    },

    async *execute(rpc?, onProgress?) {
      // Collect all addresses from sources
      const collected = new Set<Address>();

      for (const step of steps) {
        if (step.type !== 'source') continue;
        const executor = createSource(step.sourceType, step.params);
        for await (const batch of executor(rpc, onProgress)) {
          for (const addr of batch) collected.add(addr.toLowerCase() as Address);
        }
      }

      // Apply filters in order
      let current = collected;
      for (const step of steps) {
        if (step.type !== 'filter') continue;
        const executor = createFilter(step.filterType, step.params);
        current = await executor(current, rpc, onProgress);
      }

      // Yield the final set as a single batch
      yield [...current];
    },
  };

  return pipeline;
}

/** Deserializes a stored pipeline config back into an executable Pipeline. */
export function deserializePipeline(config: PipelineConfig): Pipeline {
  return createPipeline(config);
}
