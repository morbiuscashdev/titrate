import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Address } from 'viem';
import { CampaignCard } from '../components/CampaignCard.js';
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
  const { campaigns, createCampaign, deleteCampaign, cloneCampaign } = useCampaign();
  const { storage } = useStorage();
  const navigate = useNavigate();

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

  const handleClone = useCallback(
    async (event: React.MouseEvent, id: string) => {
      event.stopPropagation();
      const newId = await cloneCampaign(id);
      navigate(`/campaign/${newId}`);
    },
    [cloneCampaign, navigate],
  );

  // Show loading state while storage initializes
  if (!storage) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-gray-500">Loading...</p>
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-white">Campaigns</h1>
        <button
          type="button"
          onClick={handleCreate}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
        >
          New Campaign
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {campaigns.map((campaign) => (
          <div key={campaign.id} className="relative group">
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
