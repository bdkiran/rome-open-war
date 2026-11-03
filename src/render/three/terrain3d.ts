import * as THREE from "three";
import type { TerrainType } from "@/data/terrain.js";
import type { TileDataMap } from "@/map/tiles.js";
import type { MapTopology, Point, TileId } from "@/map/topology.js";
import { TERRAIN_COLORS } from "@/render/colors.js";
import { buildMountains, buildTrees } from "@/render/three/scenery.js";

/** How high each kind of ground stands, in world units (a hex is 64 across). */
export const TERRAIN_HEIGHT: Record<TerrainType, number> = {
  water: -5,
  plains: 0,
  desert: 0.6,
  forest: 1.2,
  hills: 5,
  mountains: 11,
};

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
  /** Trees and peaks, rebuilt when the cities they make room for change. */
  private readonly scenery = new THREE.Group();
  private settlementsKey: string | null = null;

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
    this.setSettlements(new Set());
  }

  /**
   * Rebuilds the trees and peaks to leave room for cities: a tile with a city
   * gets no trees and no massif. Does nothing if the set hasn't changed.
   */
  setSettlements(tiles: ReadonlySet<TileId>): void {
    const key = [...tiles].sort().join("|");
    if (key === this.settlementsKey) return;
    this.settlementsKey = key;
    for (const child of [...this.scenery.children]) {
      this.scenery.remove(child);
      child.traverse((node) => (node as THREE.Mesh).geometry?.dispose());
    }
    const heightOf = (tile: TileId) => this.heightOf(tile);
    this.scenery.add(buildTrees(this.topology, this.tiles, heightOf, tiles), buildMountains(this.topology, this.tiles, heightOf, tiles));
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
  paintOverlay(colorOf: (tile: TileId) => readonly [number, number, number, number] | null): void {
    const arr = this.overlayColors.array as Float32Array;
    this.ids.forEach((id, i) => {
      const c = colorOf(id) ?? [0, 0, 0, 0];
      const base = i * 18 * 4;
      for (let v = 0; v < 18; v++) arr.set(c, base + v * 4);
    });
    this.overlayColors.needsUpdate = true;
  }

  // ---- Building ------------------------------------------------------------

  private buildGround(): { mesh: THREE.Mesh; triangleTile: Int32Array } {
    const positions: number[] = [];
    const colors: number[] = [];
    const triangleTile: number[] = [];
    const color = new THREE.Color();

    this.ids.forEach((id, i) => {
      const terrain = this.tiles[id].terrain;
      const h = this.heights[i];
      const c = this.topology.tileCenter(id);
      const outline = this.topology.tileOutline(id);
      // A slight random tint per land tile keeps large areas from looking flat;
      // the sea is one even colour so it reads as a single surface.
      color.set(TERRAIN_COLORS[terrain]);
      if (terrain !== "water") color.offsetHSL(0, 0, (hash(id) - 0.5) * 0.05);
      const side = color.clone().multiplyScalar(0.72);

      for (let k = 0; k < outline.length; k++) {
        const a = outline[k];
        const b = outline[(k + 1) % outline.length];
        positions.push(c.x, h, c.y, b.x, h, b.y, a.x, h, a.y);
        for (let v = 0; v < 3; v++) colors.push(color.r, color.g, color.b);
        triangleTile.push(i);
      }

      // Walls down to any lower neighbour, or to the sea bed at the map edge.
      for (const edge of this.edges.get(id)!) {
        const low = edge.neighbor ? this.heights[this.index.get(edge.neighbor)!] : TERRAIN_HEIGHT.water - 4;
        if (low >= h) continue;
        const { a, b } = edge;
        positions.push(a.x, h, a.y, b.x, h, b.y, b.x, low, b.y);
        positions.push(a.x, h, a.y, b.x, low, b.y, a.x, low, a.y);
        for (let v = 0; v < 6; v++) colors.push(side.r, side.g, side.b);
        triangleTile.push(i, i);
      }
    });

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
