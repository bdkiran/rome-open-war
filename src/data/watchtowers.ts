/**
 * Watchtowers: built at once on a tile of your own region to see around it.
 * They're never destroyed and cost nothing to keep, so the price is all that
 * limits how many a faction builds. Priced against scouts (data/scouts.ts): a
 * tower sees less and can't move, so over a long game it must be the cheaper sight.
 */
export const WATCHTOWER = {
  /** Gold, paid when it's built. */
  cost: 150,
} as const;
