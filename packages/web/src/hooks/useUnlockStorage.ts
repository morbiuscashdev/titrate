import { useCallback } from 'react';
import { useSignTypedData } from 'wagmi';
import { useStorage } from '../providers/StorageProvider.js';

/**
 * EIP-712 typed data used to derive the storage encryption key.
 * Must match the definition in StorageProvider's auto-prompt.
 */
const STORAGE_TYPED_DATA = {
  domain: { name: 'Titrate', version: '1', chainId: 1 },
  types: { StorageEncryption: [{ name: 'purpose', type: 'string' }] },
  primaryType: 'StorageEncryption' as const,
  message: { purpose: 'storage-encryption' },
};

/**
 * Hook that exposes the current lock state and a callback to request
 * an EIP-712 signature for storage encryption unlock.
 *
 * Use this when the user has rejected the auto-prompt on wallet connect
 * and needs a manual retry path (e.g. clicking a lock icon or banner button).
 */
export function useUnlockStorage() {
  const { isUnlocked, unlock } = useStorage();
  const { signTypedDataAsync } = useSignTypedData();

  const requestUnlock = useCallback(async () => {
    if (isUnlocked) return;

    const signature = await signTypedDataAsync(STORAGE_TYPED_DATA);
    await unlock(signature);
  }, [isUnlocked, signTypedDataAsync, unlock]);

  return { isUnlocked, requestUnlock };
}
