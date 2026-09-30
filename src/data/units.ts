/**
 * Unit types. Spearmen, archers and cavalry form a rock-paper-scissors
 * triangle: each beats one type and loses to another. Militia sit outside
 * it: large, cheap regiments that beat nothing, and that every other type
 * beats.
 */
export type UnitType = "militia" | "spearmen" | "cavalry" | "archers";

export interface UnitDef {
  name: string;
  /**
   * Movement points per turn. A plains step costs 2, rough ground 3 and
   * mountains 4 (see data/terrain.ts), so 12 points is 6 tiles of open
   * ground, 4 of forest, hills or desert, or 3 of mountains.
   */
  movement: number;
  /** The unit types this one has the advantage over. */
  beats: readonly UnitType[];
  /** Gold to train one soldier. Each soldier also costs one person from the city. */
  goldPerSoldier: number;
  /** Gold per turn to keep one soldier of this type. */
  upkeep: number;
  /**
   * Soldiers in a newly trained regiment, and the most one can hold.
   * Training always happens in whole regiments.
   */
  regimentSize: number;
  /**
   * The building that trains it, whose level is the best tier the city can
   * train (see TIERS). Militia need none and come in one tier.
   */
  building: "spearYard" | "archeryRange" | "stables" | null;
}

export const UNITS: Record<UnitType, UnitDef> = {
  // A basic regiment costs 110 / 180 / 320 / 360 gold and about 2 / 4 / 5 / 6 gold a turn in upkeep.
  militia: { name: "Militia", movement: 12, beats: [], goldPerSoldier: 0.5, upkeep: 0.01, regimentSize: 220, building: null },
  spearmen: { name: "Spearmen", movement: 12, beats: ["cavalry", "militia"], goldPerSoldier: 1, upkeep: 0.02, regimentSize: 180, building: "spearYard" },
  archers: { name: "Archers", movement: 12, beats: ["spearmen", "militia"], goldPerSoldier: 2, upkeep: 0.03125, regimentSize: 160, building: "archeryRange" },
  cavalry: { name: "Cavalry", movement: 16, beats: ["archers", "militia"], goldPerSoldier: 3, upkeep: 0.05, regimentSize: 120, building: "stables" },
};

/** A regiment's quality: basic, advanced or elite. Militia are always basic. */
export type Tier = 1 | 2 | 3;

/**
 * Tiers of spearmen, archers and cavalry. Better soldiers fight harder (each
 * counts as `strength` basic ones in battle) and cost more gold and upkeep,
 * but take no more people: elites are slightly worse per gold, much better
 * per person. A tier needs its unit's building at that level.
 */
export const TIERS: Record<Tier, { name: string; strength: number; cost: number }> = {
  1: { name: "Basic", strength: 1, cost: 1 },
  2: { name: "Advanced", strength: 1.3, cost: 1.5 },
  3: { name: "Elite", strength: 1.6, cost: 2.1 },
};

/** "Spearmen", "Advanced spearmen" or "Elite spearmen". */
export function unitName(unit: UnitType, tier: Tier): string {
  return tier === 1 ? UNITS[unit].name : `${TIERS[tier].name} ${UNITS[unit].name.toLowerCase()}`;
}

/** Soldiers in a full regiment of a unit type. */
export function regimentSize(unit: UnitType): number {
  return UNITS[unit].regimentSize;
}

/** In order from cheapest to most expensive. */
export const UNIT_TYPES = Object.keys(UNITS) as UnitType[];

/** The cheapest unit type that beats this one. Every type but militia beats militia, so that's spearmen. */
export function counterTo(unit: UnitType): UnitType {
  return UNIT_TYPES.find((t) => UNITS[t].beats.includes(unit))!;
}

/** The types in the rock-paper-scissors triangle: everything but militia. */
export const LINE_UNITS = UNIT_TYPES.filter((t) => UNITS[t].beats.length > 0);

export const ARMY_RULES = {
  /** Most regiments that can stand together on one tile. */
  maxRegiments: 10,
  /** People each soldier takes from the city that trains them. */
  populationPerSoldier: 1,
  /** Training can't take a city's population below this. */
  minCityPopulation: 1000,
  /** Orders a city's recruitment queue can hold (training and retraining share it). */
  recruitQueueSize: 6,
} as const;
