/**
 * The shape of the map, independent of what's on it.
 *
 * Game logic, pathfinding and rendering only ever talk to this interface, so
 * the hex grid can be swapped for provinces (or squares) without touching
 * anything else. Terrain, owners etc. live in separate data keyed by TileId.
 */
export type TileId = string;

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface MapTopology {
  /** Every tile on the map, in a stable order. */
  allTiles(): readonly TileId[];
  has(id: TileId): boolean;
  /** Tiles directly reachable from this one. */
  neighbors(id: TileId): readonly TileId[];
  /** Estimated steps between two tiles; used as the pathfinding heuristic. */
  distance(a: TileId, b: TileId): number;
  /** World-space position for drawing cities, armies and labels. */
  tileCenter(id: TileId): Point;
  /** World-space polygon outlining the tile. */
  tileOutline(id: TileId): readonly Point[];
  /** The tile under a world-space point, if any. */
  tileAtPoint(p: Point): TileId | null;
  /** World-space rectangle containing the whole map. */
  bounds(): Bounds;
  /**
   * Extra connections between tiles that don't share an edge, such as sea
   * crossings. They're already included in neighbors(); this lists them so
   * the renderer can draw them. Optional: most maps have none.
   */
  links?(): readonly (readonly [TileId, TileId])[];
}
