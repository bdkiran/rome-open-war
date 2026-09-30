/** Economy numbers. Tune the game's pace here. */
export const ECONOMY = {
  /** Gold each faction starts with. */
  startingGold: 500,
  /** Flat gold every city adds to its owner's treasury each turn. */
  cityBaseGold: 5,
  /** Extra gold per turn for every full 1,000 people in a city. */
  goldPer1000People: 4,
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
