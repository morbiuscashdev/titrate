import { describe, it, expect } from 'vitest';
import { createWalletConnectSignerFactory } from '../signers/walletconnect.js';

describe('WalletConnect signer factory', () => {
  it('exposes correct id + label', () => {
    const factory = createWalletConnectSignerFactory({
      projectId: 'dummy',
      chainId: 1,
      onQR: () => {},
      onApproval: () => {},
    });
    expect(factory.id).toBe('walletconnect');
    expect(factory.label).toBe('WalletConnect');
  });

  it('available() returns true when @walletconnect/sign-client is installed', async () => {
    const factory = createWalletConnectSignerFactory({
      projectId: 'dummy',
      chainId: 1,
      onQR: () => {},
      onApproval: () => {},
    });
    expect(await factory.available()).toBe(true);
  });
});
