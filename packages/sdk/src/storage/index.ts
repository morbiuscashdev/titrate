import type { Address, Hex } from 'viem';
import type { CampaignConfig, BatchAttempt, BatchAttemptRecord, PipelineConfig, BatchStatus, PipelineHistoryEntry, LoopErrorEntry } from '../types.js';

export type StoredCampaign = CampaignConfig & {
  readonly id: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly archived?: boolean;
};

export type StoredAddressSet = {
  readonly id: string;
  readonly campaignId: string;
  readonly name: string;
  readonly type: 'source' | 'derived-filter' | 'external-filter' | 'result';
  readonly addressCount: number;
  readonly createdAt: number;
};

export type StoredAddress = {
  readonly setId: string;
  readonly address: Address;
  readonly amount: string | null;
};

export type StoredBatch = {
  readonly id: string;
  readonly campaignId: string;
  readonly batchIndex: number;
  readonly recipients: readonly Address[];
  readonly amounts: readonly string[];
  readonly status: BatchStatus;
  readonly attempts: readonly BatchAttempt[];
  readonly confirmedTxHash: Hex | null;
  readonly confirmedBlock: bigint | null;
  readonly createdAt: number;
  readonly updatedAt: number;
};

export type StoredWallet = {
  readonly id: string;
  readonly campaignId: string;
  readonly hotAddress: Address;
  readonly coldAddress: Address;
  readonly createdAt: number;
};

export type StoredChainConfig = {
  readonly id: string;
  readonly chainId: number;
  readonly name: string;
  readonly rpcUrl: string;
  readonly rpcBusKey: string;
  readonly explorerApiUrl: string;
  readonly explorerApiKey: string;
  readonly explorerBusKey: string;
  readonly trueBlocksUrl: string;
  readonly trueBlocksBusKey: string;
};

export interface CampaignStore {
  get(id: string): Promise<StoredCampaign | null>;
  getByIdentity(funder: Address, name: string, version: number): Promise<StoredCampaign | null>;
  put(campaign: StoredCampaign): Promise<void>;
  list(): Promise<readonly StoredCampaign[]>;
  delete(id: string): Promise<void>;
}

export interface AddressSetStore {
  get(id: string): Promise<StoredAddressSet | null>;
  getByCampaign(campaignId: string): Promise<readonly StoredAddressSet[]>;
  put(set: StoredAddressSet): Promise<void>;
}

export interface AddressStore {
  getBySet(setId: string): Promise<readonly StoredAddress[]>;
  putBatch(addresses: readonly StoredAddress[]): Promise<void>;
  countBySet(setId: string): Promise<number>;
}

export interface BatchStore {
  get(id: string): Promise<StoredBatch | null>;
  getByCampaign(campaignId: string): Promise<readonly StoredBatch[]>;
  put(batch: StoredBatch): Promise<void>;
  getLastCompleted(campaignId: string): Promise<StoredBatch | null>;
}

export interface WalletStore {
  get(campaignId: string): Promise<StoredWallet | null>;
  put(wallet: StoredWallet): Promise<void>;
}

export interface PipelineConfigStore {
  get(campaignId: string): Promise<PipelineConfig | null>;
  put(campaignId: string, config: PipelineConfig): Promise<void>;
}

export interface ChainConfigStore {
  get(id: string): Promise<StoredChainConfig | null>;
  getByChainId(chainId: number): Promise<StoredChainConfig | null>;
  put(config: StoredChainConfig): Promise<void>;
  list(): Promise<readonly StoredChainConfig[]>;
  delete(id: string): Promise<void>;
}

export interface AppSettingsStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Storage {
  readonly campaigns: CampaignStore;
  readonly addressSets: AddressSetStore;
  readonly addresses: AddressStore;
  readonly batches: BatchStore;
  readonly wallets: WalletStore;
  readonly pipelineConfigs: PipelineConfigStore;
  readonly chainConfigs: ChainConfigStore;
  readonly appSettings: AppSettingsStore;
  readonly pipelineHistory: {
    append(campaignId: string, entry: PipelineHistoryEntry): Promise<void>;
    readAll(campaignId: string): Promise<readonly PipelineHistoryEntry[]>;
    count?(campaignId: string): Promise<number>;
  };
  readonly errors: {
    append(campaignId: string, entry: LoopErrorEntry): Promise<void>;
    readAll(campaignId: string): Promise<readonly LoopErrorEntry[]>;
  };
  readonly acquireLock?: (campaignId: string) => Promise<{ release: () => Promise<void> } | null>;
  readonly releaseLock?: (campaignId: string) => Promise<void>;
}

export type EncryptedKeyEnvelope = {
  readonly ciphertext: string;   // base64
  readonly iv: string;           // base64
  readonly authTag: string;      // base64
};

export type WalletRecord = {
  readonly index: number;
  readonly address: Address;
  readonly encryptedKey: EncryptedKeyEnvelope;
  readonly kdf: 'scrypt';
  readonly kdfParams: {
    readonly N: number;
    readonly r: number;
    readonly p: number;
    readonly salt: string;
  };
  readonly provenance:
    | {
        readonly type: 'derived';
        readonly coldAddress: Address;
        readonly derivationIndex: number;
      }
    | { readonly type: 'imported' };
  readonly createdAt: number;
};

export type BatchRecord = {
  readonly batchIndex: number;
  readonly recipients: readonly Address[];
  readonly amounts: readonly string[];
  readonly status: 'pending' | 'broadcast' | 'confirmed' | 'failed';
  readonly attempts: readonly BatchAttemptRecord[];
  readonly confirmedTxHash: Hex | null;
  readonly confirmedBlock: string | null;
  readonly createdAt: number;
};

export type SweepRecord = {
  readonly walletIndex: number;
  readonly walletAddress: Address;
  readonly balance: string;
  readonly txHash: Hex | null;
  readonly error: string | null;
  readonly createdAt: number;
};
