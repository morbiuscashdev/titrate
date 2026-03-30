import type { Address, Hex } from 'viem';
import { keccak256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export type EIP712MessageParams = {
  readonly funder: Address;
  readonly name: string;
  readonly version: number;
};

export type EIP712TypedData = {
  readonly domain: {
    readonly name: string;
    readonly version: string;
    readonly chainId: number;
  };
  readonly types: {
    readonly HotWalletDerivation: readonly { readonly name: string; readonly type: string }[];
  };
  readonly primaryType: 'HotWalletDerivation';
  readonly message: {
    readonly funder: Address;
    readonly name: string;
    readonly version: number;
  };
};

export function createEIP712Message(params: EIP712MessageParams): EIP712TypedData {
  return {
    domain: { name: 'Titrate', version: '1', chainId: 1 },
    types: {
      HotWalletDerivation: [
        { name: 'funder', type: 'address' },
        { name: 'name', type: 'string' },
        { name: 'version', type: 'uint256' },
      ],
    },
    primaryType: 'HotWalletDerivation',
    message: { funder: params.funder, name: params.name, version: params.version },
  };
}

export type DerivedWallet = {
  readonly address: Address;
  readonly privateKey: Hex;
};

export function deriveHotWallet(signature: Hex): DerivedWallet {
  const privateKey = keccak256(signature);
  const account = privateKeyToAccount(privateKey);
  return { address: account.address, privateKey };
}
