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
    { unit: "militia", regiments: 2 },
    { unit: "archers", regiments: 1 },
    { unit: "cavalry", regiments: 1 },
  ],
  city: [
    { unit: "militia", regiments: 1 },
    { unit: "spearmen", regiments: 1 },
  ],
};

/** How a game can be won: chosen on the start screen and kept in the game state. */
export type VictoryPreset = "conquest" | "keyCities";

/**
 * The ways to win besides being the last faction standing, which always wins.
 * Key cities are listed by the scenario (`Scenario.keyCities`).
 */
export const VICTORY = {
  /** The start screen's choice if the player makes none (and the simulations' too). */
  defaultPreset: "keyCities" as VictoryPreset,
  /** Key cities a faction must hold to win. More than half, so only one faction can at a time. */
  keyCitiesNeeded: 4,
  /** ...at the end of this many of its turns in a row. Losing one starts the count again. */
  holdTurns: 5,
} as const;

/** What each preset is called on the start screen, and what it means. */
export const VICTORY_PRESETS: Record<VictoryPreset, { name: string; summary: string }> = {
  conquest: { name: "Conquest", summary: "Be the last faction standing." },
  keyCities: {
    name: "Key cities",
    summary: `Hold ${VICTORY.keyCitiesNeeded} of the key cities for ${VICTORY.holdTurns} turns, or be the last standing. Any faction can win this way.`,
  },
};
