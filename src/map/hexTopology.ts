import type { Bounds, MapTopology, Point, TileId } from "@/map/topology.js";

/**
 * Pointy-top hex grid using axial coordinates (q, r), laid out as a rectangle.
 * Reference: https://www.redblobgames.com/grids/hexagons/
 */

const SQRT3 = Math.sqrt(3);

const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
];

export function hexId(q: number, r: number): TileId {
  return `${q},${r}`;
}

export function parseHexId(id: TileId): { q: number; r: number } {
  const [q, r] = id.split(",").map(Number);
  return { q, r };
}

/** Round fractional axial coordinates to the nearest hex. */
function roundHex(qf: number, rf: number): { q: number; r: number } {
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}

export class HexTopology implements MapTopology {
  private readonly ids: TileId[] = [];
  private readonly neighborCache = new Map<TileId, TileId[]>();
  private readonly centerCache = new Map<TileId, Point>();
  private readonly outlineCache = new Map<TileId, Point[]>();
  private readonly mapBounds: Bounds;
  private readonly extraLinks: [TileId, TileId][] = [];

  /**
   * @param width  hexes per row
   * @param height number of rows
   * @param size   hex radius (center to corner) in world units
   */
  constructor(readonly width: number, readonly height: number, readonly size: number) {
    for (let r = 0; r < height; r++) {
      // Shift q every other row so the map forms a rectangle, not a rhombus.
      const offset = Math.floor(r / 2);
      for (let col = 0; col < width; col++) {
        const id = hexId(col - offset, r);
        this.ids.push(id);
        this.centerCache.set(id, this.computeCenter(id));
      }
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of this.ids) {
      const outline = this.computeOutline(id);
      this.outlineCache.set(id, outline);
      for (const p of outline) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      const { q, r } = parseHexId(id);
      this.neighborCache.set(
        id,
        DIRECTIONS.map(([dq, dr]) => hexId(q + dq, r + dr)).filter((n) => this.centerCache.has(n)),
      );
    }
    this.mapBounds = { minX, minY, maxX, maxY };
  }

  allTiles(): readonly TileId[] {
    return this.ids;
  }

  has(id: TileId): boolean {
    return this.centerCache.has(id);
  }

  neighbors(id: TileId): readonly TileId[] {
    return this.neighborCache.get(id) ?? [];
  }

  distance(a: TileId, b: TileId): number {
    const A = parseHexId(a);
    const B = parseHexId(b);
    const dq = A.q - B.q;
    const dr = A.r - B.r;
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
  }

  tileCenter(id: TileId): Point {
    const c = this.centerCache.get(id);
    if (!c) throw new Error(`Unknown tile ${id}`);
    return c;
  }

  tileOutline(id: TileId): readonly Point[] {
    const o = this.outlineCache.get(id);
    if (!o) throw new Error(`Unknown tile ${id}`);
    return o;
  }

  tileAtPoint(p: Point): TileId | null {
    const qf = ((SQRT3 / 3) * p.x - p.y / 3) / this.size;
    const rf = ((2 / 3) * p.y) / this.size;
    const { q, r } = roundHex(qf, rf);
    const id = hexId(q, r);
    return this.has(id) ? id : null;
  }

  bounds(): Bounds {
    return this.mapBounds;
  }

  links(): readonly (readonly [TileId, TileId])[] {
    return this.extraLinks;
  }

  /**
   * Connects two tiles that aren't next to each other, such as the two ends
   * of a sea crossing. Call while building the map, before the game starts.
   */
  connect(a: TileId, b: TileId): void {
    if (a === b || !this.has(a) || !this.has(b)) return;
    if (this.neighborCache.get(a)!.includes(b)) return;
    this.neighborCache.get(a)!.push(b);
    this.neighborCache.get(b)!.push(a);
    this.extraLinks.push([a, b]);
  }

  private computeCenter(id: TileId): Point {
    const { q, r } = parseHexId(id);
    return { x: this.size * SQRT3 * (q + r / 2), y: this.size * 1.5 * r };
  }

  private computeOutline(id: TileId): Point[] {
    const c = this.centerCache.get(id)!;
    const points: Point[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      points.push({ x: c.x + this.size * Math.cos(angle), y: c.y + this.size * Math.sin(angle) });
    }
    return points;
  }
}
