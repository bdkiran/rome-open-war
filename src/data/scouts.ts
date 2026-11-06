/**
 * Scouts: lone riders who see far and go anywhere. A scout isn't a regiment or
 * an army: it never fights, blocks nothing and can't be killed, so its price
 * and upkeep are all that limit how many a faction keeps.
 */
export const SCOUT = {
  /** Gold, paid when it's queued. */
  cost: 100,
  /** Gold a turn, paid with the armies' upkeep. */
  upkeep: 4,
  /** Movement points a turn: more than cavalry (see data/units.ts). */
  movement: 20,
  /** The city level needed to train one. */
  cityLevel: 2,
} as const;
