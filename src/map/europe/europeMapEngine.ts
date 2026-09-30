import type { TerrainType } from "@/data/terrain.js";
import { EUROPE_GRID } from "@/map/europe/europeTerrain.js";
import type { TileDataMap } from "@/map/tiles.js";
import { HexTopology } from "@/map/hexTopology.js";
import type { GameMap, MapEngine } from "@/map/mapEngine.js";
import type { TileId } from "@/map/topology.js";

const HEX_SIZE = 32;

const TERRAIN_BY_CHAR: Record<string, TerrainType> = {
  "~": "water",
  ".": "plains",
  f: "forest",
  n: "hills",
  "^": "mountains",
  d: "desert",
};

/**
 * Short sea routes armies can cross, as [longitude, latitude] of each shore.
 * Each end snaps to the nearest land tile. (At this map's scale the Strait of
 * Messina and the Hellespont are narrow enough to be joined by land already.)
 */
export const SEA_CROSSINGS: readonly { name: string; from: [number, number]; to: [number, number] }[] = [
  { name: "Pillars of Hercules", from: [-5.7, 36.6], to: [-5.6, 35.4] },
  // Lands beside Lilybaeum and Carthago, not on them: a crossing between two
  // city tiles would let an army in one besiege the other across the sea.
  { name: "Sicily to Africa", from: [12.8, 38.08], to: [9.84, 36.85] },
  { name: "Fretum Siculum", from: [15.45, 38.2], to: [15.9, 38.3] },
  { name: "Fretum Gallicum", from: [1.6, 50.95], to: [1.35, 51.15] },
  { name: "Corsica to Sardinia", from: [9.2, 41.4], to: [9.25, 41.2] },
  { name: "Corsica to Italy", from: [9.45, 42.8], to: [10.5, 42.95] },
];

/**
 * The Roman world, from Iberia to Syria and from Egypt to the North Sea, on a
 * hex grid. Terrain is precomputed by tools/build_europe_map.py.
 */
export const europeMapEngine: MapEngine = {
  name: "The Roman world",
  createMap(): GameMap {
    const { width, height, rows } = EUROPE_GRID;
    const topology = new HexTopology(width, height, HEX_SIZE);

    const tiles: TileDataMap = {};
    for (let r = 0; r < height; r++) {
      const offset = Math.floor(r / 2);
      for (let col = 0; col < width; col++) {
        tiles[`${col - offset},${r}`] = { terrain: TERRAIN_BY_CHAR[rows[r][col]] ?? "water" };
      }
    }

    // Longitude and latitude map linearly onto the span of hex centers,
    // exactly as in the generator script.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const id of topology.allTiles()) {
      const c = topology.tileCenter(id);
      minX = Math.min(minX, c.x);
      maxX = Math.max(maxX, c.x);
      minY = Math.min(minY, c.y);
      maxY = Math.max(maxY, c.y);
    }
    const { lonMin, lonMax, latMin, latMax } = EUROPE_GRID;
    const locate = (lon: number, lat: number): TileId | null =>
      topology.tileAtPoint({
        x: minX + ((lon - lonMin) / (lonMax - lonMin)) * (maxX - minX),
        y: minY + ((latMax - lat) / (latMax - latMin)) * (maxY - minY),
      });

    const nearestLand = (tile: TileId | null): TileId | null => {
      if (!tile) return null;
      const seen = new Set([tile]);
      const queue = [tile];
      while (queue.length > 0) {
        const t = queue.shift()!;
        if (tiles[t].terrain !== "water") return t;
        for (const n of topology.neighbors(t)) {
          if (!seen.has(n)) {
            seen.add(n);
            queue.push(n);
          }
        }
      }
      return null;
    };

    for (const crossing of SEA_CROSSINGS) {
      const a = nearestLand(locate(...crossing.from));
      const b = nearestLand(locate(...crossing.to));
      if (a && b) topology.connect(a, b);
    }

    return { topology, tiles, locate };
  },
};
