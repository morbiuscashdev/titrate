import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Address } from 'viem';
import { CampaignCard } from '../components/CampaignCard.js';
import { CampaignCardSkeleton } from '../components/CampaignCardSkeleton.js';
import { Skeleton } from '../components/Skeleton.js';
import { InlineEdit } from '../components/InlineEdit.js';
import { useCampaign } from '../providers/CampaignProvider.js';
import { useStorage } from '../providers/StorageProvider.js';
import { getChainConfig } from '@titrate/sdk';

/** Derive a display status from campaign data and batch progress. */
function deriveCampaignStatus(
  campaign: { readonly chainId: number; readonly tokenAddress: string },
  stats?: { completedBatches: number; totalBatches: number },
): 'draft' | 'ready' | 'distributing' | 'complete' {
  const ZERO = '0x0000000000000000000000000000000000000000';
  if (campaign.chainId === 0 || campaign.tokenAddress === ZERO) return 'draft';
  if (!stats || stats.totalBatches === 0) return 'ready';
  if (stats.completedBatches >= stats.totalBatches) return 'complete';
  return 'distributing';
}

const CAMPAIGN_DEFAULTS = {
  funder: '0x0000000000000000000000000000000000000000' as Address,
  name: 'New Campaign',
  version: 1,
  chainId: 0,
  rpcUrl: '',
  tokenAddress: '0x0000000000000000000000000000000000000000' as Address,
  tokenDecimals: 18,
  contractAddress: null,
  contractVariant: 'simple' as const,
  contractName: '',
  amountMode: 'uniform' as const,
  amountFormat: 'integer' as const,
  uniformAmount: null,
  batchSize: 100,
  campaignId: null,
  pinnedBlock: null,
} as const;

/**
 * Campaign dashboard grid.
 *
 * Displays all stored campaigns as cards and provides a "New Campaign" action
 * that creates a campaign with defaults and navigates to the campaign editor.
 */
export function HomePage() {
  useEffect(() => { document.title = 'Titrate'; }, []);
  const { campaigns, createCampaign, deleteCampaign, cloneCampaign, saveCampaign } = useCampaign();
  const { storage } = useStorage();
  const navigate = useNavigate();
  const [showArchived, setShowArchived] = useState(false);

  const visibleCampaigns = showArchived
    ? campaigns
    : campaigns.filter((c) => !c.archived);

  // Load address counts and batch progress per campaign
  const [campaignStats, setCampaignStats] = useState<Record<string, { addresses: number; completedBatches: number; totalBatches: number }>>({});
  useEffect(() => {
    if (!storage || campaigns.length === 0) return;
    void (async () => {
      const stats: Record<string, { addresses: number; completedBatches: number; totalBatches: number }> = {};
      for (const campaign of campaigns) {
        const sets = await storage.addressSets.getByCampaign(campaign.id);
        const addresses = sets
          .filter((s) => s.type === 'source')
          .reduce((sum, s) => sum + s.addressCount, 0);
        const batches = await storage.batches.getByCampaign(campaign.id);
        stats[campaign.id] = {
          addresses,
          completedBatches: batches.filter((b) => b.status === 'confirmed').length,
          totalBatches: batches.length,
        };
      }
      setCampaignStats(stats);
    })();
  }, [storage, campaigns]);

  const handleCreate = useCallback(async () => {
    const id = await createCampaign(CAMPAIGN_DEFAULTS);
    navigate(`/campaign/${id}`);
  }, [createCampaign, navigate]);

  // Keyboard shortcut: Cmd/Ctrl+N creates a new campaign
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        void handleCreate();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleCreate]);

  const handleCardClick = useCallback(
    (id: string) => {
      navigate(`/campaign/${id}`);
    },
    [navigate],
  );

  const handleDelete = useCallback(
    async (event: React.MouseEvent, id: string) => {
      event.stopPropagation();
      const campaign = campaigns.find((c) => c.id === id);
      const name = campaign?.name ?? 'this campaign';
      if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
      await deleteCampaign(id);
    },
    [deleteCampaign, campaigns],
  );

  const handleRename = useCallback(
    async (event: React.MouseEvent, id: string) => {
      event.stopPropagation();
      const campaign = campaigns.find((c) => c.id === id);
      if (!campaign) return;
      const newName = window.prompt('Rename campaign:', campaign.name);
      if (!newName || newName.trim() === campaign.name) return;
      await saveCampaign({ ...campaign, name: newName.trim() });
    },
    [campaigns, saveCampaign],
  );

  const handleArchive = useCallback(
    async (event: React.MouseEvent, id: string) => {
      event.stopPropagation();
      const campaign = campaigns.find((c) => c.id === id);
      if (!campaign) return;
      await saveCampaign({ ...campaign, archived: !campaign.archived });
    },
    [campaigns, saveCampaign],
  );

  const handleClone = useCallback(
    async (event: React.MouseEvent, id: string) => {
      event.stopPropagation();
      const newId = await cloneCampaign(id);
      navigate(`/campaign/${newId}`);
    },
    [cloneCampaign, navigate],
  );

  // Show skeleton grid while storage initializes
  if (!storage) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <CampaignCardSkeleton />
          <CampaignCardSkeleton />
          <CampaignCardSkeleton />
        </div>
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <p className="text-gray-500">No campaigns yet</p>
        <button
          type="button"
          onClick={handleCreate}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
        >
          New Campaign
        </button>
      </div>
    );
  }

  const archivedCount = campaigns.filter((c) => c.archived).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <h1 className="text-lg font-semibold text-white">Campaigns</h1>
          {archivedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              {showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={handleCreate}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
        >
          New Campaign
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleCampaigns.map((campaign) => (
          <div key={campaign.id} className={`relative group ${campaign.archived ? 'opacity-50' : ''}`}>
            <CampaignCard
              name={campaign.name}
              chainName={campaign.chainId > 0 ? (getChainConfig(campaign.chainId)?.name ?? `Chain ${campaign.chainId}`) : 'Not configured'}
              tokenSymbol={campaign.tokenAddress === '0x0000000000000000000000000000000000000000' ? 'N/A' : (campaign.contractName || `${campaign.tokenAddress.slice(0, 6)}...`)}
              addressCount={campaignStats[campaign.id]?.addresses ?? 0}
              batchProgress={{
                completed: campaignStats[campaign.id]?.completedBatches ?? 0,
                total: campaignStats[campaign.id]?.totalBatches ?? 0,
              }}
              status={deriveCampaignStatus(campaign, campaignStats[campaign.id])}
              onClick={() => handleCardClick(campaign.id)}
            />
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={(e) => handleRename(e, campaign.id)}
                className="rounded-full p-1 text-gray-500 hover:text-green-400 hover:bg-gray-800"
                aria-label={`Rename ${campaign.name}`}
                title="Rename"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={(e) => handleArchive(e, campaign.id)}
                className="rounded-full p-1 text-gray-500 hover:text-yellow-400 hover:bg-gray-800"
                aria-label={campaign.archived ? `Unarchive ${campaign.name}` : `Archive ${campaign.name}`}
                title={campaign.archived ? 'Unarchive' : 'Archive'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M2 3a1 1 0 00-1 1v1a1 1 0 001 1h16a1 1 0 001-1V4a1 1 0 00-1-1H2z" />
                  <path fillRule="evenodd" d="M2 7.5h16l-.811 7.71a2 2 0 01-1.99 1.79H4.802a2 2 0 01-1.99-1.79L2 7.5zM7 11a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1z" clipRule="evenodd" />
                </svg>
              </button>
              <button
                type="button"
                onClick={(e) => handleClone(e, campaign.id)}
                className="rounded-full p-1 text-gray-500 hover:text-blue-400 hover:bg-gray-800"
                aria-label={`Clone ${campaign.name}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                  <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={(e) => handleDelete(e, campaign.id)}
                className="rounded-full p-1 text-gray-500 hover:text-red-400 hover:bg-gray-800"
                aria-label={`Delete ${campaign.name}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
