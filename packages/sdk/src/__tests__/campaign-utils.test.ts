import { describe, it, expect } from 'vitest';
import { slugifyCampaignName } from '../utils/campaign.js';

describe('slugifyCampaignName', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugifyCampaignName('March HEX Airdrop')).toBe('march-hex-airdrop');
  });
  it('strips leading and trailing hyphens', () => {
    expect(slugifyCampaignName('--hello--')).toBe('hello');
  });
  it('collapses consecutive non-alphanumeric characters', () => {
    expect(slugifyCampaignName('hello!!!world')).toBe('hello-world');
  });
  it('truncates to 64 characters', () => {
    const long = 'a'.repeat(100);
    expect(slugifyCampaignName(long).length).toBe(64);
  });
  it('handles single word', () => {
    expect(slugifyCampaignName('test')).toBe('test');
  });
});
