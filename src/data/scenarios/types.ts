import type { MapEngine } from "@/map/mapEngine.js";

/** A starting city, placed at its real-world location. */
export interface ScenarioCity {
  name: string;
  lon: number;
  lat: number;
  capital?: boolean;
}

export interface ScenarioFaction {
  id: string;
  name: string;
  /** Used in battle reports and other tight spaces. */
  shortName: string;
  color: string;
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
}
