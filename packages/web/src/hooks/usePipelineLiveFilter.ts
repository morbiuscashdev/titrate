import { useMemo, useRef } from 'react';
import { useChain } from '../providers/ChainProvider.js';
import { createPipeline } from '@titrate/sdk';
import type { Address } from 'viem';
import type { PipelineConfig, PipelineStep, LiveFilter } from '@titrate/sdk';

/**
 * Converts a stored PipelineConfig into a LiveFilter.
 *
 * Runs the pipeline's filter steps against the full recipient list on
 * first invocation and caches the allowed address set. Subsequent calls
 * filter each batch against the cached set in O(1) per address.
 *
 * The pipeline is constructed by injecting a synthetic `csv` source step
 * (containing all recipients) ahead of the config's filter steps. This
 * feeds the addresses through the SDK's standard filter chain without
 * depending on internal APIs.
 *
 * @param config - Pipeline config from IDB (may be null)
 * @param recipients - All loaded recipient addresses
 * @returns A LiveFilter function, or undefined when no filters are configured
 */
export function usePipelineLiveFilter(
  config: PipelineConfig | null,
  recipients: readonly Address[],
): LiveFilter | undefined {
  const { publicClient } = useChain();
  const cachedRef = useRef<Set<string> | null>(null);

  return useMemo(() => {
    if (!config) return undefined;

    const filterSteps = config.steps.filter(
      (s): s is Extract<PipelineStep, { type: 'filter' }> => s.type === 'filter',
    );
    if (filterSteps.length === 0) return undefined;
    if (!publicClient) return undefined;
    if (recipients.length === 0) return undefined;

    // Reset cache when inputs change
    cachedRef.current = null;

    const client = publicClient;
    const allRecipients = [...recipients];

    return async (batchAddresses: readonly Address[]): Promise<readonly Address[]> => {
      // Compute allowed set once on first batch
      if (!cachedRef.current) {
        const csvSource: PipelineStep = {
          type: 'source' as const,
          sourceType: 'csv' as const,
          params: { addresses: allRecipients },
        };

        const pipeline = createPipeline({
          steps: [csvSource, ...filterSteps],
        });

        const allowed: Address[] = [];
        for await (const batch of pipeline.execute(client)) {
          allowed.push(...batch);
        }
        cachedRef.current = new Set(allowed.map((a) => a.toLowerCase()));
      }

      return batchAddresses.filter((addr) =>
        cachedRef.current!.has(addr.toLowerCase()),
      );
    };
  }, [config, publicClient, recipients]);
}
