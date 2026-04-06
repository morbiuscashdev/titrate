import { useState, useCallback, useEffect } from 'react';
import type { Address } from 'viem';
import { StepPanel } from '../components/StepPanel.js';
import { PipelineStepEditor, type PipelineStepEditorProps } from '../components/PipelineStepEditor.js';
import { useCampaign } from '../providers/CampaignProvider.js';
import { useChain } from '../providers/ChainProvider.js';
import { useStorage } from '../providers/StorageProvider.js';
import { createPipeline, type PipelineStep, type FilterType } from '@titrate/sdk';

type FilterEntry = {
  readonly id: string;
  readonly filterType: FilterType;
  readonly params: Record<string, string>;
};

/** Human-readable labels for each filter type. */
const FILTER_LABELS: Record<string, string> = {
  'contract-check': 'Exclude Contracts',
  'min-balance': 'Min Balance',
  'nonce-range': 'Nonce Range',
  'token-recipients': 'Token Recipients',
  'csv-exclusion': 'CSV Exclusion',
};

/**
 * Returns a human-readable label for a filter type.
 * Falls back to the raw type string if no label is defined.
 */
export function getFilterLabel(filterType: string): string {
  return FILTER_LABELS[filterType] ?? filterType;
}

const DEFAULT_FILTER_TYPE: FilterType = 'contract-check';

/**
 * Step 3: Pipeline filter configuration.
 *
 * Allows users to add optional filters before the amounts step.
 * Each filter uses the PipelineStepEditor component for type
 * selection and parameter editing.
 */
export function FiltersStep() {
  const { activeCampaign, setActiveStep, completeStep } = useCampaign();
  const { publicClient } = useChain();
  const { storage } = useStorage();

  const [filters, setFilters] = useState<readonly FilterEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const [recipients, setRecipients] = useState<readonly Address[]>([]);
  const [recipientCount, setRecipientCount] = useState(0);

  const [previewState, setPreviewState] = useState<{
    readonly status: 'idle' | 'running' | 'done' | 'error';
    readonly survivingCount: number;
    readonly totalCount: number;
    readonly errorMessage: string | null;
  }>({ status: 'idle', survivingCount: 0, totalCount: 0, errorMessage: null });

  /** Load recipient addresses from IDB when the campaign is active. */
  useEffect(() => {
    if (!storage || !activeCampaign) return;
    void (async () => {
      const sets = await storage.addressSets.getByCampaign(activeCampaign.id);
      const sourceSets = sets.filter((s: { type: string }) => s.type === 'source');
      const allAddresses: Address[] = [];
      for (const set of sourceSets) {
        const addrs = await storage.addresses.getBySet(set.id);
        for (const a of addrs) allAddresses.push(a.address);
      }
      setRecipients(allAddresses);
      setRecipientCount(allAddresses.length);
    })();
  }, [storage, activeCampaign]);

  /** Reset preview whenever filters or recipient count change. */
  useEffect(() => {
    setPreviewState({ status: 'idle', survivingCount: 0, totalCount: recipientCount, errorMessage: null });
  }, [filters, recipientCount]);

  const handleAddFilter = useCallback(() => {
    setFilters((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        filterType: DEFAULT_FILTER_TYPE,
        params: {},
      },
    ]);
  }, []);

  const handleRemoveFilter = useCallback((id: string) => {
    setFilters((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleFilterTypeChange = useCallback((id: string, type: string) => {
    setFilters((prev) =>
      prev.map((f) => (f.id === id ? { ...f, filterType: type as FilterType, params: {} } : f)),
    );
  }, []);

  const handleFilterParamsChange = useCallback((id: string, params: Record<string, string>) => {
    setFilters((prev) =>
      prev.map((f) => (f.id === id ? { ...f, params } : f)),
    );
  }, []);

  const handlePreview = useCallback(async () => {
    if (filters.length === 0 || recipients.length === 0) return;

    setPreviewState({ status: 'running', survivingCount: 0, totalCount: recipients.length, errorMessage: null });

    try {
      const steps = filters.map((f) => ({
        type: 'filter' as const,
        filterType: f.filterType,
        params: f.params as Record<string, unknown>,
      }));

      const pipeline = createPipeline({
        steps: [
          { type: 'source' as const, sourceType: 'csv' as const, params: { addresses: recipients } as Record<string, unknown> },
          ...steps,
        ],
      });

      const surviving: Address[] = [];
      for await (const batch of pipeline.execute(publicClient ?? undefined)) {
        surviving.push(...batch);
      }

      setPreviewState({
        status: 'done',
        survivingCount: surviving.length,
        totalCount: recipients.length,
        errorMessage: null,
      });
    } catch (err: unknown) {
      setPreviewState({
        status: 'error',
        survivingCount: 0,
        totalCount: recipients.length,
        errorMessage: err instanceof Error ? err.message : 'Filter preview failed',
      });
    }
  }, [filters, recipients, publicClient]);

  const handleContinue = useCallback(async () => {
    if (!storage || !activeCampaign) {
      return;
    }

    setIsSaving(true);
    try {
      if (filters.length > 0) {
        const steps: readonly PipelineStep[] = filters.map((f) => ({
          type: 'filter' as const,
          filterType: f.filterType,
          params: f.params as Record<string, unknown>,
        }));
        await storage.pipelineConfigs.put(activeCampaign.id, { steps });
      }
      completeStep('filters');
      setActiveStep('amounts');
    } finally {
      setIsSaving(false);
    }
  }, [storage, activeCampaign, filters, setActiveStep]);

  const handleSkip = useCallback(() => {
    completeStep('filters');
    setActiveStep('amounts');
  }, [completeStep, setActiveStep]);

  return (
    <StepPanel title="Filters" description="Optionally filter addresses before distribution.">
      <div className="space-y-6">
        {/* Filter List */}
        {filters.length > 0 && (
          <div className="space-y-4">
            {filters.map((filter, index) => (
              <div key={filter.id} className="rounded-lg bg-gray-50 dark:bg-gray-900 p-4 ring-1 ring-gray-200 dark:ring-gray-800">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Filter {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFilter(filter.id)}
                    className="text-xs text-gray-400 dark:text-gray-500 hover:text-red-400 transition-colors"
                  >
                    Remove
                  </button>
                </div>
                <PipelineStepEditor
                  stepType="filter"
                  filterType={filter.filterType as PipelineStepEditorProps['filterType']}
                  params={filter.params}
                  onTypeChange={(type) => handleFilterTypeChange(filter.id, type)}
                  onParamsChange={(params) => handleFilterParamsChange(filter.id, params)}
                />
              </div>
            ))}
          </div>
        )}

        {/* Add Filter */}
        <button
          type="button"
          onClick={handleAddFilter}
          className="bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          + Add Filter
        </button>

        {/* Filter summary */}
        {filters.length > 0 && (
          <div className="rounded-md bg-blue-900/10 dark:bg-blue-900/20 p-3 text-sm text-blue-700 dark:text-blue-400 ring-1 ring-blue-200 dark:ring-blue-900/30">
            <p className="font-medium">
              {filters.length} {filters.length === 1 ? 'filter' : 'filters'} configured
            </p>
            <ul className="mt-1 list-disc list-inside text-xs text-blue-600 dark:text-blue-300">
              {filters.map((f) => (
                <li key={f.id}>{getFilterLabel(f.filterType)}</li>
              ))}
            </ul>
            {previewState.status === 'done' ? (
              <p className="mt-2 text-xs text-green-600 dark:text-green-400/70">
                {previewState.survivingCount.toLocaleString()} of {previewState.totalCount.toLocaleString()} addresses will receive tokens.
              </p>
            ) : (
              <p className="mt-2 text-xs text-blue-500 dark:text-blue-400/70">
                Use Preview Filters to see how many addresses pass.
              </p>
            )}
          </div>
        )}

        {/* Filter Preview */}
        {filters.length > 0 && recipients.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handlePreview}
                disabled={previewState.status === 'running'}
                className="bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 disabled:opacity-50 text-gray-600 dark:text-gray-300 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                {previewState.status === 'running' ? 'Running...' : 'Preview Filters'}
              </button>
              {previewState.status === 'done' && (
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  <span className="font-medium text-green-600 dark:text-green-400">{previewState.survivingCount.toLocaleString()}</span>
                  {' '}of{' '}
                  <span className="font-medium">{previewState.totalCount.toLocaleString()}</span>
                  {' '}addresses pass
                </span>
              )}
            </div>
            {previewState.status === 'running' && (
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
                </svg>
                Running filters against {previewState.totalCount.toLocaleString()} addresses...
              </div>
            )}
            {previewState.status === 'error' && (
              <div className="rounded-md bg-red-900/20 p-3 text-sm text-red-400 ring-1 ring-red-900/30">
                {previewState.errorMessage}
              </div>
            )}
          </div>
        )}

        {/* No addresses loaded hint */}
        {filters.length > 0 && recipients.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            No addresses loaded yet. Add addresses first to preview filter results.
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {filters.length === 0 ? (
            <button
              type="button"
              onClick={handleSkip}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              Skip Filters
            </button>
          ) : (
            <button
              type="button"
              onClick={handleContinue}
              disabled={isSaving}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              {isSaving ? 'Saving...' : 'Save & Continue'}
            </button>
          )}
        </div>
      </div>
    </StepPanel>
  );
}
