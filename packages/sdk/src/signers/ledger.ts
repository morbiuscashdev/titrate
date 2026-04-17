import type { Address, Hex, TypedDataDefinition } from 'viem';
import type { EIP712Signer, SignerFactory } from './types.js';

export type LedgerOptions = {
  readonly derivationPath: string; // e.g., "44'/60'/0'/0/0"
};

/**
 * Factory for a Ledger-device EIP-712 signer. Requires a physical Ledger
 * with the Ethereum app open. Uses node-hid via Bun's N-API bridge.
 */
export function createLedgerSignerFactory(options: LedgerOptions): SignerFactory {
  return {
    id: 'ledger',
    label: 'Ledger',
    async available() {
      try {
        const transportModule = await import('@ledgerhq/hw-transport-node-hid');
        const Transport = transportModule.default ?? transportModule;
        const devices = await (Transport as { list: () => Promise<unknown[]> }).list();
        return devices.length > 0;
      } catch {
        return false;
      }
    },
    async create(): Promise<EIP712Signer> {
      const transportModule = await import('@ledgerhq/hw-transport-node-hid');
      const ethModule = await import('@ledgerhq/hw-app-eth');
      const Transport = transportModule.default ?? transportModule;
      const Eth = ethModule.default ?? ethModule;
      const transport = await (Transport as { create: () => Promise<unknown> }).create();
      const EthCtor = Eth as unknown as new (t: unknown) => {
        getAddress: (path: string) => Promise<{ address: string }>;
        signEIP712Message: (
          path: string,
          data: unknown,
        ) => Promise<{ r: string; s: string; v: number }>;
      };
      const eth = new EthCtor(transport);
      const { address } = await eth.getAddress(options.derivationPath);
      const normalized = address as Address;

      return {
        async getAddress() {
          return normalized;
        },
        async signTypedData(payload: TypedDataDefinition) {
          const result = await eth.signEIP712Message(
            options.derivationPath,
            payload as unknown as Record<string, unknown>,
          );
          const rHex = result.r.startsWith('0x') ? result.r.slice(2) : result.r;
          const sHex = result.s.startsWith('0x') ? result.s.slice(2) : result.s;
          return `0x${rHex}${sHex}${result.v.toString(16).padStart(2, '0')}` as Hex;
        },
        async close() {
          await (transport as { close: () => Promise<void> }).close();
        },
      };
    },
  };
}
