import { recoverTypedDataAddress, isAddressEqual, type Address, type Hex, type TypedDataDefinition } from 'viem';
import type { EIP712Signer, SignerFactory } from './types.js';

export type PasteSignerOptions = {
  readonly coldAddress: Address;
  readonly readSignature: (payload: TypedDataDefinition) => Promise<Hex>;
};

/**
 * Factory for a "paste a signature" signer. The user signs the EIP-712 payload
 * externally (web app, cast wallet sign-typed-data, etc.) and pastes the
 * resulting hex signature back into the TUI. Verifies that the signature
 * recovers to the declared cold address before accepting.
 */
export function createPasteSignerFactory(options: PasteSignerOptions): SignerFactory {
  const signer: EIP712Signer = {
    async getAddress() {
      return options.coldAddress;
    },
    async signTypedData(payload) {
      const signature = await options.readSignature(payload);
      const recovered = await recoverTypedDataAddress({ ...payload, signature });
      if (!isAddressEqual(recovered, options.coldAddress)) {
        throw new Error(
          `Signature verification failed: recovered address ${recovered} does not match cold address ${options.coldAddress}`,
        );
      }
      return signature;
    },
  };
  return {
    id: 'paste',
    label: 'Paste signature',
    available: async () => true,
    create: async () => signer,
  };
}
