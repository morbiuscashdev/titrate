import { useState, useCallback, useEffect } from 'react';
import { union, intersect, difference, symmetricDifference } from '@titrate/sdk';
import { useCampaign } from '../providers/CampaignProvider.js';
import { useStorage } from '../providers/StorageProvider.js';
import { Button, Card, Select } from './ui';
import type { Address } from 'viem';

type SetInfo = {
  readonly id: string;
  readonly name: string;
  readonly addressCount: number;
};

type Operation = 'union' | 'intersect' | 'difference' | 'symmetricDifference';

const OPERATION_LABELS: Record<Operation, string> = {
  union: 'Union (A + B)',
  intersect: 'Intersect (A \u2229 B)',
  difference: 'Difference (A - B)',
  symmetricDifference: 'Symmetric Diff (A \u25B3 B)',
};

const TOGGLE_BASE = 'rounded-none border-2 px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-[0.12em] transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-[1px] focus-visible:outline-[color:var(--color-info)]';
const TOGGLE_ACTIVE = 'bg-[color:var(--color-pink-500)] text-white border-[color:var(--color-pink-500)]';
const TOGGLE_INACTIVE = 'bg-[color:var(--bg-card)] text-[color:var(--fg-muted)] border-[color:var(--edge)] hover:text-[color:var(--fg-primary)]';

/**
 * Panel for combining address sets using set operations.
 * Shows available sets, lets users pick two and an operation,
 * then saves the result as a new derived set.
 */
export function SetOperationsPanel() {
  const { activeCampaign } = useCampaign();
  const { storage } = useStorage();

  const [sets, setSets] = useState<readonly SetInfo[]>([]);
  const [setA, setSetA] = useState<string | null>(null);
  const [setB, setSetB] = useState<string | null>(null);
  const [operation, setOperation] = useState<Operation>('union');
  const [result, setResult] = useState<{
    readonly status: 'idle' | 'computing' | 'done' | 'error';
    readonly count: number;
    readonly errorMessage: string | null;
  }>({ status: 'idle', count: 0, errorMessage: null });

  useEffect(() => {
    if (!storage || !activeCampaign) return;
    void (async () => {
      const allSets = await storage.addressSets.getByCampaign(activeCampaign.id);
      setSets(allSets.map((s) => ({ id: s.id, name: s.name, addressCount: s.addressCount })));
    })();
  }, [storage, activeCampaign]);

  const handleCompute = useCallback(async () => {
    if (!storage || !setA || !setB) return;

    setResult({ status: 'computing', count: 0, errorMessage: null });

    try {
      const [addrsA, addrsB] = await Promise.all([
        storage.addresses.getBySet(setA),
        storage.addresses.getBySet(setB),
      ]);

      const listA: Address[] = addrsA.map((a) => a.address);
      const listB: Address[] = addrsB.map((a) => a.address);

      let resultAddresses: Address[];
      switch (operation) {
        case 'union':
          resultAddresses = union(listA, listB);
          break;
        case 'intersect':
          resultAddresses = intersect(listA, listB);
          break;
        case 'difference':
          resultAddresses = difference(listA, listB);
          break;
        case 'symmetricDifference':
          resultAddresses = symmetricDifference(listA, listB);
          break;
      }

      if (resultAddresses.length > 0 && activeCampaign) {
        const setId = crypto.randomUUID();
        const nameA = sets.find((s) => s.id === setA)?.name ?? 'A';
        const nameB = sets.find((s) => s.id === setB)?.name ?? 'B';
        await storage.addressSets.put({
          id: setId,
          campaignId: activeCampaign.id,
          name: `${nameA} ${operation} ${nameB}`,
          type: 'derived-filter',
          addressCount: resultAddresses.length,
          createdAt: Date.now(),
        });
        await storage.addresses.putBatch(
          resultAddresses.map((addr) => ({
            setId,
            address: addr,
            amount: null,
          })),
        );

        const updatedSets = await storage.addressSets.getByCampaign(activeCampaign.id);
        setSets(updatedSets.map((s) => ({ id: s.id, name: s.name, addressCount: s.addressCount })));
      }

      setResult({ status: 'done', count: resultAddresses.length, errorMessage: null });
    } catch (err: unknown) {
      setResult({
        status: 'error',
        count: 0,
        errorMessage: err instanceof Error ? err.message : 'Operation failed',
      });
    }
  }, [storage, setA, setB, operation, activeCampaign, sets]);

  if (sets.length < 2) return null;

  const setOptions = [
    { value: '', label: 'Select...' },
    ...sets.map((s) => ({ value: s.id, label: `${s.name} (${s.addressCount})` })),
  ];

  return (
    <Card className="space-y-4">
      <h3 className="font-sans text-sm font-extrabold tracking-tight text-[color:var(--fg-primary)]">Set Operations</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select
          label="Set A"
          aria-label="Select address set A"
          value={setA ?? ''}
          onChange={(e) => setSetA(e.target.value || null)}
          options={setOptions}
        />
        <Select
          label="Set B"
          aria-label="Select address set B"
          value={setB ?? ''}
          onChange={(e) => setSetB(e.target.value || null)}
          options={setOptions}
        />
      </div>

      {/* Operation selector */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(OPERATION_LABELS) as Operation[]).map((op) => {
          const active = operation === op;
          return (
            <button
              key={op}
              type="button"
              onClick={() => setOperation(op)}
              aria-pressed={active}
              className={`${TOGGLE_BASE} ${active ? TOGGLE_ACTIVE : TOGGLE_INACTIVE}`}
            >
              {OPERATION_LABELS[op]}
            </button>
          );
        })}
      </div>

      {/* Execute */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="primary"
          onClick={handleCompute}
          disabled={!setA || !setB || result.status === 'computing'}
        >
          {result.status === 'computing' ? 'Computing...' : 'Apply'}
        </Button>
        {result.status === 'done' && (
          <span className="font-mono text-sm text-[color:var(--color-ok)]">
            {result.count.toLocaleString()} addresses in result
          </span>
        )}
        {result.status === 'error' && (
          <span className="font-mono text-sm text-[color:var(--color-err)]">{result.errorMessage}</span>
        )}
      </div>
    </Card>
  );
}
