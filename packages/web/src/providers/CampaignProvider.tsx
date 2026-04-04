import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import type { StoredCampaign, StoredAddressSet } from '@titrate/sdk';
import { useStorage } from './StorageProvider.js';

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

/** Identifier for each step in the campaign workflow. */
export type StepId =
  | 'campaign'
  | 'addresses'
  | 'filters'
  | 'amounts'
  | 'wallet'
  | 'requirements'
  | 'distribute';

/** Runtime state of a single step. */
export type StepState = {
  readonly id: StepId;
  readonly label: string;
  readonly status: 'complete' | 'active' | 'locked';
};

/** Ordered step definitions used by the UI and step-locking logic. */
export const STEP_DEFINITIONS: readonly { readonly id: StepId; readonly label: string }[] = [
  { id: 'campaign', label: 'Campaign' },
  { id: 'addresses', label: 'Addresses' },
  { id: 'filters', label: 'Filters' },
  { id: 'amounts', label: 'Amounts' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'requirements', label: 'Requirements' },
  { id: 'distribute', label: 'Distribute' },
];

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// ---------------------------------------------------------------------------
// Pure step-state computation
// ---------------------------------------------------------------------------

/**
 * Determine the locked/active/complete status of every step.
 *
 * This is a pure function with no side effects so it can be tested in
 * isolation without mounting a React tree.
 *
 * @param campaign - The active campaign, or null if none is selected.
 * @param addressSetCount - Number of 'source' address sets for the campaign.
 * @param completedSteps - Steps that have been explicitly marked complete
 *   (used for steps like wallet/requirements that lack intrinsic data checks).
 */
export function computeStepStates(
  campaign: StoredCampaign | null,
  addressSetCount: number,
  completedSteps: ReadonlySet<StepId>,
): readonly StepState[] {
  const isComplete = (id: StepId): boolean => {
    if (completedSteps.has(id)) {
      return true;
    }

    switch (id) {
      case 'campaign':
        return campaign !== null && campaign.chainId > 0 && campaign.tokenAddress !== ZERO_ADDRESS;
      case 'addresses':
        return addressSetCount > 0;
      case 'filters':
        // For now, filters are considered complete when addresses exist.
        // Will be refined once pipeline config UI is built.
        return addressSetCount > 0;
      case 'amounts':
        return (
          campaign !== null &&
          (campaign.uniformAmount !== null || campaign.amountMode === 'variable')
        );
      case 'wallet':
        return false;
      case 'requirements':
        return false;
      case 'distribute':
        return false;
    }
  };

  let foundActive = false;
  const states: StepState[] = [];

  for (const def of STEP_DEFINITIONS) {
    if (foundActive) {
      states.push({ id: def.id, label: def.label, status: 'locked' });
      continue;
    }

    const complete = isComplete(def.id);
    if (complete) {
      states.push({ id: def.id, label: def.label, status: 'complete' });
      continue;
    }

    // First non-complete step that is *unlockable* becomes active.
    // A step is unlockable if all preceding steps are complete. Since we
    // iterate in order and haven't found a non-complete step yet, this step
    // is the first gap — it's active.
    states.push({ id: def.id, label: def.label, status: 'active' });
    foundActive = true;
  }

  // Edge case: no campaign selected — only campaign step is active.
  if (states.length === 0) {
    return STEP_DEFINITIONS.map((def, index) => ({
      id: def.id,
      label: def.label,
      status: index === 0 ? 'active' : 'locked' as const,
    }));
  }

  return states;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/** Values exposed by the campaign context. */
export type CampaignContextValue = {
  readonly campaigns: readonly StoredCampaign[];
  readonly activeCampaign: StoredCampaign | null;
  readonly activeStepId: StepId;
  readonly stepStates: readonly StepState[];
  readonly setActiveCampaign: (id: string | null) => void;
  readonly setActiveStep: (stepId: StepId) => void;
  readonly createCampaign: (
    config: Omit<StoredCampaign, 'id' | 'createdAt' | 'updatedAt'>,
  ) => Promise<string>;
  readonly saveCampaign: (campaign: StoredCampaign) => Promise<void>;
  readonly refreshCampaigns: () => Promise<void>;
};

const CampaignContext = createContext<CampaignContextValue | null>(null);

export type CampaignProviderProps = {
  readonly children: ReactNode;
};

/**
 * Provides campaign management and step-locking state to the component tree.
 *
 * Reads campaigns from IndexedDB via the StorageProvider, tracks the active
 * campaign selection, and computes which workflow steps are available based
 * on the campaign's configuration progress.
 */
export function CampaignProvider({ children }: CampaignProviderProps) {
  const { storage } = useStorage();

  const [campaigns, setCampaigns] = useState<readonly StoredCampaign[]>([]);
  const [activeCampaign, setActiveCampaignState] = useState<StoredCampaign | null>(null);
  const [addressSets, setAddressSets] = useState<readonly StoredAddressSet[]>([]);
  const [completedSteps, setCompletedSteps] = useState<ReadonlySet<StepId>>(new Set());
  const [activeStepOverride, setActiveStepOverride] = useState<StepId | null>(null);

  // Load all campaigns when storage becomes available
  const refreshCampaigns = useCallback(async () => {
    if (!storage) {
      return;
    }
    const list = await storage.campaigns.list();
    setCampaigns(list);
  }, [storage]);

  useEffect(() => {
    void refreshCampaigns();
  }, [refreshCampaigns]);

  // Set the active campaign by id, loading its address sets
  const setActiveCampaign = useCallback(
    (id: string | null) => {
      if (!id || !storage) {
        setActiveCampaignState(null);
        setAddressSets([]);
        setCompletedSteps(new Set());
        setActiveStepOverride(null);
        return;
      }

      void (async () => {
        const campaign = await storage.campaigns.get(id);
        setActiveCampaignState(campaign);

        if (campaign) {
          const sets = await storage.addressSets.getByCampaign(campaign.id);
          setAddressSets(sets);
        } else {
          setAddressSets([]);
        }
        setCompletedSteps(new Set());
        setActiveStepOverride(null);
      })();
    },
    [storage],
  );

  // Navigate to a specific step (only if it's not locked)
  const setActiveStep = useCallback((stepId: StepId) => {
    setActiveStepOverride(stepId);
  }, []);

  // Create a new campaign, save it, refresh the list, and return its id
  const createCampaign = useCallback(
    async (config: Omit<StoredCampaign, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
      if (!storage) {
        throw new Error('Storage not initialized');
      }
      const id = crypto.randomUUID();
      const now = Date.now();
      const campaign: StoredCampaign = {
        ...config,
        id,
        createdAt: now,
        updatedAt: now,
      };
      await storage.campaigns.put(campaign);
      await refreshCampaigns();
      return id;
    },
    [storage, refreshCampaigns],
  );

  // Save an existing campaign (updates updatedAt), refresh list
  const saveCampaign = useCallback(
    async (campaign: StoredCampaign): Promise<void> => {
      if (!storage) {
        throw new Error('Storage not initialized');
      }
      const updated: StoredCampaign = {
        ...campaign,
        updatedAt: Date.now(),
      };
      await storage.campaigns.put(updated);
      await refreshCampaigns();

      // If this is the active campaign, refresh it in state
      if (activeCampaign && activeCampaign.id === campaign.id) {
        setActiveCampaignState(updated);
        const sets = await storage.addressSets.getByCampaign(updated.id);
        setAddressSets(sets);
      }
    },
    [storage, refreshCampaigns, activeCampaign],
  );

  // Compute step states from campaign data
  const sourceSetCount = useMemo(
    () => addressSets.filter((s) => s.type === 'source').length,
    [addressSets],
  );

  const stepStates = useMemo(
    () => computeStepStates(activeCampaign, sourceSetCount, completedSteps),
    [activeCampaign, sourceSetCount, completedSteps],
  );

  // Determine the current active step id
  const activeStepId = useMemo((): StepId => {
    // If there's an override and the step isn't locked, use it
    if (activeStepOverride) {
      const overrideState = stepStates.find((s) => s.id === activeStepOverride);
      if (overrideState && overrideState.status !== 'locked') {
        return activeStepOverride;
      }
    }
    // Default to the first step with 'active' status
    const activeState = stepStates.find((s) => s.status === 'active');
    return activeState ? activeState.id : 'campaign';
  }, [stepStates, activeStepOverride]);

  const value = useMemo(
    (): CampaignContextValue => ({
      campaigns,
      activeCampaign,
      activeStepId,
      stepStates,
      setActiveCampaign,
      setActiveStep,
      createCampaign,
      saveCampaign,
      refreshCampaigns,
    }),
    [
      campaigns,
      activeCampaign,
      activeStepId,
      stepStates,
      setActiveCampaign,
      setActiveStep,
      createCampaign,
      saveCampaign,
      refreshCampaigns,
    ],
  );

  return (
    <CampaignContext.Provider value={value}>
      {children}
    </CampaignContext.Provider>
  );
}

/**
 * Access the current campaign context.
 *
 * @throws When called outside of a `<CampaignProvider>`.
 */
export function useCampaign(): CampaignContextValue {
  const context = useContext(CampaignContext);
  if (!context) {
    throw new Error('useCampaign must be used within a CampaignProvider');
  }
  return context;
}
