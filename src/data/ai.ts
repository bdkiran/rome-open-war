/** How the AI behaves. Tune its aggression and caution here. */
export const AI = {
  /** Attack only when our expected strength beats the defender's by this factor. */
  attackMargin: 1.2,
  /** Send a field army out only when it's this much stronger than the target's defenders. */
  launchMargin: 1.4,
  /** Smallest field army worth sending, in regiments. */
  minLaunchRegiments: 3,

  /** Regiments every city keeps at home, at minimum. */
  baseGarrison: 2,
  capitalGarrison: 3,
  /** Enemy armies within this many tiles of a city count as a threat to it. */
  threatRadius: 6,
  /** Garrison regiments to keep per enemy regiment nearby (the city bonus covers the rest). */
  garrisonPerThreat: 0.8,

  /** A field army falls back when an adjacent enemy is this much stronger than it. */
  retreatMargin: 1.1,

  /** Attack an army besieging one of our cities when our strength at least matches theirs by this factor. */
  reliefMargin: 1.0,
  /** A besieged garrison sallies out at these odds... */
  sallyMargin: 1.0,
  /** ...and, once its city is this many turns from surrendering, at these much worse ones: it's lost anyway. */
  desperateTurns: 2,
  desperateMargin: 0.6,
  /**
   * On its last turn of supplies, a garrison attacks at any odds: it will be
   * destroyed when the city surrenders anyway, so it goes down fighting.
   */
  lastStandTurns: 1,

  /** When picking a target city, each tile of distance counts like this many defending soldiers. */
  distanceWeight: 40,
  /** Keep at least this share of income free after upkeep; only emergencies ignore it. */
  upkeepHeadroom: 0.25,

  /** Below this much gold, a conquered city is exterminated for its plunder (otherwise enslaved or occupied). */
  plunderWhenBelow: 300,
  /** Gold wanted in hand before taxes come back down after a debt. */
  recoveredGold: 300,
  /** A city with this share of its capacity is full: it pays high taxes, since it can't grow anyway. */
  fullCity: 0.95,
  /** Hills and mountain tiles a city needs before a mine is worth building. */
  mineWorthTiles: 3,
  /** Gold kept back for emergencies before anything is built. */
  buildReserve: 100,
} as const;
