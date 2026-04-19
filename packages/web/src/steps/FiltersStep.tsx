import { useState, useCallback, useEffect } from 'react';
import type { Address } from 'viem';
import { StepPanel } from '../components/StepPanel.js';
import { PipelineStepEditor, type PipelineStepEditorProps } from '../components/PipelineStepEditor.js';
import { Button, Card } from '../components/ui';
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

  type FilterStageResult = {
    readonly filterType: string;
    readonly inputCount: number;
    readonly outputCount: number;
  };

  const [previewState, setPreviewState] = useState<{
    readonly status: 'idle' | 'running' | 'done' | 'error';
    readonly survivingCount: number;
    readonly totalCount: number;
    readonly errorMessage: string | null;
    readonly stages: readonly FilterStageResult[];
  }>({ status: 'idle', survivingCount: 0, totalCount: 0, errorMessage: null, stages: [] });

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
    setPreviewState({ status: 'idle', survivingCount: 0, totalCount: recipientCount, errorMessage: null, stages: [] });
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

    setPreviewState({ status: 'running', survivingCount: 0, totalCount: recipients.length, errorMessage: null, stages: [] });

    try {
      const stages: FilterStageResult[] = [];
      let currentAddresses: Address[] = [...recipients];

      for (const filter of filters) {
        const inputCount = currentAddresses.length;
        const pipeline = createPipeline({
          steps: [
            { type: 'source' as const, sourceType: 'csv' as const, params: { addresses: currentAddresses } as Record<string, unknown> },
            { type: 'filter' as const, filterType: filter.filterType, params: filter.params as Record<string, unknown> },
          ],
        });

        const surviving: Address[] = [];
        for await (const batch of pipeline.execute(publicClient ?? undefined)) {
          surviving.push(...batch);
        }

        stages.push({
          filterType: filter.filterType,
          inputCount,
          outputCount: surviving.length,
        });
        currentAddresses = surviving;
      }

      setPreviewState({
        status: 'done',
        survivingCount: currentAddresses.length,
        totalCount: recipients.length,
        errorMessage: null,
        stages,
      });
    } catch (err: unknown) {
      setPreviewState({
        status: 'error',
        survivingCount: 0,
        totalCount: recipients.length,
        errorMessage: err instanceof Error ? err.message : 'Filter preview failed',
        stages: [],
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
              <Card key={filter.id}>
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[color:var(--fg-primary)]">
                    Filter {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFilter(filter.id)}
                    className="font-mono text-xs uppercase tracking-[0.1em] text-[color:var(--fg-muted)] hover:text-[color:var(--color-err)] transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-[1px] focus-visible:outline-[color:var(--color-info)] rounded-sm"
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
              </Card>
            ))}
          </div>
        )}

        {/* Add Filter */}
        <Button variant="secondary" onClick={handleAddFilter}>
          + Add Filter
        </Button>

        {/* Filter summary */}
        {filters.length > 0 && (
          <div className="border-2 border-[color:var(--color-info)]/30 bg-[color:var(--color-info)]/10 p-3">
            <p className="font-mono text-sm font-semibold text-[color:var(--color-info)]">
              {filters.length} {filters.length === 1 ? 'filter' : 'filters'} configured
            </p>
            <ul className="mt-1 list-disc list-inside font-mono text-xs text-[color:var(--color-info)]/80">
              {filters.map((f) => (
                <li key={f.id}>{getFilterLabel(f.filterType)}</li>
              ))}
            </ul>
            {previewState.status === 'done' ? (
              <p className="mt-2 font-mono text-xs text-[color:var(--color-ok)]">
                {previewState.survivingCount.toLocaleString()} of {previewState.totalCount.toLocaleString()} addresses will receive tokens.
              </p>
            ) : (
              <p className="mt-2 font-mono text-xs text-[color:var(--color-info)]/80">
                Use Preview Filters to see how many addresses pass.
              </p>
            )}
          </div>
        )}

        {/* Filter Preview */}
        {filters.length > 0 && recipients.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                variant="secondary"
                onClick={handlePreview}
                disabled={previewState.status === 'running'}
              >
                {previewState.status === 'running' ? 'Running...' : 'Preview Filters'}
              </Button>
              {previewState.status === 'done' && (
                <span role="status" className="font-mono text-sm text-[color:var(--fg-muted)]">
                  <span className="font-semibold text-[color:var(--color-ok)]">{previewState.survivingCount.toLocaleString()}</span>
                  {' '}of{' '}
                  <span className="font-semibold text-[color:var(--fg-primary)]">{previewState.totalCount.toLocaleString()}</span>
                  {' '}addresses pass
                </span>
              )}
            </div>
            {previewState.status === 'done' && previewState.stages.length > 0 && (
              <Card className="p-3">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[color:var(--fg-muted)] mb-2">Per-filter breakdown</p>
                <div className="space-y-1">
                  {previewState.stages.map((stage, i) => {
                    const removed = stage.inputCount - stage.outputCount;
                    return (
                      <div key={i} className="flex items-center justify-between font-mono text-xs">
                        <span className="text-[color:var(--fg-primary)]">{getFilterLabel(stage.filterType)}</span>
                        <span className="text-[color:var(--fg-muted)]">
                          {stage.inputCount.toLocaleString()} → {stage.outputCount.toLocaleString()}
                          {removed > 0 && (
                            <span className="text-[color:var(--color-err)] ml-1">(-{removed.toLocaleString()})</span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
            {previewState.status === 'running' && (
              <div className="flex items-center gap-2 font-mono text-sm text-[color:var(--fg-muted)]">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
                </svg>
                Running filters against {previewState.totalCount.toLocaleString()} addresses...
              </div>
            )}
            {previewState.status === 'error' && (
              <div className="border-2 border-[color:var(--color-err)]/40 bg-[color:var(--color-err)]/10 p-3 font-mono text-sm text-[color:var(--color-err)]">
                {previewState.errorMessage}
              </div>
            )}
          </div>
        )}

        {/* No addresses loaded hint */}
        {filters.length > 0 && recipients.length === 0 && (
          <p className="font-mono text-xs text-[color:var(--fg-muted)]">
            No addresses loaded yet. Add addresses first to preview filter results.
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3 flex-wrap">
          {filters.length === 0 ? (
            <Button variant="primary" onClick={handleSkip}>
              Skip Filters
            </Button>
          ) : (
            <Button variant="primary" onClick={handleContinue} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save & Continue'}
            </Button>
          )}
        </div>
      </div>
    </StepPanel>
  );
}
