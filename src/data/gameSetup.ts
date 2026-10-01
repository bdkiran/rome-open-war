import type { UnitType } from "@/data/units.js";

/** How a new game is laid out. */
export const GAME_SETUP = {
  /**
   * Every city claims the land within this many tiles when the game starts,
   * shared with a nearer city where they overlap. It never changes.
   */
  territoryRadius: 3,
  /**
   * Cities this close or closer are moved apart when the game is set up, so
   * their land doesn't overlap: 7 is two radius-3 territories side by side.
   */
  minCitySpacing: 7,
  /** The most tiles a city may be moved from its real location to keep that spacing. */
  maxCityShift: 4,
  capitalPopulation: 6000,
  cityPopulation: 3000,
} as const;

type StartingArmy = ReadonlyArray<{ unit: UnitType; regiments: number }>;

/**
 * The armies every faction starts with, free of charge and ready to move:
 * one in its capital, and a garrison in each of its other cities. Each entry
 * is a number of full regiments of one unit type.
 */
export const STARTING_ARMIES: { capital: StartingArmy; city: StartingArmy } = {
  capital: [
    { unit: "archers", regiments: 1 },
    { unit: "cavalry", regiments: 1 },
  ],
  city: [{ unit: "spearmen", regiments: 1 }],
};
