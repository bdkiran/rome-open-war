/**
 * City buildings. The government building is the city's level (1 to 3): other
 * buildings can be built up to that level, and advancing it needs people.
 */
export type BuildingType = "government" | "walls" | "farms" | "market" | "mine";

export interface BuildingLevel {
  name: string;
  /** Gold, paid when construction starts. */
  cost: number;
  /** Turns of work to finish. */
  turns: number;
}

export interface BuildingDef {
  name: string;
  /** What the building does, for the city panel. */
  purpose: string;
  /** Levels 1 to 3, in order. */
  levels: readonly BuildingLevel[];
}

export const MAX_CITY_LEVEL = 3;

/** Buildings a city's construction queue can hold. */
export const CONSTRUCTION_QUEUE_SIZE = 5;

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  government: {
    name: "Government",
    purpose: "Advances the city: raises how many people it can hold, and unlocks the next level of every building.",
    levels: [
      { name: "Council hall", cost: 0, turns: 0 },
      { name: "Forum", cost: 500, turns: 4 },
      { name: "Senate", cost: 1200, turns: 6 },
    ],
  },
  walls: {
    name: "Walls",
    purpose: "Strengthen the garrison when the city is attacked.",
    levels: [
      { name: "Palisade", cost: 200, turns: 2 },
      { name: "Stone walls", cost: 400, turns: 3 },
      { name: "Great walls", cost: 700, turns: 4 },
    ],
  },
  farms: {
    name: "Farms",
    purpose: "Feed a growing city: faster population growth.",
    levels: [
      { name: "Fields", cost: 150, turns: 2 },
      { name: "Farmsteads", cost: 300, turns: 3 },
      { name: "Estates", cost: 550, turns: 4 },
    ],
  },
  market: {
    name: "Market",
    purpose: "More gold from the city.",
    levels: [
      { name: "Market square", cost: 150, turns: 2 },
      { name: "Trade hall", cost: 300, turns: 3 },
      { name: "Great market", cost: 500, turns: 4 },
    ],
  },
  mine: {
    name: "Mine",
    purpose: "Gold from every hills and mountain tile in the city's land. Needs hills or mountains to dig.",
    levels: [
      { name: "Quarry", cost: 200, turns: 2 },
      { name: "Mine", cost: 400, turns: 3 },
      { name: "Deep mines", cost: 700, turns: 4 },
    ],
  },
};

/** The order buildings are shown in. */
export const BUILDING_ORDER: readonly BuildingType[] = ["government", "walls", "farms", "market", "mine"];

/**
 * The most people a city can hold at each level (index = level), whatever
 * its land supports: it can't grow past this until its government is raised.
 * At the top level only the land limits it. Each limit is above the
 * population the next level needs, so a city can always grow enough to
 * advance.
 */
export const LEVEL_POPULATION_LIMIT = [0, 8000, 20000, Infinity] as const;

/** People a city needs before its government can be raised to each level (index = level). */
export const LEVEL_POPULATION = [0, 0, 6000, 15000] as const;

/** What each building level adds (index = level; 0 = not built). */
export const BUILDING_EFFECTS = {
  /** Extra defense for the city's garrison, added to the city and terrain bonuses. */
  wallsDefense: [0, 0.15, 0.3, 0.5],
  /** Extra population growth. */
  farmsGrowth: [0, 0.2, 0.4, 0.6],
  /** Extra gold. */
  marketGold: [0, 0.3, 0.6, 1],
  /** Gold per hills or mountain tile in the city's territory, before taxes and the market. */
  mineGoldPerTile: [0, 2, 4, 6],
} as const;
