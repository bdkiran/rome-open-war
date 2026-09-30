/**
 * Unit types. They form a rock-paper-scissors triangle: each beats one type
 * and loses to another.
 */
export type UnitType = "spearmen" | "cavalry" | "archers";

export interface UnitDef {
  name: string;
  /**
   * Movement points per turn. A plains step costs 2, rough ground 3 and
   * mountains 4 (see data/terrain.ts), so 12 points is 6 tiles of open
   * ground, 4 of forest, hills or desert, or 3 of mountains.
   */
  movement: number;
  /** The unit type this one has the advantage over. */
  beats: UnitType;
  /** Gold to train one soldier. Each soldier also costs one person from the city. */
  goldPerSoldier: number;
  /** Gold per turn to keep one soldier of this type. */
  upkeep: number;
  /**
   * Soldiers in a newly trained regiment, and the most one can hold.
   * Training always happens in whole regiments.
   */
  regimentSize: number;
}

export const UNITS: Record<UnitType, UnitDef> = {
  // A regiment costs 200 / 320 / 360 gold and 4 / 5 / 6 gold a turn in upkeep.
  spearmen: { name: "Spearmen", movement: 12, beats: "cavalry", goldPerSoldier: 1, upkeep: 0.02, regimentSize: 200 },
  archers: { name: "Archers", movement: 12, beats: "spearmen", goldPerSoldier: 2, upkeep: 0.03125, regimentSize: 160 },
  cavalry: { name: "Cavalry", movement: 16, beats: "archers", goldPerSoldier: 3, upkeep: 0.05, regimentSize: 120 },
};

/** Soldiers in a full regiment of a unit type. */
export function regimentSize(unit: UnitType): number {
  return UNITS[unit].regimentSize;
}

/** In order from cheapest to most expensive. */
export const UNIT_TYPES = Object.keys(UNITS) as UnitType[];

/** The unit type that beats this one. */
export function counterTo(unit: UnitType): UnitType {
  return UNIT_TYPES.find((t) => UNITS[t].beats === unit)!;
}

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
