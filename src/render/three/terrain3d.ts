import * as THREE from "three";
import type { TerrainType } from "@/data/terrain.js";
import type { TileDataMap } from "@/map/tiles.js";
import type { MapTopology, Point, TileId } from "@/map/topology.js";
import { TERRAIN_COLORS } from "@/render/colors.js";
import { buildGroundDetails, buildMountains, buildTrees, tintGroundDetails, type Clearing, type Fogged, type GroundDetails, type TileWash } from "@/render/three/scenery.js";

/** How high each kind of ground stands, in world units (a hex is 64 across). */
export const TERRAIN_HEIGHT: Record<TerrainType, number> = {
  water: -5,
  plains: 0,
  desert: 0.6,
  forest: 1.2,
  hills: 5,
  mountains: 11,
};

/** How far in from a land tile's edge its bevelled rim starts, and how far the rim drops toward a lower neighbour. */
const BEVEL_WIDTH = 2.2;
const BEVEL_DROP = 0.8;
/** The sand along a shore, beyond the rim. */
const BEACH_WIDTH = 4.5;
const BEACH = new THREE.Color("#d9c79a");
/** Sea next to land. */
const SHALLOWS = "#4f8aa0";

/** A point moved `distance` toward `target`. */
function toward(p: Point, target: Point, distance: number): Point {
  const d = Math.hypot(target.x - p.x, target.y - p.y) || 1;
  return { x: p.x + ((target.x - p.x) * distance) / d, y: p.y + ((target.y - p.y) * distance) / d };
}

/** One side of a tile, and the tile across it (null at the map edge). */
export interface Edge {
  a: Point;
  b: Point;
  neighbor: TileId | null;
}

/**
 * The map as 3D terrain: a raised hex per tile with walls down to lower
 * neighbours, trees on forests and massifs on mountains (scenery.ts), and a transparent
 * layer over the hex tops that carries territory, fog and highlights.
 */
export class Terrain3D {
  readonly group = new THREE.Group();
  /** The ground, for picking. */
  readonly mesh: THREE.Mesh;
  /** Tile index of each triangle in `mesh`. */
  private readonly triangleTile: Int32Array;
  readonly ids: readonly TileId[];
  private readonly index = new Map<TileId, number>();
  private readonly heights: Float32Array;
  private readonly edges = new Map<TileId, Edge[]>();
  /** Trees and peaks, rebuilt when the cities and towers they make room for change. */
  private readonly scenery = new THREE.Group();
  private clearingsKey: string | null = null;
  /** Hills, fields and dunes, tinted with the overlay; and the overlay's last colours, to tint them again after a rebuild. */
  private details: GroundDetails | null = null;
  private overlayColorOf: ((tile: TileId) => readonly [number, number, number, number] | null) | null = null;
  /** Trees and peaks, which take the fog (not the territory colours); and the fog's last colours. */
  private fogged: Fogged<THREE.Object3D>[] = [];
  private fogOf: TileWash | null = null;

  /** The layer over the hex tops, recoloured per tile. */
  private readonly overlay: THREE.Mesh;
  private readonly overlayColors: THREE.BufferAttribute;

  constructor(private readonly topology: MapTopology, private readonly tiles: TileDataMap) {
    this.ids = topology.allTiles();
    this.ids.forEach((id, i) => this.index.set(id, i));
    this.heights = new Float32Array(this.ids.length);
    this.ids.forEach((id, i) => (this.heights[i] = TERRAIN_HEIGHT[tiles[id].terrain]));
    for (const id of this.ids) this.edges.set(id, this.computeEdges(id));

    const built = this.buildGround();
    this.mesh = built.mesh;
    this.triangleTile = built.triangleTile;
    this.group.add(this.mesh);

    const overlay = this.buildOverlay();
    this.overlay = overlay.mesh;
    this.overlayColors = overlay.colors;
    this.group.add(this.overlay);

    this.group.add(this.scenery);
    this.setClearings(new Set());
  }

  /**
   * Rebuilds the trees and peaks to leave room for cities (a tile with a city
   * gets no trees and no massif) and for things standing to one side of a
   * tile, like watchtowers. Does nothing if neither has changed.
   */
  setClearings(settlements: ReadonlySet<TileId>, spots: readonly Clearing[] = []): void {
    const key = [...settlements].sort().join("|") + "#" + spots.map((s) => `${s.x.toFixed(1)},${s.z.toFixed(1)},${s.radius}`).sort().join("|");
    if (key === this.clearingsKey) return;
    this.clearingsKey = key;
    for (const child of [...this.scenery.children]) {
      this.scenery.remove(child);
      child.traverse((node) => (node as THREE.Mesh).geometry?.dispose());
    }
    const heightOf = (tile: TileId) => this.heightOf(tile);
    const clear = { settlements, spots };
    this.details = buildGroundDetails(this.topology, this.tiles, heightOf, clear);
    if (this.overlayColorOf) tintGroundDetails(this.details, this.overlayColorOf);
    this.fogged = [buildTrees(this.topology, this.tiles, heightOf, clear), buildMountains(this.topology, this.tiles, heightOf, clear)];
    if (this.fogOf) for (const f of this.fogged) f.fog(this.fogOf);
    this.scenery.add(...this.fogged.map((f) => f.object), this.details.mesh);
  }

  /** Height of a tile's top. */
  heightOf(tile: TileId): number {
    return this.heights[this.index.get(tile) ?? 0];
  }

  /** A point on top of a tile, in three.js coordinates. */
  top(tile: TileId, lift = 0): THREE.Vector3 {
    const c = this.topology.tileCenter(tile);
    return new THREE.Vector3(c.x, this.heightOf(tile) + lift, c.y);
  }

  edgesOf(tile: TileId): readonly Edge[] {
    return this.edges.get(tile) ?? [];
  }

  /** The tile a ray hits first, if any. */
  pick(raycaster: THREE.Raycaster): TileId | null {
    const hit = raycaster.intersectObject(this.mesh, false)[0];
    if (!hit || hit.faceIndex === undefined || hit.faceIndex === null) return null;
    return this.ids[this.triangleTile[hit.faceIndex]] ?? null;
  }

  /**
   * Colours the layer over the hex tops: `colorOf` returns [r, g, b, a] for a
   * tile (0 to 1), or null to leave it clear.
   */
  /**
   * Darkens the trees and peaks on each tile by `fogOf`: the fog of war's
   * colour over a tile, or null where it's in sight. (The ground and its
   * hills, fields and dunes take the fog through paintOverlay.)
   */
  paintFog(fogOf: TileWash): void {
    this.fogOf = fogOf;
    for (const f of this.fogged) f.fog(fogOf);
  }

  paintOverlay(colorOf: (tile: TileId) => readonly [number, number, number, number] | null): void {
    this.overlayColorOf = colorOf;
    if (this.details) tintGroundDetails(this.details, colorOf);
    const arr = this.overlayColors.array as Float32Array;
    this.ids.forEach((id, i) => {
      const c = colorOf(id) ?? [0, 0, 0, 0];
      const base = i * 18 * 4;
      for (let v = 0; v < 18; v++) arr.set(c, base + v * 4);
    });
    this.overlayColors.needsUpdate = true;
  }

  // ---- Building ------------------------------------------------------------

  /**
   * The ground: a hex top per tile, its edges bevelled where it stands above a
   * neighbour, and walls down to lower neighbours. Land along the sea gets a
   * sand beach, and sea next to land is a lighter, shallow blue.
   */
  private buildGround(): { mesh: THREE.Mesh; triangleTile: Int32Array } {
    const positions: number[] = [];
    const colors: number[] = [];
    const triangleTile: number[] = [];
    let tile = 0;

    /** A triangle of the ground, in the given colour, for tile `tile`. */
    const tri = (p: readonly number[], q: readonly number[], r: readonly number[], color: THREE.Color, up = true) => {
      // Upward faces are wound to face up; walls are given in order already.
      if (up) {
        const ny = (q[2] - p[2]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[2] - p[2]);
        if (ny < 0) [q, r] = [r, q];
      }
      positions.push(...p, ...q, ...r);
      for (let v = 0; v < 3; v++) colors.push(color.r, color.g, color.b);
      triangleTile.push(tile);
    };

    this.ids.forEach((id, i) => {
      tile = i;
      const terrain = this.tiles[id].terrain;
      const h = this.heights[i];
      const c = this.topology.tileCenter(id);
      const edges = this.edges.get(id)!;
      const isSea = (n: TileId | null) => n !== null && this.tiles[n].terrain === "water";
      const shallows = terrain === "water" && edges.some((e) => e.neighbor && !isSea(e.neighbor));

      // A slight random tint per land tile keeps large areas from looking flat;
      // the sea is one even colour (lighter in the shallows) so it reads as one surface.
      const top = new THREE.Color(shallows ? SHALLOWS : TERRAIN_COLORS[terrain]);
      if (terrain !== "water") top.offsetHSL(0, 0, (hash(id) - 0.5) * 0.05);
      const side = top.clone().multiplyScalar(0.72);
      const sandSide = BEACH.clone().multiplyScalar(0.72);

      // The sea is flat; land has an inner top and a bevelled rim.
      const inset = terrain === "water" ? 0 : BEVEL_WIDTH;
      for (const { a, b, neighbor } of edges) {
        const low = neighbor ? this.heights[this.index.get(neighbor)!] : TERRAIN_HEIGHT.water - 4;
        const ia = toward(a, c, inset);
        const ib = toward(b, c, inset);
        const beach = terrain !== "water" && isSea(neighbor);
        tri([c.x, h, c.y], [ia.x, h, ia.y], [ib.x, h, ib.y], top);
        if (inset === 0) {
          if (low < h) wall(a, b, h, low, side);
          continue;
        }
        // The rim drops a little where the ground falls away, softening the edge.
        const drop = low < h ? BEVEL_DROP : 0;
        const rim = beach ? BEACH : top;
        tri([ia.x, h, ia.y], [b.x, h - drop, b.y], [a.x, h - drop, a.y], rim);
        tri([ia.x, h, ia.y], [ib.x, h, ib.y], [b.x, h - drop, b.y], rim);
        if (beach) {
          // A band of sand along the shore.
          const ba = toward(ia, c, BEACH_WIDTH);
          const bb = toward(ib, c, BEACH_WIDTH);
          tri([ia.x, h + 0.05, ia.y], [ib.x, h + 0.05, ib.y], [bb.x, h + 0.05, bb.y], BEACH);
          tri([ia.x, h + 0.05, ia.y], [bb.x, h + 0.05, bb.y], [ba.x, h + 0.05, ba.y], BEACH);
        }
        if (low < h) wall(a, b, h - drop, low, beach ? sandSide : side);
      }
    });

    /** A wall from the top edge a-b down to `low` (the lower neighbour or the sea bed). */
    function wall(a: Point, b: Point, h: number, low: number, color: THREE.Color): void {
      tri([a.x, h, a.y], [b.x, h, b.y], [b.x, low, b.y], color, false);
      tri([a.x, h, a.y], [b.x, low, b.y], [a.x, low, a.y], color, false);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    return { mesh: new THREE.Mesh(geometry, material), triangleTile: Int32Array.from(triangleTile) };
  }

  private buildOverlay(): { mesh: THREE.Mesh; colors: THREE.BufferAttribute } {
    const positions: number[] = [];
    this.ids.forEach((id, i) => {
      const h = this.heights[i] + 0.3;
      const c = this.topology.tileCenter(id);
      const outline = this.topology.tileOutline(id);
      for (let k = 0; k < 6; k++) {
        const a = outline[k % outline.length];
        const b = outline[(k + 1) % outline.length];
        positions.push(c.x, h, c.y, b.x, h, b.y, a.x, h, a.y);
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const colors = new THREE.Float32BufferAttribute(new Float32Array((positions.length / 3) * 4), 4);
    geometry.setAttribute("color", colors);
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 1;
    return { mesh, colors };
  }

  /** Which neighbour lies across each side of a tile, found by shared corners. */
  private computeEdges(id: TileId): Edge[] {
    const outline = this.topology.tileOutline(id);
    const neighbors = this.topology.neighbors(id);
    return outline.map((a, i) => {
      const b = outline[(i + 1) % outline.length];
      const neighbor = neighbors.find((n) => {
        const other = this.topology.tileOutline(n);
        return hasPoint(other, a) && hasPoint(other, b);
      });
      return { a, b, neighbor: neighbor ?? null };
    });
  }
}

function hasPoint(points: readonly Point[], p: Point): boolean {
  return points.some((q) => Math.abs(q.x - p.x) < 0.01 && Math.abs(q.y - p.y) < 0.01);
}

/** A stable pseudo-random number in [0, 1) for a string. */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}
