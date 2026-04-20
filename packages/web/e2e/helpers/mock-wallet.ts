import type { Page } from '@playwright/test';

/**
 * EIP-1193 + EIP-6963 mock wallet provider injected before the app boots.
 *
 * Why: Reown AppKit discovers providers via EIP-6963 `announceProvider` /
 * `requestProvider` events. Setting `window.ethereum` alone doesn't surface
 * the wallet in AppKit's connector list — the announce event is mandatory.
 *
 * The mock responds to a small RPC surface (enough to drive wagmi's
 * injected connector through connect → accounts → sign → send) and records
 * every call on `window.__mockWalletCalls` so tests can make assertions.
 *
 * Not supported: real signature verification, chain-state simulation, or
 * persistence across page loads. Extend only when a real test needs it.
 */

export type MockWalletOptions = {
  /** The single account the mock exposes. */
  readonly address: `0x${string}`;
  /** Current chainId (decimal). Default: 1 (mainnet). */
  readonly chainId?: number;
  /** Human-readable wallet name shown in the Reown modal. */
  readonly walletName?: string;
};

export async function installMockWallet(page: Page, options: MockWalletOptions): Promise<void> {
  const { address, chainId = 1, walletName = 'MockWallet' } = options;

  await page.addInitScript(
    ({ address, chainId, walletName }) => {
      type Listener = (...args: unknown[]) => void;
      const listeners = new Map<string, Set<Listener>>();

      const FAKE_SIG =
        '0x' + '11'.repeat(64) + '1b'; // 65 bytes with v=0x1b
      const FAKE_TX_HASH = '0x' + 'dd'.repeat(32);

      // Tracks whether the dApp has been authorized for account access.
      // Matches real wallet behavior: `eth_accounts` returns [] until
      // `eth_requestAccounts` completes, and `eth_accounts` returns the
      // authorized address only after the user grants access.
      let authorized = false;

      function emit(event: string, payload: unknown) {
        listeners.get(event)?.forEach((listener) => listener(payload));
      }

      async function request(args: { method: string; params?: unknown }): Promise<unknown> {
        // Record every call so tests can assert on ordering / args.
        const calls = (window as unknown as { __mockWalletCalls?: unknown[] }).__mockWalletCalls ??= [];
        calls.push({ method: args.method, params: args.params });

        switch (args.method) {
          case 'eth_requestAccounts':
            authorized = true;
            emit('accountsChanged', [address]);
            return [address];
          case 'eth_accounts':
            return authorized ? [address] : [];
          case 'eth_chainId':
          case 'net_version':
            return '0x' + chainId.toString(16);
          case 'wallet_switchEthereumChain':
          case 'wallet_addEthereumChain':
            return null;
          case 'wallet_getPermissions':
            return authorized ? [{ parentCapability: 'eth_accounts' }] : [];
          case 'wallet_requestPermissions':
            authorized = true;
            return [{ parentCapability: 'eth_accounts' }];
          case 'wallet_revokePermissions':
            authorized = false;
            emit('accountsChanged', []);
            return null;
          case 'personal_sign':
          case 'eth_sign':
          case 'eth_signTypedData_v4':
            return FAKE_SIG;
          case 'eth_sendTransaction':
          case 'eth_sendRawTransaction':
            return FAKE_TX_HASH;
          case 'eth_blockNumber':
            return '0x1';
          case 'eth_getBalance':
            return '0x0';
          case 'eth_estimateGas':
            return '0x5208'; // 21_000
          case 'eth_gasPrice':
            return '0x1';
          default:
            // Surface unrecognised methods as a rejection so tests don't
            // silently pass when the app relies on something unmocked.
            throw new Error(`MockWallet: unsupported RPC method ${args.method}`);
        }
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

      (window as unknown as { ethereum: unknown }).ethereum = provider;
      (window as unknown as { __mockProvider: unknown }).__mockProvider = provider;

      // --- EIP-6963 announce ------------------------------------------
      const info = Object.freeze({
        uuid: '9cda6e65-0000-0000-0000-0000000mockwallet'.slice(0, 36),
        name: walletName,
        icon:
          'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=',
        rdns: 'io.mockwallet.e2e',
      });

      function announce() {
        window.dispatchEvent(
          new CustomEvent('eip6963:announceProvider', {
            detail: Object.freeze({ info, provider }),
          }),
        );
      }

      // Reown/wagmi fire request → we announce.
      window.addEventListener('eip6963:requestProvider', announce);
      // Some dApps listen first and miss a synchronous announce — fire once
      // on document ready as a safety net.
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', announce, { once: true });
      } else {
        announce();
      }
    },
    { address, chainId, walletName },
  );
}

/** Return the list of RPC calls observed by the mock so far. */
export async function getMockWalletCalls(
  page: Page,
): Promise<Array<{ method: string; params: unknown }>> {
  return page.evaluate(() =>
    ((window as unknown as { __mockWalletCalls?: unknown[] }).__mockWalletCalls ?? []) as Array<{
      method: string;
      params: unknown;
    }>,
  );
}
