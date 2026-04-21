import type { Page } from '@playwright/test';
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

/**
 * EIP-1193 provider installed in the Playwright page that bridges every RPC
 * call to a node-side viem wallet client. The provider is announced via
 * EIP-6963 so Reown AppKit picks it up exactly like the mock-wallet helper.
 *
 * Unlike {@link installMockWallet}, this signs and broadcasts for real:
 *   - `eth_signTypedData_v4` / `personal_sign` use the configured private
 *     key (viem `LocalAccount`).
 *   - `eth_sendTransaction` goes through `walletClient.sendTransaction`,
 *     which signs locally and submits to the configured RPC URL.
 *   - Read methods fall through to the viem `PublicClient`, so the page
 *     observes real on-chain state (balances, receipts, block numbers).
 *
 * Every request is still appended to `window.__mockWalletCalls` so existing
 * assertions that inspect the call ledger work unchanged.
 */

export type HeadlessWalletOptions = {
  readonly privateKey: Hex;
  readonly rpcUrl: string;
  readonly chain: Chain;
  /**
   * Optional override for the chainId the provider reports to wagmi /
   * Reown. Defaults to `chain.id`. Set this when you want wagmi to see a
   * different chain than the one the node-side viem client actually signs
   * and broadcasts on (useful when the real chain isn't in wagmi's
   * networks list — e.g. v4 testnet while the app only knows mainnet).
   */
  readonly reportChainId?: number;
  /** Human-readable label shown in the Reown modal. */
  readonly walletName?: string;
};

export type HeadlessWalletHandle = {
  readonly address: Address;
  readonly publicClient: PublicClient;
  readonly walletClient: WalletClient;
};

/** Converts a 0x-hex integer (viem's default on the wire) to a bigint. */
function hexToBigInt(value: unknown): bigint | undefined {
  if (typeof value !== 'string') return undefined;
  if (!value.startsWith('0x')) return undefined;
  if (value === '0x') return 0n;
  return BigInt(value);
}

/**
 * Node-side handler for an EIP-1193 `request` call. Kept as a pure function
 * for unit-testability — exported so the helper can be stubbed/traced from a
 * spec if needed.
 */
export async function handleRpc(
  args: { method: string; params?: readonly unknown[] },
  deps: {
    readonly account: { readonly address: Address };
    readonly publicClient: PublicClient;
    readonly walletClient: WalletClient;
    readonly chainId: number;
    readonly state: { authorized: boolean };
  },
): Promise<unknown> {
  const { account, publicClient, walletClient, chainId, state } = deps;
  const params = args.params ?? [];

  switch (args.method) {
    case 'eth_requestAccounts':
      state.authorized = true;
      return [account.address];
    case 'eth_accounts':
      return state.authorized ? [account.address] : [];
    case 'eth_chainId':
      return '0x' + chainId.toString(16);
    case 'net_version':
      return String(chainId);
    case 'wallet_getPermissions':
      return state.authorized ? [{ parentCapability: 'eth_accounts' }] : [];
    case 'wallet_requestPermissions':
      state.authorized = true;
      return [{ parentCapability: 'eth_accounts' }];
    case 'wallet_revokePermissions':
      state.authorized = false;
      return null;
    case 'wallet_switchEthereumChain':
    case 'wallet_addEthereumChain':
      return null;
    case 'personal_sign': {
      // params: [message, address]. Message is 0x-hex-encoded by wagmi.
      const messageHex = params[0];
      if (typeof messageHex !== 'string') {
        throw new Error('personal_sign: expected hex message');
      }
      return walletClient.signMessage({
        account: walletClient.account!,
        message: { raw: messageHex as Hex },
      });
    }
    case 'eth_signTypedData_v4': {
      // params: [address, typedDataJsonString]
      const raw = params[1];
      if (typeof raw !== 'string') {
        throw new Error('eth_signTypedData_v4: expected JSON string in params[1]');
      }
      const typedData = JSON.parse(raw) as Parameters<
        WalletClient['signTypedData']
      >[0];
      // viem complains when EIP712Domain is included as a type — strip it.
      const cleaned = {
        ...typedData,
        types: Object.fromEntries(
          Object.entries(
            (typedData as { types: Record<string, unknown> }).types,
          ).filter(([name]) => name !== 'EIP712Domain'),
        ),
      } as typeof typedData;
      return walletClient.signTypedData({
        ...cleaned,
        account: walletClient.account!,
      });
    }
    case 'eth_sendTransaction': {
      const tx = params[0] as {
        from?: Address;
        to?: Address;
        data?: Hex;
        value?: Hex;
        gas?: Hex;
        gasPrice?: Hex;
        maxFeePerGas?: Hex;
        maxPriorityFeePerGas?: Hex;
        nonce?: Hex;
      };
      return walletClient.sendTransaction({
        account: walletClient.account!,
        chain: walletClient.chain ?? null,
        to: tx.to,
        data: tx.data,
        value: hexToBigInt(tx.value),
        gas: hexToBigInt(tx.gas),
        gasPrice: hexToBigInt(tx.gasPrice),
        maxFeePerGas: hexToBigInt(tx.maxFeePerGas),
        maxPriorityFeePerGas: hexToBigInt(tx.maxPriorityFeePerGas),
        nonce:
          hexToBigInt(tx.nonce) !== undefined
            ? Number(hexToBigInt(tx.nonce))
            : undefined,
      } as Parameters<WalletClient['sendTransaction']>[0]);
    }
    default:
      // Everything else (eth_blockNumber, eth_getBalance, eth_call,
      // eth_estimateGas, eth_gasPrice, eth_getTransactionReceipt, etc.)
      // falls through to the public client, which uses the configured RPC.
      return publicClient.request({
        method: args.method as never,
        params: params as never,
      });
  }
}

export async function installHeadlessWallet(
  page: Page,
  options: HeadlessWalletOptions,
): Promise<HeadlessWalletHandle> {
  const {
    privateKey,
    rpcUrl,
    chain,
    reportChainId = chain.id,
    walletName = 'HeadlessWallet',
  } = options;
  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
  const walletClient = createWalletClient({
    chain,
    transport: http(rpcUrl),
    account,
  });

  const state = { authorized: false };
  await page.exposeBinding(
    '__titrateHeadlessRpc',
    async (_source, args: { method: string; params?: readonly unknown[] }) => {
      try {
        const result = await handleRpc(args, {
          account,
          publicClient,
          walletClient,
          chainId: reportChainId,
          state,
        });
        // Stringify bigints/objects that Playwright can't serialize raw.
        return JSON.parse(
          JSON.stringify(result, (_k, v) =>
            typeof v === 'bigint' ? '0x' + v.toString(16) : v,
          ),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Propagate a plain message — Playwright's binding wrapper cannot
        // pass Error instances across the boundary.
        throw new Error(`HeadlessWallet RPC ${args.method}: ${message}`);
      }
    },
  );

  await page.addInitScript(
    ({ address, chainId, walletName }) => {
      type Listener = (...args: unknown[]) => void;
      const listeners = new Map<string, Set<Listener>>();

      function emit(event: string, payload: unknown) {
        listeners.get(event)?.forEach((listener) => listener(payload));
      }

      async function request(args: {
        method: string;
        params?: unknown;
      }): Promise<unknown> {
        const calls = ((
          window as unknown as { __mockWalletCalls?: unknown[] }
        ).__mockWalletCalls ??= []);
        calls.push({ method: args.method, params: args.params });
        const bridge = (
          window as unknown as {
            __titrateHeadlessRpc?: (a: unknown) => Promise<unknown>;
          }
        ).__titrateHeadlessRpc;
        if (!bridge) {
          throw new Error('HeadlessWallet bridge missing');
        }
        const result = await bridge({
          method: args.method,
          params: args.params ?? [],
        });
        // eth_requestAccounts is the canonical authorize event; mirror the
        // mock wallet's behaviour and emit accountsChanged so wagmi updates.
        if (args.method === 'eth_requestAccounts') {
          emit('accountsChanged', [address]);
        }
        return result;
      }

      const provider = {
        request,
        isMetaMask: true,
        on(event: string, listener: Listener) {
          if (!listeners.has(event)) listeners.set(event, new Set());
          listeners.get(event)!.add(listener);
        },
        removeListener(event: string, listener: Listener) {
          listeners.get(event)?.delete(listener);
        },
      };

      // Mark unused chainId param so TS doesn't complain.
      void chainId;

      (window as unknown as { ethereum: unknown }).ethereum = provider;
      (window as unknown as { __headlessProvider: unknown }).__headlessProvider =
        provider;

      const info = Object.freeze({
        uuid: '9cda6e65-headless-0000-0000-0000headlessv4',
        name: walletName,
        icon:
          'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=',
        rdns: 'io.headless.e2e',
      });

      function announce() {
        window.dispatchEvent(
          new CustomEvent('eip6963:announceProvider', {
            detail: Object.freeze({ info, provider }),
          }),
        );
      }

      window.addEventListener('eip6963:requestProvider', announce);
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', announce, { once: true });
      } else {
        announce();
      }
    },
    {
      address: account.address,
      chainId: reportChainId,
      walletName,
    },
  );

  return { address: account.address, publicClient, walletClient };
}
