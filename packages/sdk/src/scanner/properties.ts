import type { PublicClient, Address } from 'viem';
import pLimit from 'p-limit';
import { withRetry } from '../utils/retry.js';
import { chunk } from '../utils/chunk.js';
import type { ProgressCallback } from '../types.js';

export type PropertyType = 'balance' | 'code' | 'nonce';

export type AddressProperties = {
  readonly address: Address;
  readonly balance?: bigint;
  readonly isContract?: boolean;
  readonly nonce?: number;
};

export type GetPropertiesOptions = {
  readonly properties: readonly PropertyType[];
  readonly blockNumber?: bigint;
  readonly concurrency?: number;
  readonly onProgress?: ProgressCallback;
};

/**
 * Async generator that fetches on-chain properties for a list of addresses.
 * Batches requests with a configurable concurrency limit via p-limit.
 */
export async function* getAddressProperties(
  rpc: PublicClient,
  addresses: readonly Address[],
  options: GetPropertiesOptions,
): AsyncGenerator<AddressProperties[]> {
  const { properties, blockNumber, concurrency = 100 } = options;
  const limit = pLimit(concurrency);
  const batches = chunk(addresses, 1_000);
  let processed = 0;

  for (const batch of batches) {
    const results = await Promise.all(
      batch.map((address) =>
        limit(async (): Promise<AddressProperties> => {
          const props: {
            address: Address;
            balance?: bigint;
            isContract?: boolean;
            nonce?: number;
          } = { address };

          const fetchTasks: Promise<void>[] = [];

          if (properties.includes('balance')) {
            fetchTasks.push(
              withRetry(
                () => rpc.getBalance({ address, blockNumber }),
                `Balance ${address.slice(0, 10)}`,
                { maxRetries: 5, baseDelay: 200 },
              ).then((b) => {
                props.balance = b;
              }),
            );
          }

          if (properties.includes('code')) {
            fetchTasks.push(
              withRetry(
                () => rpc.getCode({ address, blockNumber }),
                `Code ${address.slice(0, 10)}`,
                { maxRetries: 5, baseDelay: 200 },
              ).then((c) => {
                props.isContract = c !== undefined && c !== '0x';
              }),
            );
          }

          if (properties.includes('nonce')) {
            fetchTasks.push(
              withRetry(
                () => rpc.getTransactionCount({ address, blockNumber }),
                `Nonce ${address.slice(0, 10)}`,
                { maxRetries: 5, baseDelay: 200 },
              ).then((n) => {
                props.nonce = n;
              }),
            );
          }

          await Promise.all(fetchTasks);
          return props;
        }),
      ),
    );

    processed += batch.length;
    options.onProgress?.({
      type: 'filter',
      filterName: 'getAddressProperties',
      inputCount: addresses.length,
      outputCount: processed,
    });

    yield results;
  }
}
