// packages/sdk/src/trueblocks/status.ts
import type { TrueBlocksClient, TrueBlocksStatus } from './types.js';

type RawStatusData = {
  clientVersion?: string;
  chains?: Array<{ chain?: string; chainId?: number; rpcProvider?: string }>;
  cachePath?: string;
  isReady?: boolean;
};

/**
 * Checks whether a TrueBlocks instance is running and reports chain info.
 * Returns isReady: false on connection failure (does not throw).
 */
export async function getTrueBlocksStatus(
  client: TrueBlocksClient,
): Promise<TrueBlocksStatus> {
  try {
    const data = await client.request<RawStatusData>('/status', { chains: 'true' });
    const status = data[0];
    if (!status) {
      return { isReady: false, clientVersion: '', chainId: 0, rpcProvider: '', cachePath: '' };
    }

    const chain = status.chains?.[0];
    return {
      isReady: status.isReady ?? false,
      clientVersion: status.clientVersion ?? '',
      chainId: chain?.chainId ?? 0,
      rpcProvider: chain?.rpcProvider ?? '',
      cachePath: status.cachePath ?? '',
    };
  } catch {
    return { isReady: false, clientVersion: '', chainId: 0, rpcProvider: '', cachePath: '' };
  }
}
