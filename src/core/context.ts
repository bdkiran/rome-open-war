import type { MapTopology } from "@/map/topology.js";

/**
 * Fixed information the game rules need alongside GameState. Unlike
 * GameState it is never saved: it's rebuilt from the map engine on load.
 */
export interface GameContext {
  readonly topology: MapTopology;
}
