import { EXPERIENCE } from "@/data/experience.js";

/**
 * Unit types, each a set of battle stats (see systems/combat.ts for how a
 * battle is fought). The stats are chosen so that spearmen beat cavalry,
 * archers beat spearmen and cavalry beat archers, regiment for regiment, and
 * militia are large, cheap regiments of poor fighters.
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
  /** Losses dealt in each melee round, before the target's armor. */
  attack: number;
  /** Divides the melee losses the unit takes. Arrows ignore it. */
  armor: number;
  /** Losses dealt by volleys before the lines meet, over COMBAT.arrowDivisor. Arrows ignore armor. */
  ranged: number;
  /** Added to attack in the first melee round, when attacking on open ground. */
  charge: number;
  /** Added to attack against mounted troops. */
  antiCavalry: number;
  /** Horsemen: they close fast, so only the first volley hits them, at reduced effect. */
  mounted: boolean;
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
  // A basic regiment costs 99 / 162 / 216 / 216 gold and about 1.65 / 2.7 / 2.8 / 3 gold a turn in upkeep.
  militia: {
    name: "Militia", movement: 12, attack: 20, armor: 20, ranged: 0, charge: 0, antiCavalry: 0, mounted: false,
    goldPerSoldier: 0.45, upkeep: 0.0075, regimentSize: 220, building: null,
  },
  spearmen: {
    name: "Spearmen", movement: 12, attack: 30, armor: 30, ranged: 0, charge: 0, antiCavalry: 60, mounted: false,
    goldPerSoldier: 0.9, upkeep: 0.015, regimentSize: 180, building: "spearYard",
  },
  archers: {
    name: "Archers", movement: 12, attack: 10, armor: 10, ranged: 60, charge: 0, antiCavalry: 0, mounted: false,
    goldPerSoldier: 1.35, upkeep: 0.017578125, regimentSize: 160, building: "archeryRange",
  },
  cavalry: {
    name: "Cavalry", movement: 16, attack: 60, armor: 20, ranged: 0, charge: 20, antiCavalry: 0, mounted: true,
    goldPerSoldier: 1.8, upkeep: 1 / 40, regimentSize: 120, building: "stables",
  },
};

/** A regiment's quality: basic, advanced or elite. Militia are always basic. */
export type Tier = 1 | 2 | 3;

/**
 * Tiers of spearmen, archers and cavalry. Better soldiers have every stat
 * multiplied by `stats`, so they deal more losses and take fewer: a regiment
 * fights like `stats` times as many basic soldiers. They cost more gold and
 * upkeep, but take no more people: elites are slightly worse per gold, much
 * better per person. A tier needs its unit's building at that level.
 */
export const TIERS: Record<Tier, { name: string; stats: number; cost: number }> = {
  1: { name: "Basic", stats: 1, cost: 1 },
  2: { name: "Advanced", stats: 1.3, cost: 1.5 },
  3: { name: "Elite", stats: 1.6, cost: 2.1 },
};

/** A unit's battle stats at a tier. */
export interface UnitStats {
  attack: number;
  armor: number;
  ranged: number;
  charge: number;
  antiCavalry: number;
  mounted: boolean;
}

/**
 * A unit's battle stats: its own, times the tier's multiplier, plus the flat
 * attack and armor of its experience level.
 */
export function unitStats(unit: UnitType, tier: Tier, level = 0): UnitStats {
  const def = UNITS[unit];
  const k = TIERS[tier].stats;
  return {
    attack: def.attack * k + level * EXPERIENCE.attackPerLevel,
    armor: def.armor * k + level * EXPERIENCE.armorPerLevel,
    ranged: def.ranged * k,
    charge: def.charge * k,
    antiCavalry: def.antiCavalry * k,
    mounted: def.mounted,
  };
}

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

/** The trained line units, each with its own building: everything but militia. */
export const LINE_UNITS = UNIT_TYPES.filter((t) => UNITS[t].building !== null);

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
