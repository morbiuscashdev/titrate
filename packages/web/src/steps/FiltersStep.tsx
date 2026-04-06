import { useState, useCallback } from 'react';
import { StepPanel } from '../components/StepPanel.js';
import { PipelineStepEditor, type PipelineStepEditorProps } from '../components/PipelineStepEditor.js';
import { useCampaign } from '../providers/CampaignProvider.js';
import { useStorage } from '../providers/StorageProvider.js';
import type { PipelineStep, FilterType } from '@titrate/sdk';

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
  const { storage } = useStorage();

  const [filters, setFilters] = useState<readonly FilterEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);

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
            <p className="mt-2 text-xs text-blue-500 dark:text-blue-400/70">
              Addresses will be filtered during distribution via the live filter pipeline.
            </p>
          </div>
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
