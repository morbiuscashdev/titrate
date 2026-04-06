import { useState, useCallback, useEffect } from 'react';
import { union, intersect, difference, symmetricDifference } from '@titrate/sdk';
import { useCampaign } from '../providers/CampaignProvider.js';
import { useStorage } from '../providers/StorageProvider.js';
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

  // Load available sets
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

      // Save as a new derived set
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

        // Refresh sets list
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

  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-900 p-4 ring-1 ring-gray-200 dark:ring-gray-800 space-y-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Set Operations</h3>

      <div className="grid grid-cols-2 gap-3">
        {/* Set A */}
        <div>
          <label className="block text-xs text-gray-400 dark:text-gray-500 mb-1">Set A</label>
          <select
            value={setA ?? ''}
            onChange={(e) => setSetA(e.target.value || null)}
            className="w-full rounded-lg bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white ring-1 ring-gray-300 dark:ring-gray-700 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">Select...</option>
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.addressCount})
              </option>
            ))}
          </select>
        </div>

        {/* Set B */}
        <div>
          <label className="block text-xs text-gray-400 dark:text-gray-500 mb-1">Set B</label>
          <select
            value={setB ?? ''}
            onChange={(e) => setSetB(e.target.value || null)}
            className="w-full rounded-lg bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white ring-1 ring-gray-300 dark:ring-gray-700 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">Select...</option>
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.addressCount})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Operation selector */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(OPERATION_LABELS) as Operation[]).map((op) => (
          <button
            key={op}
            type="button"
            onClick={() => setOperation(op)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ring-1 transition-colors ${
              operation === op
                ? 'bg-blue-500/10 text-blue-400 ring-blue-500/30'
                : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 ring-gray-200 dark:ring-gray-700'
            }`}
          >
            {OPERATION_LABELS[op]}
          </button>
        ))}
      </div>

      {/* Execute */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleCompute}
          disabled={!setA || !setB || result.status === 'computing'}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          {result.status === 'computing' ? 'Computing...' : 'Apply'}
        </button>
        {result.status === 'done' && (
          <span className="text-sm text-green-600 dark:text-green-400">
            {result.count.toLocaleString()} addresses in result
          </span>
        )}
        {result.status === 'error' && (
          <span className="text-sm text-red-400">{result.errorMessage}</span>
        )}
      </div>
    </div>
  );
}
