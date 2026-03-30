/**
 * Converts a campaign name to a deterministic URL-safe slug.
 * Lowercases, replaces non-alphanumeric runs with hyphens, trims edges, max 64 chars.
 */
export function slugifyCampaignName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
