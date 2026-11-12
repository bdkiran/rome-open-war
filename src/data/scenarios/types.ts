import type { Culture } from "@/data/cultures.js";
import type { MapEngine } from "@/map/mapEngine.js";

/** A starting city, placed at its real-world location. */
export interface ScenarioCity {
  name: string;
  lon: number;
  lat: number;
  capital?: boolean;
  /**
   * Stays at its real site instead of being moved away from cities placed
   * before it (see placeCities in core/setup.ts). For a city whose only
   * close neighbour is across the sea, so their land can't overlap anyway.
   */
  keepSite?: boolean;
}

export interface ScenarioFaction {
  id: string;
  name: string;
  /** Used in battle reports and other tight spaces. */
  shortName: string;
  color: string;
  /** How its soldiers look on the map. */
  culture: Culture;
  controller: "human" | "ai";
  /** Where this faction's cities start. They're the only cities it will ever found. */
  cities: readonly ScenarioCity[];
}

/** Everything that defines a game before it starts: the map, the factions, and where they begin. */
export interface Scenario {
  name: string;
  mapEngine: MapEngine;
  /** Seeds the game's random numbers. */
  seed: number;
  /** In turn order. */
  factions: readonly ScenarioFaction[];
  /** Cities (by name) whose holder can win the game (see VICTORY in data/gameSetup.ts). None: no key-city victory. */
  keyCities?: readonly string[];
}
