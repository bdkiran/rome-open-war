import type { UnitType } from "@/data/units.js";

/** How a new game is laid out. */
export const GAME_SETUP = {
  /** Every city claims the land within this many tiles when the game starts. It never changes. */
  territoryRadius: 2,
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
