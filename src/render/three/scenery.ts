import * as THREE from "three";
import type { TileDataMap } from "@/map/tiles.js";
import type { MapTopology, TileId } from "@/map/topology.js";

/**
 * The trees on forests and the peaks on mountains. Both are low-poly and
 * flat-shaded, coloured per vertex, and placed from each tile's id, so a
 * forest looks the same every time the map is drawn.
 *
 * Forests change with latitude: firs in the north, oak woods in the middle,
 * umbrella pines, cypresses and olives around the Mediterranean. Mountains
 * are massifs (a main peak and lower shoulders, snow on the highest faces),
 * joined by low ridges wherever two mountain tiles meet, so ranges read as
 * chains. The centre of each tile is kept clear for the army standing there,
 * a tile with a city gets neither trees nor a massif, and nothing grows in a
 * clearing (under a watchtower).
 */

type V3 = readonly [number, number, number];

/** A round patch of ground (world units) kept free of trees and peaks, e.g. under a watchtower. */
export interface Clearing {
  x: number;
  z: number;
  radius: number;
}

/** What the scenery makes room for: tiles with a city, and clearings. */
export interface Clearings {
  settlements: ReadonlySet<TileId>;
  spots: readonly Clearing[];
}

/** Whether something of radius `r` at (x, z) would stand in a clearing. */
function inClearing(clear: Clearings, x: number, z: number, r: number): boolean {
  return clear.spots.some((s) => Math.hypot(x - s.x, z - s.z) < s.radius + r);
}

// ---- Random numbers from a tile id -------------------------------------------

/** A stable pseudo-random sequence in [0, 1) for a string. */
export function sequence(key: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  let s = h >>> 0 || 1;
  return () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function between(rand: () => number, a: number, b: number): number {
  return a + (b - a) * rand();
}

/** 0 below `a`, 1 above `b`, smooth in between (also works with a > b). */
function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// ---- Building flat-shaded meshes ------------------------------------------------

/** Triangles with a colour each, wound to face away from a given centre. */
export class MeshBuilder {
  private readonly positions: number[] = [];
  private readonly colors: number[] = [];

  /** Adds a triangle facing away from `inside` (a point within the solid). */
  tri(a: V3, b: V3, c: V3, color: THREE.Color, inside: V3): void {
    const n = normal(a, b, c);
    const centre = [(a[0] + b[0] + c[0]) / 3 - inside[0], (a[1] + b[1] + c[1]) / 3 - inside[1], (a[2] + b[2] + c[2]) / 3 - inside[2]];
    const outward = n[0] * centre[0] + n[1] * centre[1] + n[2] * centre[2] >= 0;
    for (const p of outward ? [a, b, c] : [a, c, b]) this.positions.push(p[0], p[1], p[2]);
    for (let i = 0; i < 3; i++) this.colors.push(color.r, color.g, color.b);
  }

  quad(a: V3, b: V3, c: V3, d: V3, color: THREE.Color, inside: V3): void {
    this.tri(a, b, c, color, inside);
    this.tri(a, c, d, color, inside);
  }

  geometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals();
    return geometry;
  }
}

function normal(a: V3, b: V3, c: V3): [number, number, number] {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n: [number, number, number] = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const length = Math.hypot(...n) || 1;
  return [n[0] / length, n[1] / length, n[2] / length];
}

/** Points around a circle, each pushed in or out at random by up to `jitter` of the radius. */
function ring(rand: () => number, cx: number, y: number, cz: number, r: number, sides: number, turn: number, jitter = 0): V3[] {
  return Array.from({ length: sides }, (_, k) => {
    const a = turn + (k * Math.PI * 2) / sides;
    const rr = r * (1 + (rand() - 0.5) * jitter);
    return [cx + rr * Math.cos(a), y, cz + rr * Math.sin(a)] as const;
  });
}

function cone(m: MeshBuilder, rand: () => number, y: number, r: number, h: number, sides: number, color: THREE.Color): void {
  const base = ring(rand, 0, y, 0, r, sides, rand() * Math.PI);
  const apex: V3 = [0, y + h, 0];
  const inside: V3 = [0, y + h * 0.3, 0];
  for (let k = 0; k < sides; k++) m.tri(base[k], apex, base[(k + 1) % sides], color, inside);
}

function trunk(m: MeshBuilder, rand: () => number, r: number, h: number, color: THREE.Color, lean = 0): void {
  const a = ring(rand, 0, 0, 0, r, 5, 0);
  const b = ring(rand, lean, h, 0, r * 0.8, 5, 0);
  const inside: V3 = [lean / 2, h / 2, 0];
  for (let k = 0; k < 5; k++) m.quad(a[k], b[k], b[(k + 1) % 5], a[(k + 1) % 5], color, inside);
}

const PHI = (1 + Math.sqrt(5)) / 2;
const ICOSAHEDRON_POINTS: V3[] = (
  [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]] as V3[]
).map((p) => {
  const l = Math.hypot(...p);
  return [p[0] / l, p[1] / l, p[2] / l] as const;
});
const ICOSAHEDRON_FACES = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

/** A faceted, slightly lumpy ball: a leafy crown. */
function crown(m: MeshBuilder, rand: () => number, cx: number, cy: number, cz: number, rx: number, ry: number, color: THREE.Color): void {
  const points = ICOSAHEDRON_POINTS.map((p) => {
    const j = 1 + (rand() - 0.5) * 0.36;
    return [cx + p[0] * rx * j, cy + p[1] * ry * j, cz + p[2] * rx * j] as const;
  });
  for (const [a, b, c] of ICOSAHEDRON_FACES) m.tri(points[a], points[b], points[c], color, [cx, cy, cz]);
}

// ---- Trees ----------------------------------------------------------------------

const BARK = new THREE.Color("#6b4f33");
const PINE_BARK = new THREE.Color("#7a5636");
const OLIVE_BARK = new THREE.Color("#7a6a55");

/** Each kind of tree, built once, about 14-18 units tall (a tile is 64 across). */
const TREE_KINDS = {
  oak: (rand: () => number) => {
    const m = new MeshBuilder();
    trunk(m, rand, 0.9, 5, BARK);
    crown(m, rand, 0, 8.5, 0, 5.2, 4.4, new THREE.Color("#55803d"));
    return m;
  },
  fir: (rand: () => number) => {
    const m = new MeshBuilder();
    const needles = new THREE.Color("#2f5236");
    trunk(m, rand, 0.7, 3, BARK);
    cone(m, rand, 2.5, 4.6, 7, 7, needles);
    cone(m, rand, 6, 3.6, 6.5, 7, needles);
    cone(m, rand, 9.5, 2.5, 6, 7, needles);
    return m;
  },
  pine: (rand: () => number) => {
    const m = new MeshBuilder();
    trunk(m, rand, 0.8, 11, PINE_BARK, 0.8);
    crown(m, rand, 1.2, 13, 0, 6.2, 2.6, new THREE.Color("#5d7d3e"));
    return m;
  },
  cypress: (rand: () => number) => {
    const m = new MeshBuilder();
    const leaves = new THREE.Color("#2c4a30");
    trunk(m, rand, 0.6, 1.5, BARK);
    const base = ring(rand, 0, 1.5, 0, 2.2, 6, 0);
    const middle = ring(rand, 0, 7, 0, 2.6, 6, 0);
    const top: V3 = [0, 17, 0];
    const inside: V3 = [0, 7, 0];
    for (let k = 0; k < 6; k++) {
      const j = (k + 1) % 6;
      m.quad(base[k], middle[k], middle[j], base[j], leaves, inside);
      m.tri(middle[k], top, middle[j], leaves, inside);
    }
    return m;
  },
  olive: (rand: () => number) => {
    const m = new MeshBuilder();
    trunk(m, rand, 0.8, 3.5, OLIVE_BARK);
    crown(m, rand, -1.5, 5.5, 0, 3.4, 2.6, new THREE.Color("#8a9a68"));
    crown(m, rand, 1.8, 6, 0.5, 3, 2.4, new THREE.Color("#7f9060"));
    return m;
  },
} satisfies Record<string, (rand: () => number) => MeshBuilder>;

type TreeKind = keyof typeof TREE_KINDS;

/** Trees on each forest tile. */
const TREES_PER_TILE = 8;
/** Trees stand between these distances from a tile's centre, leaving room for an army. */
const TREE_RING = { min: 9, max: 24 };

/**
 * How likely each kind of tree is, by how far south the tile is (0 = the
 * map's northern edge, 1 = its southern edge). Firs give way to oaks around
 * the Alps' latitude, and oaks to Mediterranean trees below it.
 */
function treeWeights(south: number): Record<TreeKind, number> {
  const north = smoothstep(0.42, 0.24, south);
  const med = smoothstep(0.43, 0.56, south);
  return {
    fir: (0.12 + 0.68 * north) * (1 - med),
    oak: (1 - 0.75 * north) * (1 - med) + 0.12 * med,
    pine: 0.38 * med,
    cypress: 0.25 * med,
    olive: 0.25 * med,
  };
}

function pick(rand: () => number, weights: Record<TreeKind, number>): TreeKind {
  const kinds = Object.keys(weights) as TreeKind[];
  let r = rand() * kinds.reduce((sum, k) => sum + weights[k], 0);
  for (const k of kinds) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return kinds[0];
}

/** All the forests' trees: one instanced mesh per kind of tree. */
export function buildTrees(
  topology: MapTopology,
  tiles: TileDataMap,
  heightOf: (tile: TileId) => number,
  clear: Clearings,
): THREE.Group {
  const bounds = topology.bounds();
  const placed: Record<TreeKind, THREE.Matrix4[]> = { oak: [], fir: [], pine: [], cypress: [], olive: [] };
  const tints: Record<TreeKind, THREE.Color[]> = { oak: [], fir: [], pine: [], cypress: [], olive: [] };

  for (const id of topology.allTiles()) {
    if (tiles[id].terrain !== "forest" || clear.settlements.has(id)) continue;
    const rand = sequence(`trees:${id}`);
    const c = topology.tileCenter(id);
    const weights = treeWeights((c.y - bounds.minY) / (bounds.maxY - bounds.minY));
    const turn = rand() * Math.PI * 2;
    for (let k = 0; k < TREES_PER_TILE; k++) {
      const angle = turn + (k / TREES_PER_TILE) * Math.PI * 2 + between(rand, -0.3, 0.3);
      const r = between(rand, TREE_RING.min, TREE_RING.max);
      const kind = pick(rand, weights);
      const s = between(rand, 0.8, 1.2);
      const x = c.x + Math.cos(angle) * r;
      const z = c.y + Math.sin(angle) * r;
      if (inClearing(clear, x, z, 5 * s)) continue;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(x, heightOf(id), z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2),
        new THREE.Vector3(s, s * between(rand, 0.9, 1.1), s),
      );
      placed[kind].push(m);
      // A little light and dark variation, so a wood isn't one flat green.
      tints[kind].push(new THREE.Color().setScalar(between(rand, 0.86, 1.1)));
    }
  }

  const group = new THREE.Group();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  for (const kind of Object.keys(TREE_KINDS) as TreeKind[]) {
    if (placed[kind].length === 0) continue;
    const geometry = TREE_KINDS[kind](sequence(`tree-kind:${kind}`)).geometry();
    const mesh = new THREE.InstancedMesh(geometry, material, placed[kind].length);
    placed[kind].forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, tints[kind][i]);
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}

// ---- Mountains --------------------------------------------------------------------

const ROCK = new THREE.Color("#857d74");
const ROCK_HIGH = new THREE.Color("#968e85");
const SNOW = new THREE.Color("#eef0ef");
/** Faces reaching this far above the mountain tile's top are snow, if they face upward. */
const SNOWLINE = 24;

/**
 * One jagged peak: a ring of rock, a narrower ring halfway up, and a summit
 * pushed a little off centre. `top` is the ground height it stands on.
 */
function peak(m: MeshBuilder, rand: () => number, cx: number, top: number, cz: number, r: number, h: number): void {
  const sides = 7;
  const turn = rand() * Math.PI * 2;
  const offX = between(rand, -0.18, 0.18) * r;
  const offZ = between(rand, -0.15, 0.15) * r;
  const base = ring(rand, cx, top, cz, r, sides, turn, 0.35);
  const middleY = top + h * 0.48;
  const middle = ring(rand, cx + offX / 2, middleY, cz + offZ / 2, r * 0.55, sides, turn + 0.3, 0.35);
  const summit: V3 = [cx + offX, top + h, cz + offZ];
  const inside: V3 = [cx + offX / 3, top + h * 0.3, cz + offZ / 3];
  const shade = between(rand, 0.94, 1.06);
  const colorOf = (a: V3, b: V3, c: V3): THREE.Color => {
    const highest = Math.max(a[1], b[1], c[1]);
    const n = normal(a, b, c);
    if (highest > top + SNOWLINE && Math.abs(n[1]) > 0.15) return SNOW;
    const low = (a[1] + b[1] + c[1]) / 3 < middleY;
    return (low ? ROCK : ROCK_HIGH).clone().multiplyScalar(shade);
  };
  for (let k = 0; k < sides; k++) {
    const j = (k + 1) % sides;
    m.tri(base[k], middle[k], middle[j], colorOf(base[k], middle[k], middle[j]), inside);
    m.tri(base[k], middle[j], base[j], colorOf(base[k], middle[j], base[j]), inside);
    m.tri(middle[k], summit, middle[j], colorOf(middle[k], summit, middle[j]), inside);
  }
}

/** Keeps a peak this far from a tile's centre, where armies stand. */
const ARMY_CLEARANCE = 9;

/**
 * Every mountain tile's massif, and the ridges between neighbouring mountain
 * tiles, as one mesh. The main peak stands toward the back of the tile (the
 * camera looks north), so an army at the centre stands in front of it.
 */
export function buildMountains(
  topology: MapTopology,
  tiles: TileDataMap,
  heightOf: (tile: TileId) => number,
  clear: Clearings,
): THREE.Mesh {
  const { settlements } = clear;
  // A peak that would stand in a clearing is still worked out (into a builder
  // that's thrown away), so the rest of its tile's random layout doesn't shift.
  const discard = new MeshBuilder();
  const into = (x: number, z: number, r: number) => (inClearing(clear, x, z, r * 0.8) ? discard : m);
  const m = new MeshBuilder();
  const isMountain = (id: TileId) => tiles[id]?.terrain === "mountains";

  for (const id of topology.allTiles()) {
    if (!isMountain(id)) continue;
    const rand = sequence(`peaks:${id}`);
    const c = topology.tileCenter(id);
    const top = heightOf(id);

    if (!settlements.has(id)) {
      // The main peak, behind the centre.
      const mainX = c.x + between(rand, -4, 4);
      const mainZ = c.y - between(rand, 10, 13);
      const mainR = between(rand, 12.5, 15);
      peak(into(mainX, mainZ, mainR), rand, mainX, top, mainZ, mainR, between(rand, 28, 36));
      // Two shoulders at the back corners, and sometimes a small one beside the centre.
      for (const side of [-1, 1]) {
        const angle = -Math.PI / 2 + side * between(rand, 0.7, 1.3);
        const d = between(rand, 14, 19);
        const x = c.x + Math.cos(angle) * d;
        const z = c.y + Math.sin(angle) * d;
        const r = between(rand, 7.5, 10);
        peak(into(x, z, r), rand, x, top, z, r, between(rand, 11, 17));
      }
      if (rand() < 0.5) {
        const side = rand() < 0.5 ? -1 : 1;
        const x = c.x + side * between(rand, 18, 21);
        const z = c.y + between(rand, 2, 8);
        const r = between(rand, 5, 7);
        peak(into(x, z, r), rand, x, top, z, r, between(rand, 7, 10));
      }
    }

    // Ridges: a few low peaks across the edge to each mountain neighbour (each pair once).
    for (const n of topology.neighbors(id)) {
      if (!isMountain(n) || n <= id) continue;
      const d = topology.tileCenter(n);
      const ridgeRand = sequence(`ridge:${id}:${n}`);
      for (const t of [0.32, 0.5, 0.68]) {
        const x = c.x + (d.x - c.x) * t;
        const z = c.y + (d.y - c.y) * t;
        // Not over a city, and never on top of where an army stands.
        const nearCity = (settlements.has(id) && t < 0.5) || (settlements.has(n) && t > 0.5);
        const clear = Math.min(Math.hypot(x - c.x, z - c.y), Math.hypot(x - d.x, z - d.y)) > ARMY_CLEARANCE + 6;
        if (nearCity || !clear) continue;
        const h = between(ridgeRand, 10, 15) * (1 - Math.abs(t - 0.5));
        const px = x + between(ridgeRand, -2, 2);
        const pz = z + between(ridgeRand, -2, 2);
        const r = between(ridgeRand, 7, 9.5);
        peak(into(px, pz, r), ridgeRand, px, Math.min(heightOf(id), heightOf(n)), pz, r, h);
      }
    }
  }

  return new THREE.Mesh(m.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
}
