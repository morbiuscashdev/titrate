import type { PipelineConfig, PipelineStep } from '../../types.js';

export type PipelineChangeKind =
  | 'noop'
  | 'pure-suffix-addition'
  | 'replace'
  | 'invalid';

export type PipelineChange =
  | { readonly kind: 'noop' }
  | { readonly kind: 'pure-suffix-addition'; readonly addedSteps: readonly PipelineStep[] }
  | { readonly kind: 'replace' }
  | { readonly kind: 'invalid'; readonly reason: string };

function isValid(p: PipelineConfig): boolean {
  if (p.steps.length === 0) return false;
  return p.steps.some((s) => s.type === 'source');
}

function stepEquals(a: PipelineStep, b: PipelineStep): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'source' && b.type === 'source') {
    return a.sourceType === b.sourceType && JSON.stringify(a.params) === JSON.stringify(b.params);
  }
  if (a.type === 'filter' && b.type === 'filter') {
    return a.filterType === b.filterType && JSON.stringify(a.params) === JSON.stringify(b.params);
  }
  return false;
}

export function classifyPipelineChange(
  prev: PipelineConfig,
  next: PipelineConfig,
): PipelineChange {
  if (!isValid(next)) return { kind: 'invalid', reason: 'next pipeline has no source or is empty' };
  if (!isValid(prev)) return { kind: 'replace' };

  const prevSteps = prev.steps;
  const nextSteps = next.steps;

  if (prevSteps.length === nextSteps.length) {
    const allEqual = prevSteps.every((s, i) => stepEquals(s, nextSteps[i]));
    if (allEqual) return { kind: 'noop' };
  }

  if (nextSteps.length > prevSteps.length) {
    const prefixMatches = prevSteps.every((s, i) => stepEquals(s, nextSteps[i]));
    if (prefixMatches) {
      const added = nextSteps.slice(prevSteps.length);
      const allFilters = added.every((s) => s.type === 'filter');
      if (allFilters) {
        return { kind: 'pure-suffix-addition', addedSteps: added };
      }
    }
  }

  return { kind: 'replace' };
}
