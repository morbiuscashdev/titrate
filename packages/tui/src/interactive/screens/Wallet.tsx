import { useReducer, useState } from 'react';
import { useKeyboard } from '@opentui/react';
import type { SelectOption } from '@opentui/core';
import { privateKeyToAccount } from 'viem/accounts';
import type { Address, Hex } from 'viem';
import {
  createPasteSignerFactory,
  deriveMultipleWallets,
} from '@titrate/sdk';
import { useCampaignStorage, useManifest } from '../context.js';
import { encryptPrivateKey } from '../../utils/passphrase.js';
import type { StepProps } from '../App.js';

type Mode = 'derived' | 'imported';

type State = {
  readonly mode: Mode;
  readonly coldAddress: string;
  readonly signature: string;
  readonly walletCount: number;
  readonly walletOffset: number;
  readonly importedKeys: readonly string[];
  readonly passphrase: string;
  readonly status: 'idle' | 'saving' | 'success' | 'error';
  readonly message: string | null;
};

type Action =
  | { readonly type: 'setMode'; readonly mode: Mode }
  | { readonly type: 'setColdAddress'; readonly value: string }
  | { readonly type: 'setSignature'; readonly value: string }
  | { readonly type: 'setWalletCount'; readonly value: number }
  | { readonly type: 'addImportedKey'; readonly value: string }
  | { readonly type: 'setPassphrase'; readonly value: string }
  | { readonly type: 'saving' }
  | { readonly type: 'success'; readonly message: string }
  | { readonly type: 'error'; readonly message: string };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'setMode': return { ...s, mode: a.mode };
    case 'setColdAddress': return { ...s, coldAddress: a.value };
    case 'setSignature': return { ...s, signature: a.value };
    case 'setWalletCount': return { ...s, walletCount: a.value };
    case 'addImportedKey': return { ...s, importedKeys: [...s.importedKeys, a.value] };
    case 'setPassphrase': return { ...s, passphrase: a.value };
    case 'saving': return { ...s, status: 'saving' };
    case 'success': return { ...s, status: 'success', message: a.message };
    case 'error': return { ...s, status: 'error', message: a.message };
  }
}

function initialState(wallets: { mode: 'derived'; coldAddress: Address; walletCount: number; walletOffset: number } | { mode: 'imported'; count: number }): State {
  if (wallets.mode === 'derived') {
    return {
      mode: 'derived',
      coldAddress: wallets.coldAddress,
      signature: '',
      walletCount: wallets.walletCount,
      walletOffset: wallets.walletOffset,
      importedKeys: [],
      passphrase: '',
      status: 'idle',
      message: null,
    };
  }
  return {
    mode: 'imported',
    coldAddress: '',
    signature: '',
    walletCount: 1,
    walletOffset: 0,
    importedKeys: [],
    passphrase: '',
    status: 'idle',
    message: null,
  };
}

export function Wallet({ onDone, onBack }: StepProps) {
  const storage = useCampaignStorage();
  const { manifest, refresh } = useManifest();
  const [state, dispatch] = useReducer(reducer, initialState(manifest.wallets));
  const [pendingKey, setPendingKey] = useState('');

  useKeyboard(async (key) => {
    if (key.name === 'escape') onBack();
    if (key.name === 'return') {
      if (state.mode === 'derived') await saveDerived();
      else await saveImported();
    }
  });

  async function saveDerived() {
    if (!state.passphrase || !state.signature || !state.coldAddress) {
      dispatch({ type: 'error', message: 'cold address, signature, and passphrase are required' });
      return;
    }
    dispatch({ type: 'saving' });
    try {
      const factory = createPasteSignerFactory({
        coldAddress: state.coldAddress as Address,
        readSignature: async () => state.signature as Hex,
      });
      const signer = await factory.create();
      const sig = await signer.signTypedData({
        domain: { name: 'Titrate', version: '1', chainId: manifest.chainId },
        types: { StorageEncryption: [{ name: 'campaignId', type: 'string' }] },
        primaryType: 'StorageEncryption',
        message: { campaignId: manifest.id },
      });
      const wallets = deriveMultipleWallets({
        signature: sig,
        count: state.walletCount,
        offset: state.walletOffset,
      });
      await storage.ensureDir();
      const records = await Promise.all(
        wallets.map(async (w, i) => {
          const enc = await encryptPrivateKey(w.privateKey, state.passphrase);
          return {
            index: i,
            address: w.address,
            encryptedKey: { ciphertext: enc.ciphertext, iv: enc.iv, authTag: enc.authTag },
            kdf: enc.kdf,
            kdfParams: enc.kdfParams,
            provenance: {
              type: 'derived' as const,
              coldAddress: state.coldAddress as Address,
              derivationIndex: state.walletOffset + i,
            },
            createdAt: Date.now(),
          };
        }),
      );
      await storage.wallets.append(records);
      await storage.manifest.update({
        wallets: {
          mode: 'derived',
          coldAddress: state.coldAddress as Address,
          walletCount: state.walletCount,
          walletOffset: state.walletOffset,
        },
      });
      await refresh();
      dispatch({ type: 'success', message: `${state.walletCount} wallets derived and encrypted` });
      setTimeout(onDone, 500);
    } catch (err) {
      dispatch({ type: 'error', message: String(err) });
    }
  }

  async function saveImported() {
    if (!state.passphrase || state.importedKeys.length === 0) {
      dispatch({ type: 'error', message: 'at least one imported key and a passphrase are required' });
      return;
    }
    dispatch({ type: 'saving' });
    try {
      await storage.ensureDir();
      const records = await Promise.all(
        state.importedKeys.map(async (pk, i) => {
          const account = privateKeyToAccount(pk as Hex);
          const enc = await encryptPrivateKey(pk, state.passphrase);
          return {
            index: i,
            address: account.address,
            encryptedKey: { ciphertext: enc.ciphertext, iv: enc.iv, authTag: enc.authTag },
            kdf: enc.kdf,
            kdfParams: enc.kdfParams,
            provenance: { type: 'imported' as const },
            createdAt: Date.now(),
          };
        }),
      );
      await storage.wallets.append(records);
      await storage.manifest.update({
        wallets: { mode: 'imported', count: state.importedKeys.length },
      });
      await refresh();
      dispatch({ type: 'success', message: `${state.importedKeys.length} wallets imported and encrypted` });
      setTimeout(onDone, 500);
    } catch (err) {
      dispatch({ type: 'error', message: String(err) });
    }
  }

  const modeOptions: SelectOption[] = [
    { name: 'Derived from cold wallet signature', description: '', value: 'derived' },
    { name: 'Import existing private keys', description: '', value: 'imported' },
  ];

  return (
    <box border padding={1} flexDirection="column">
      <text><strong>Step 5 — Hot Wallets</strong></text>
      <box marginTop={1}>
        <text>Provisioning:</text>
        <select
          focused={state.status === 'idle'}
          options={modeOptions}
          onChange={(_i: number, option: SelectOption | null) => {
            if (option && option.value) dispatch({ type: 'setMode', mode: option.value as Mode });
          }}
        />
      </box>
      {state.mode === 'derived' ? (
        <box marginTop={1} flexDirection="column">
          <text>Cold address:</text>
          <input value={state.coldAddress} onChange={(v: string) => dispatch({ type: 'setColdAddress', value: v })} placeholder="0x…" />
          <text marginTop={1}>Signature (paste hex after signing externally):</text>
          <input value={state.signature} onChange={(v: string) => dispatch({ type: 'setSignature', value: v })} placeholder="0x…" />
          <text marginTop={1}>Wallet count:</text>
          <input value={String(state.walletCount)} onChange={(v: string) => {
            const n = parseInt(v, 10);
            if (!Number.isNaN(n)) dispatch({ type: 'setWalletCount', value: n });
          }} />
        </box>
      ) : (
        <box marginTop={1} flexDirection="column">
          <text>Paste private key (one at a time, press Enter after each):</text>
          <input value={pendingKey} onChange={setPendingKey} placeholder="0x…" />
          <text onMouseDown={() => {
            if (pendingKey) {
              dispatch({ type: 'addImportedKey', value: pendingKey });
              setPendingKey('');
            }
          }}>
            <span fg="cyan">[ Add ]</span>
          </text>
          <text>
            <span fg="gray">{state.importedKeys.length} key(s) added</span>
          </text>
        </box>
      )}
      <box marginTop={1} flexDirection="column">
        <text>Passphrase (protects encrypted keys):</text>
        <input value={state.passphrase} onChange={(v: string) => dispatch({ type: 'setPassphrase', value: v })} placeholder="enter a strong passphrase" />
      </box>
      {state.status === 'saving' && <text><span fg="gray">Saving…</span></text>}
      {state.status === 'success' && <text><span fg="green">{state.message}</span></text>}
      {state.status === 'error' && <text><span fg="red">{state.message}</span></text>}
      <box marginTop={1}>
        <text><span fg="gray">Enter: save · Esc: back</span></text>
      </box>
    </box>
  );
}
