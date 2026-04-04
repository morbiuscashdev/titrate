import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import type { Address } from 'viem';
import { CampaignCard } from '../components/CampaignCard.js';
import { useCampaign } from '../providers/CampaignProvider.js';
import { getChainConfig } from '@titrate/sdk';

/** Derive a display status from campaign data for the CampaignCard badge. */
function deriveCampaignStatus(campaign: {
  readonly chainId: number;
  readonly tokenAddress: string;
}): 'draft' | 'ready' | 'distributing' | 'complete' {
  const ZERO = '0x0000000000000000000000000000000000000000';
  if (campaign.chainId === 0 || campaign.tokenAddress === ZERO) {
    return 'draft';
  }
  return 'ready';
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
  const { campaigns, createCampaign, deleteCampaign } = useCampaign();
  const navigate = useNavigate();

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
      await deleteCampaign(id);
    },
    [deleteCampaign],
  );

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
              addressCount={0}
              batchProgress={{ completed: 0, total: 0 }}
              status={deriveCampaignStatus(campaign)}
              onClick={() => handleCardClick(campaign.id)}
            />
            <button
              type="button"
              onClick={(e) => handleDelete(e, campaign.id)}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-1 text-gray-500 hover:text-red-400 hover:bg-gray-800"
              aria-label={`Delete ${campaign.name}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
