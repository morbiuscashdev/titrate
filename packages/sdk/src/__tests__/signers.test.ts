import { describe, it, expect } from 'vitest';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import type { TypedDataDefinition } from 'viem';
import {
  createPasteSignerFactory,
  type EIP712Signer,
} from '../signers/index.js';

const TYPED_DATA: TypedDataDefinition = {
  domain: { name: 'Titrate', version: '1', chainId: 1 },
  types: {
    StorageEncryption: [{ name: 'campaignId', type: 'string' }],
  },
  primaryType: 'StorageEncryption',
  message: { campaignId: 'test-campaign' },
};

describe('PasteSigner', () => {
  it('round-trips an externally-produced signature', async () => {
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    const signature = await account.signTypedData(TYPED_DATA);

    const factory = createPasteSignerFactory({
      coldAddress: account.address,
      readSignature: async () => signature,
    });
    expect(await factory.available()).toBe(true);
    const signer: EIP712Signer = await factory.create();
    expect(await signer.getAddress()).toBe(account.address);
    expect(await signer.signTypedData(TYPED_DATA)).toBe(signature);
  });

  it('rejects a signature that does not recover to the declared cold address', async () => {
    const pkA = generatePrivateKey();
    const pkB = generatePrivateKey();
    const accountA = privateKeyToAccount(pkA);
    const accountB = privateKeyToAccount(pkB);
    const signatureFromB = await accountB.signTypedData(TYPED_DATA);

    const factory = createPasteSignerFactory({
      coldAddress: accountA.address,
      readSignature: async () => signatureFromB,
    });
    const signer = await factory.create();
    await expect(signer.signTypedData(TYPED_DATA)).rejects.toThrow(/recovered address/i);
  });
});
