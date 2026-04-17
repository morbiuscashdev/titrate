import type { Address, Hex, TypedDataDefinition } from 'viem';

export type EIP712Signer = {
  readonly getAddress: () => Promise<Address>;
  readonly signTypedData: (payload: TypedDataDefinition) => Promise<Hex>;
  readonly close?: () => Promise<void>;
};

export type SignerFactoryId = 'paste' | 'walletconnect' | 'ledger';

export type SignerFactory = {
  readonly id: SignerFactoryId;
  readonly label: string;
  readonly available: () => Promise<boolean>;
  readonly create: () => Promise<EIP712Signer>;
};
