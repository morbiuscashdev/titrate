import type { Address, Hex, TypedDataDefinition } from 'viem';
import type { EIP712Signer, SignerFactory } from './types.js';

export type WalletConnectOptions = {
  readonly projectId: string;
  readonly chainId: number;
  readonly onQR: (uri: string) => void;
  readonly onApproval: (address: Address) => void;
};

/**
 * Factory for a WalletConnect signer. The user pairs a mobile/browser wallet
 * with the TUI via a QR code or URI. Session is short-lived: teardown
 * immediately after signature capture.
 */
export function createWalletConnectSignerFactory(options: WalletConnectOptions): SignerFactory {
  return {
    id: 'walletconnect',
    label: 'WalletConnect',
    async available() {
      try {
        // Runtime check: is @walletconnect/sign-client loadable?
        await import('@walletconnect/sign-client');
        return true;
      } catch {
        return false;
      }
    },
    async create(): Promise<EIP712Signer> {
      const { SignClient } = await import('@walletconnect/sign-client');
      const client = await SignClient.init({
        projectId: options.projectId,
        metadata: {
          name: 'Titrate',
          description: 'Titrate TUI',
          url: 'https://titrate.local',
          icons: [],
        },
      });
      const { uri, approval } = await client.connect({
        requiredNamespaces: {
          eip155: {
            methods: ['eth_signTypedData_v4'],
            chains: [`eip155:${options.chainId}`],
            events: [],
          },
        },
      });
      if (uri) options.onQR(uri);
      const session = await approval();
      const account = session.namespaces['eip155']?.accounts[0];
      if (!account) throw new Error('WalletConnect: no EIP-155 account returned in session');
      const address = account.split(':')[2] as Address;
      options.onApproval(address);

      return {
        async getAddress() {
          return address;
        },
        async signTypedData(payload: TypedDataDefinition) {
          const result = await client.request<Hex>({
            topic: session.topic,
            chainId: `eip155:${options.chainId}`,
            request: {
              method: 'eth_signTypedData_v4',
              params: [address, JSON.stringify(payload)],
            },
          });
          return result;
        },
        async close() {
          await client.disconnect({
            topic: session.topic,
            reason: { code: 6000, message: 'User done' },
          });
        },
      };
    },
  };
}
