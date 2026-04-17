import { describe, it, expect } from 'vitest';
import { classifyPipelineChange } from '../../pipeline/loops/pipeline-watcher.js';
import type { PipelineConfig, PipelineStep } from '../../types.js';

const source: PipelineStep = { type: 'source', sourceType: 'csv', params: { addresses: [] } };
const filterA: PipelineStep = { type: 'filter', filterType: 'min-balance', params: { threshold: '1' } };
const filterB: PipelineStep = { type: 'filter', filterType: 'contract-check', params: { isContract: false } };

describe('classifyPipelineChange', () => {
  it('detects identical configs as noop', () => {
    const p: PipelineConfig = { steps: [source, filterA] };
    expect(classifyPipelineChange(p, p).kind).toBe('noop');
  });

  it('detects pure-suffix-addition when the old chain is a prefix of the new', () => {
    const prev: PipelineConfig = { steps: [source, filterA] };
    const next: PipelineConfig = { steps: [source, filterA, filterB] };
    const result = classifyPipelineChange(prev, next);
    expect(result.kind).toBe('pure-suffix-addition');
    if (result.kind === 'pure-suffix-addition') {
      expect(result.addedSteps).toEqual([filterB]);
    }
  });

  it('classifies a removed filter as replace', () => {
    const prev: PipelineConfig = { steps: [source, filterA, filterB] };
    const next: PipelineConfig = { steps: [source, filterA] };
    expect(classifyPipelineChange(prev, next).kind).toBe('replace');
  });

  it('classifies a reordered chain as replace', () => {
    const prev: PipelineConfig = { steps: [source, filterA, filterB] };
    const next: PipelineConfig = { steps: [source, filterB, filterA] };
    expect(classifyPipelineChange(prev, next).kind).toBe('replace');
  });

  it('classifies an in-place modification of an existing filter as replace', () => {
    const prev: PipelineConfig = { steps: [source, filterA] };
    const modified: PipelineStep = { type: 'filter', filterType: 'min-balance', params: { threshold: '2' } };
    const next: PipelineConfig = { steps: [source, modified] };
    expect(classifyPipelineChange(prev, next).kind).toBe('replace');
  });

  it('classifies empty/source-less pipeline as invalid', () => {
    const prev: PipelineConfig = { steps: [source, filterA] };
    const next: PipelineConfig = { steps: [] };
    expect(classifyPipelineChange(prev, next).kind).toBe('invalid');

    const nextNoSource: PipelineConfig = { steps: [filterA] };
    expect(classifyPipelineChange(prev, nextNoSource).kind).toBe('invalid');
  });

  it('an added source counts as replace (not pure-suffix-addition)', () => {
    const prev: PipelineConfig = { steps: [source] };
    const newSource: PipelineStep = { type: 'source', sourceType: 'csv', params: { addresses: ['0x1'] } };
    const next: PipelineConfig = { steps: [source, newSource, filterA] };
    expect(classifyPipelineChange(prev, next).kind).toBe('replace');
  });
});
