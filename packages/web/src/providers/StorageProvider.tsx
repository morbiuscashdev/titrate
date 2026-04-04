import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import type { Storage } from '@titrate/sdk';
import { createIDBStorage } from '@titrate/storage-idb';
import { useSignTypedData } from 'wagmi';
import { deriveEncryptionKey } from '../crypto/encrypt.js';
import { createEncryptedStorage } from '../crypto/storage-wrapper.js';
import { useWallet } from './WalletProvider.js';

/** Values exposed by the storage context. */
export type StorageContextValue = {
  readonly storage: Storage | null;
  readonly isUnlocked: boolean;
  readonly unlock: (signature: string) => Promise<void>;
};

const StorageContext = createContext<StorageContextValue | null>(null);

const SESSION_KEY = 'titrate-enc-key';

export type StorageProviderProps = {
  readonly children: ReactNode;
};

/**
 * Provides IndexedDB-backed storage to the component tree.
 *
 * On mount, opens the IDB database via `createIDBStorage()`. The raw storage
 * is immediately usable for non-sensitive stores. Calling `unlock(signature)`
 * derives an AES-GCM key and wraps the storage with field-level encryption.
 *
 * A flag in `sessionStorage` tracks whether the user has unlocked in this tab,
 * but the CryptoKey itself cannot be serialized — so a page refresh requires
 * a fresh signature.
 */
export function StorageProvider({ children }: StorageProviderProps) {
  const [rawStorage, setRawStorage] = useState<Storage | null>(null);
  const [encryptedStorage, setEncryptedStorage] = useState<Storage | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);

  const { isConnected } = useWallet();
  const { signTypedDataAsync } = useSignTypedData();

  useEffect(() => {
    createIDBStorage().then(setRawStorage).catch((error: unknown) => {
      console.error('Failed to initialize IDB storage:', error);
    });
  }, []);

  const unlock = useCallback(
    async (signature: string) => {
      if (!rawStorage) {
        throw new Error('Storage not initialized');
      }
      const key = await deriveEncryptionKey(signature);
      setEncryptedStorage(createEncryptedStorage(rawStorage, key));
      try {
        sessionStorage.setItem(SESSION_KEY, 'true');
      } catch {
        // sessionStorage may be unavailable
      }
    },
    [rawStorage],
  );

  const storage = encryptedStorage ?? rawStorage;
  const isUnlocked = encryptedStorage !== null;

  // Auto-prompt for the storage-encryption signature when a wallet connects
  useEffect(() => {
    if (!isConnected || isUnlocked || isUnlocking || !rawStorage) return;

    setIsUnlocking(true);
    signTypedDataAsync({
      domain: { name: 'Titrate', version: '1', chainId: 1 },
      types: {
        StorageEncryption: [{ name: 'purpose', type: 'string' }],
      },
      primaryType: 'StorageEncryption',
      message: { purpose: 'storage-encryption' },
    })
      .then((signature) => unlock(signature))
      .catch(() => {
        // User rejected the signature — stay with unencrypted storage
        console.warn('[StorageProvider] Encryption signature rejected');
      })
      .finally(() => setIsUnlocking(false));
  }, [isConnected, isUnlocked, isUnlocking, rawStorage, signTypedDataAsync, unlock]);

  return (
    <StorageContext.Provider value={{ storage, isUnlocked, unlock }}>
      {children}
    </StorageContext.Provider>
  );
}

/**
 * Access the current storage context.
 *
 * @throws When called outside of a `<StorageProvider>`.
 */
export function useStorage(): StorageContextValue {
  const context = useContext(StorageContext);
  if (!context) {
    throw new Error('useStorage must be used within a StorageProvider');
  }
  return context;
}
