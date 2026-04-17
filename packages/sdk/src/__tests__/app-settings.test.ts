import { describe, it, expect } from 'vitest';
import type { AppSettings } from '../index.js';

describe('AppSettings.providerKeys', () => {
  it('accepts an object with optional valve/alchemy/infura fields', () => {
    const settings: AppSettings = {
      providerKeys: { valve: 'vk_1' },
    };
    expect(settings.providerKeys.valve).toBe('vk_1');
  });

  it('accepts an empty providerKeys object', () => {
    const settings: AppSettings = { providerKeys: {} };
    expect(settings.providerKeys).toEqual({});
  });
});
