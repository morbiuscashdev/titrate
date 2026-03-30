import type { Address, PublicClient } from 'viem';
import { parseEther } from 'viem';
import type { FilterType, ProgressCallback } from '../types.js';
import { getAddressProperties } from '../scanner/properties.js';
import { scanTransferEvents } from '../scanner/logs.js';

export type FilterParams = Record<string, unknown>;

export type FilterExecutor = (
  addresses: Set<Address>,
  rpc?: PublicClient,
  onProgress?: ProgressCallback,
) => Promise<Set<Address>>;

/** Factory that maps a filter type to its async executor. */
export function createFilter(filterType: FilterType, params: FilterParams): FilterExecutor {
  switch (filterType) {
    case 'contract-check':
      return contractCheckFilter();
    case 'min-balance':
      return minBalanceFilter(params);
    case 'nonce-range':
      return nonceRangeFilter(params);
    case 'token-recipients':
      return tokenRecipientsFilter(params);
    case 'csv-exclusion':
      return csvExclusionFilter(params);
    case 'previously-sent':
      return previouslySentFilter(params);
    case 'registry-check':
      return registryCheckFilter(params);
    default:
      throw new Error(`Unknown filter type: ${filterType}`);
  }
}

function contractCheckFilter(): FilterExecutor {
  return async (addresses, rpc, onProgress) => {
    if (!rpc) throw new Error('contract-check filter requires an RPC client');
    const result = new Set<Address>();
    const addressArray = [...addresses];

    for await (const batch of getAddressProperties(rpc, addressArray, {
      properties: ['code'],
      concurrency: 100,
    })) {
      for (const props of batch) {
        if (!props.isContract) result.add(props.address);
      }
    }

    onProgress?.({
      type: 'filter',
      filterName: 'contract-check',
      inputCount: addresses.size,
      outputCount: result.size,
    });
    return result;
  };
}

function minBalanceFilter(params: FilterParams): FilterExecutor {
  const minBalance = parseEther(params.minBalance as string);
  const blockNumber = params.blockNumber
    ? BigInt(params.blockNumber as string | number)
    : undefined;

  return async (addresses, rpc, onProgress) => {
    if (!rpc) throw new Error('min-balance filter requires an RPC client');
    const result = new Set<Address>();
    const addressArray = [...addresses];

    for await (const batch of getAddressProperties(rpc, addressArray, {
      properties: ['balance'],
      blockNumber,
      concurrency: 100,
    })) {
      for (const props of batch) {
        if (props.balance !== undefined && props.balance >= minBalance) {
          result.add(props.address);
        }
      }
    }

    onProgress?.({
      type: 'filter',
      filterName: 'min-balance',
      inputCount: addresses.size,
      outputCount: result.size,
    });
    return result;
  };
}

function nonceRangeFilter(params: FilterParams): FilterExecutor {
  const minNonce = (params.minNonce as number) ?? 1;
  const maxNonce = (params.maxNonce as number) ?? 1000;

  return async (addresses, rpc, onProgress) => {
    if (!rpc) throw new Error('nonce-range filter requires an RPC client');
    const result = new Set<Address>();
    const addressArray = [...addresses];

    for await (const batch of getAddressProperties(rpc, addressArray, {
      properties: ['nonce'],
      concurrency: 100,
    })) {
      for (const props of batch) {
        if (
          props.nonce !== undefined &&
          props.nonce >= minNonce &&
          props.nonce <= maxNonce
        ) {
          result.add(props.address);
        }
      }
    }

    onProgress?.({
      type: 'filter',
      filterName: 'nonce-range',
      inputCount: addresses.size,
      outputCount: result.size,
    });
    return result;
  };
}

function tokenRecipientsFilter(params: FilterParams): FilterExecutor {
  const token = (params.token as string).toLowerCase() as Address;
  const startBlock = BigInt(params.startBlock as string | number);
  const endBlock = BigInt(params.endBlock as string | number);

  return async (addresses, rpc, onProgress) => {
    if (!rpc) throw new Error('token-recipients filter requires an RPC client');
    const recipients = new Set<string>();

    for await (const batch of scanTransferEvents(rpc, token, {
      startBlock,
      endBlock,
      onProgress,
    })) {
      for (const addr of batch) recipients.add(addr.toLowerCase());
    }

    const result = new Set<Address>();
    for (const addr of addresses) {
      if (!recipients.has(addr.toLowerCase())) result.add(addr);
    }

    onProgress?.({
      type: 'filter',
      filterName: 'token-recipients',
      inputCount: addresses.size,
      outputCount: result.size,
    });
    return result;
  };
}

function csvExclusionFilter(params: FilterParams): FilterExecutor {
  const exclusionList = new Set(
    (params.addresses as string[]).map((a) => a.toLowerCase()),
  );

  return async (addresses, _rpc, onProgress) => {
    const result = new Set<Address>();
    for (const addr of addresses) {
      if (!exclusionList.has(addr.toLowerCase())) result.add(addr);
    }
    onProgress?.({
      type: 'filter',
      filterName: 'csv-exclusion',
      inputCount: addresses.size,
      outputCount: result.size,
    });
    return result;
  };
}

function previouslySentFilter(params: FilterParams): FilterExecutor {
  return csvExclusionFilter(params);
}

function registryCheckFilter(_params: FilterParams): FilterExecutor {
  // Requires distributor module — placeholder that passes through
  return async (addresses, _rpc, onProgress) => {
    onProgress?.({
      type: 'filter',
      filterName: 'registry-check',
      inputCount: addresses.size,
      outputCount: addresses.size,
    });
    return addresses;
  };
}
