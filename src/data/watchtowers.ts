/**
 * Watchtowers: built at once on a tile of your own region to see around it.
 * They're never destroyed and cost nothing to keep, so the price is all that
 * limits how many a faction builds: more than a first-level building.
 */
export const WATCHTOWER = {
  /** Gold, paid when it's built. */
  cost: 300,
} as const;
