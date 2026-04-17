import type { CampaignManifest } from '@titrate/sdk';

export type StepId = 'campaign' | 'addresses' | 'filters' | 'amounts' | 'wallet' | 'distribute';

export type StepStatus = 'done' | 'todo' | 'blocked' | 'warning';

export type StepState = {
  readonly id: StepId;
  readonly status: StepStatus;
  readonly summary: string;
};

export type StepCounts = {
  readonly addresses: number;
  readonly filtered: number;
  readonly wallets: number;
  readonly batches: number;
};

export function deriveStepStates(
  manifest: CampaignManifest,
  counts: StepCounts,
): readonly StepState[] {
  const campaignDone =
    manifest.chainId > 0 &&
    manifest.tokenAddress !== '0x0000000000000000000000000000000000000000';

  const addressesDone = counts.addresses > 0;
  const filtersDone = counts.filtered > 0 || counts.addresses > 0;
  const amountsDone = manifest.amountMode === 'uniform'
    ? manifest.uniformAmount !== null && manifest.uniformAmount !== ''
    : false;
  const walletsDone = counts.wallets > 0 || manifest.wallets.mode === 'derived';

  const distributeBlocked = !(addressesDone && filtersDone && amountsDone && walletsDone);

  return [
    {
      id: 'campaign',
      status: campaignDone ? 'done' : 'todo',
      summary: campaignDone ? `chain ${manifest.chainId}` : 'not configured',
    },
    {
      id: 'addresses',
      status: addressesDone ? 'done' : 'todo',
      summary: addressesDone ? `${counts.addresses} sourced` : 'not configured',
    },
    {
      id: 'filters',
      status: filtersDone ? 'done' : 'todo',
      summary: filtersDone ? `${counts.filtered} qualified` : 'not configured',
    },
    {
      id: 'amounts',
      status: amountsDone ? 'done' : 'todo',
      summary: amountsDone ? `${manifest.amountMode}` : 'pending',
    },
    {
      id: 'wallet',
      status: walletsDone ? 'done' : 'todo',
      summary: walletsDone
        ? `${manifest.wallets.mode} · ${counts.wallets || (manifest.wallets.mode === 'derived' ? manifest.wallets.count : 0)}`
        : 'not configured',
    },
    {
      id: 'distribute',
      status: distributeBlocked ? 'blocked' : (counts.batches > 0 ? 'done' : 'todo'),
      summary: distributeBlocked ? 'blocked' : counts.batches > 0 ? `${counts.batches} batches` : 'ready',
    },
  ];
}
