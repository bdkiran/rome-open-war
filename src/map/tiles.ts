import type { TerrainType } from "@/data/terrain.js";
import type { TileId } from "@/map/topology.js";

/** Per-tile game data that comes with the map. */
export interface TileData {
  terrain: TerrainType;
}

/** A plain object rather than a Map so it serializes straight to JSON for saves. */
export type TileDataMap = Record<TileId, TileData>;
