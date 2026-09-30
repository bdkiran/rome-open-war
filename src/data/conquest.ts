/**
 * What happens to a city its conqueror takes. The conqueror chooses: occupy
 * it as it is, enslave part of its people, or put half of them to the sword.
 * The plunder is worked out from the city's population and level when it's
 * taken, so a city sacked once yields far less the next time.
 */
export type SettlementChoice = "occupy" | "enslave" | "exterminate";

export interface SettlementDef {
  name: string;
  /** What it does, for the choice screen. */
  description: string;
  /** Gold per 1,000 people in the city. */
  goldPer1000: number;
  /** Share of the population moved to the conqueror's other cities. */
  moved: number;
  /** Share of the population lost. */
  lost: number;
}

export const SETTLEMENT: Record<SettlementChoice, SettlementDef> = {
  occupy: {
    name: "Occupy",
    description: "March in and take the city as it is. Its people stay, and it pays a small tribute.",
    goldPer1000: 5,
    moved: 0,
    lost: 0,
  },
  enslave: {
    name: "Enslave",
    description: "Carry off a quarter of its people to your other cities, and seize their goods. Some don't survive the march.",
    goldPer1000: 15,
    moved: 0.25,
    lost: 0.1,
  },
  exterminate: {
    name: "Exterminate",
    description: "Put half the city to the sword and strip it of everything of value.",
    goldPer1000: 40,
    moved: 0,
    lost: 0.5,
  },
};

export const SETTLEMENT_ORDER: readonly SettlementChoice[] = ["occupy", "enslave", "exterminate"];

/** Plunder grows with the city's level: this much more per level above 1. */
export const LOOT_PER_LEVEL = 0.5;
