/** How the AI behaves. Tune its aggression and caution here. */
export const AI = {
  /** Attack only when our expected strength beats the defender's by this factor. */
  attackMargin: 1.1,
  /** Send a field army out only when it's this much stronger than the target's defenders. */
  launchMargin: 1.25,
  /** Smallest field army worth sending, in regiments. */
  minLaunchRegiments: 4,

  /**
   * A city with fewer people than this trains no regiments unless it's
   * empty or threatened: soldiers come out of its people, and recruiting
   * drained small border towns to nothing.
   */
  minRecruitPopulation: 2000,
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
  plunderWhenBelow: 100,
  /** Gold wanted in hand before taxes come back down after a debt. */
  recoveredGold: 300,
  /** A city with this share of its capacity is full: it pays high taxes, since it can't grow anyway. */
  fullCity: 0.95,
  /** Gold kept back for emergencies before anything is built. */
  buildReserve: 100,
  /**
   * Regiments per city the AI wants before it stops training to save for a
   * government building it can't yet afford (see governmentToSave in ai/ai.ts).
   */
  regimentsBeforeGovernment: 3,
  /** Regiments per city the AI wants before it saves up for other buildings instead of more field regiments. */
  regimentsBeforeSaving: 5,
  /** It saves for a building only if its income would pay for it within this many turns. */
  savingTurns: 10,
  /**
   * While upkeep is under this share of income, a field regiment comes before
   * any building but a government one. Without it buildings took 70% of the
   * AI's gold, and armies stayed the same size as income quadrupled. It's low
   * on purpose: 0.2 and above starved the economy (see DECISIONS, Sieges).
   */
  armyUpkeepShare: 0.15,
  /**
   * ...and only with this much gold in hand. Below it, buildings and watchtowers
   * buy first as usual, so the army takes the surplus and not the economy's share.
   */
  armyFirstGold: 500,
  /**
   * Choosing a muster city, each level of unit building above the first is worth
   * this many tiles of distance: better troops are worth a longer march.
   */
  musterTilesPerTier: 4,
  /**
   * Watchtowers the AI builds in the region of each city that borders
   * another faction's land. Its own limit: the game has none.
   */
  watchtowersPerBorderCity: 1,
  /** Scouts the AI keeps: this many, plus one for every citiesPerExtraScout cities. */
  baseScouts: 1,
  citiesPerExtraScout: 5,
  /** How close to its target city a scout rides, in tiles: close enough to see the garrison. */
  scoutStandoff: 3,
} as const;
