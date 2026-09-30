import type { TileDataMap } from "@/map/tiles.js";
import type { MapTopology, TileId } from "@/map/topology.js";

/**
 * A complete map: its shape (topology) and what's on each tile.
 */
export interface GameMap {
  topology: MapTopology;
  tiles: TileDataMap;
  /**
   * For maps of real places: the tile at a longitude and latitude, or null
   * if it's off the map. Scenarios use it to place historical cities.
   */
  locate?(lon: number, lat: number): TileId | null;
}

/**
 * The single swap point for the map system.
 *
 * An engine decides everything about the map: its shape, how it's built, and
 * how terrain is laid out. To use a different or more complex map system
 * (provinces, a finer hex grid, ...), write another MapEngine and use it in
 * the scenario. The rest of the game only sees the GameMap it returns.
 */
export interface MapEngine {
  name: string;
  createMap(): GameMap;
}
