/** Economy numbers. Tune the game's pace here. */
export const ECONOMY = {
  /** Gold each faction starts with. */
  startingGold: 500,
  /** Flat gold every city adds to its owner's treasury each turn. */
  cityBaseGold: 5,
  /** Extra gold per turn per 1,000 people in a city, paid for every person: 2,500 people pay 10. */
  goldPer1000People: 4,
  /**
   * A city grows at least as fast as if it had this many people, so one
   * sacked or drained down to a few hundred recovers instead of crawling
   * (growth is otherwise a share of the people already there).
   */
  growthFloorPopulation: 1000,
  /**
   * How late growth slows as a city nears its limit: it grows at its rate ×
   * (1 − (people / limit) ^ growthCurve). 1 slows evenly all the way up;
   * higher keeps more of the rate until close to the limit (at 1.25, a city
   * 3/4 full grows at 30% of its rate instead of 25%), so cities reach their
   * next level sooner. 2 was tried: it made exterminating the best long-run
   * choice for 1 city in 5 (tests/balance.test.ts allows 1 in 10). 1.5 was
   * measured too; the player chose 1.25, the gentlest on the late game.
   */
  growthCurve: 1.25,
  /**
   * Every city's growth rate from its land is multiplied by this, before taxes,
   * farms and ports. Raised from 1 to speed up the whole game's growth.
   */
  growthMultiplier: 1.1,
} as const;

export type TaxRate = "low" | "normal" | "high";

/**
 * Each city's tax rate trades gold for growth. `gold` scales everything the
 * city pays into the treasury; `growth` scales its population growth rate
 * (so high taxes slow a city down, but never make it shrink).
 */
export const TAX_RATES: Record<TaxRate, { name: string; gold: number; growth: number }> = {
  low: { name: "Low", gold: 0.6, growth: 1.5 },
  normal: { name: "Normal", gold: 1, growth: 1 },
  high: { name: "High", gold: 1.5, growth: 0.5 },
};

/** Tax rates from lowest to highest, for the toggle. */
export const TAX_ORDER: readonly TaxRate[] = ["low", "normal", "high"];
