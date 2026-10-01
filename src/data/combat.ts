/** Battle numbers. See systems/combat.ts for how a battle is fought. */
export const COMBAT = {
  /**
   * Soldiers each soldier kills per round, per point of attack over the
   * target's armor (or per point of ranged). Sets how many rounds a battle
   * lasts, not who wins.
   */
  killRate: 0.06,
  /** Rounds of volleys before the lines meet, when only ranged troops fight. */
  volleys: 2,
  /** Arrows count this much against mounted troops, and only in the first volley: horsemen close fast. */
  rangedVsMounted: 0.5,
  /** A side breaks, and is routed and destroyed, once it has lost this share of its soldiers. */
  breakPoint: 0.5,
  /** A battle ends after this many rounds at most; the side that lost the bigger share breaks. */
  maxRounds: 30,
  /** Losses dealt by each side in each round are multiplied by a random factor within ± this amount. */
  roundRandomness: 0.9,
  /**
   * How many rounds a battle usually lasts, for the quick strength estimate
   * (battleStrength): volleys and the charge count for their share of it.
   */
  typicalRounds: 8,
  /** Battles fought out, with the dice, to estimate the odds shown before an attack. */
  previewBattles: 200,
  /**
   * Extra defense for an army defending a city: 0.1 means +10%. Walls
   * (data/buildings.ts) and the terrain bonus are added on top. The defender
   * deals that much more and takes that much less, so +50% makes a garrison
   * fight like one 1.5 times its size.
   */
  cityDefenseBonus: 0.1,
} as const;
