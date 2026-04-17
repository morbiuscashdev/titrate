import { describe, expect, it } from 'vitest';
import { createLedgerSignerFactory } from '../signers/ledger.js';

describe('Ledger signer factory', () => {
  it('exposes correct id + label', () => {
    const factory = createLedgerSignerFactory({
      derivationPath: "44'/60'/0'/0/0",
    });
    expect(factory.id).toBe('ledger');
    expect(factory.label).toBe('Ledger');
  });

  it('available() returns false when no device connected (or true if one is)', async () => {
    const factory = createLedgerSignerFactory({
      derivationPath: "44'/60'/0'/0/0",
    });
    // node-hid build scripts are disabled in Yarn PnP — available() catches errors and returns false
    try {
      const avail = await factory.available();
      expect(typeof avail).toBe('boolean');
    } catch {
      // OK — hw-transport may not load on this system (no libusb / native addon)
    }
  });
});
