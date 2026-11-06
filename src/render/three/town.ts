import * as THREE from "three";
import type { Culture } from "@/data/cultures.js";
import { MeshBuilder, between, sequence } from "@/render/three/scenery.js";

/**
 * A city's town, built as one flat-shaded mesh: a stone base, houses in its
 * culture's style, its civic buildings, and its walls. In model units: the
 * base is a hexagon of radius 25 (the tile is 32), its top at y = 3, and the
 * camera looks north (toward -z), so the front of the town faces +z.
 *
 * - Houses: 4, 8 or 12 by level. Roman and Hellenistic towns have gabled,
 *   tiled houses; Punic towns flat-roofed ones; Celtic towns thatched
 *   roundhouses; Thracian towns thatched timber houses.
 * - Civic buildings: Roman, Hellenistic and Punic towns a temple at level 1,
 *   with a basilica and a theatre as they grow (the Greek temple has columns
 *   all round); Celtic and Thracian towns a great hall, with a shrine later.
 *   A capital's temple or hall is larger.
 * - Walls follow the hexagon, with a gate on the side facing the camera: a
 *   palisade, then stone walls with battlements and six towers, then great
 *   walls with roofed towers. Celtic and Thracian towns build an earth
 *   rampart topped with stakes in place of the stone walls.
 *
 * The flag pole stands at (-1, -10), behind the temple, so nothing tall is
 * built there.
 */

type P2 = readonly [number, number];
type V3 = readonly [number, number, number];

const TOP = 3;
const BASE_RADIUS = 25;
const WALL_RADIUS = 21.5;

const c = (hex: string) => new THREE.Color(hex);
const STONE = c("#cbbfa3");
const PAVING = c("#d8ccb0");
const WALL = c("#d9cdb0");
const WALL_DARK = c("#b9ad90");
const ROOFS = [c("#b5563a"), c("#a64b33"), c("#c2643f")];
const PLASTERS = [c("#efe6d2"), c("#e8dcc0"), c("#f2ead8"), c("#e2d3b2")];
const OCHRES = [c("#dcc49a"), c("#d6b98a"), c("#e3cfa6")];
const MARBLE = c("#f1ede3");
const CELLA = c("#e6e0d0");
const BASILICA = c("#e9dfc8");
const PORTICO = c("#d8ccaf");
const SEATS = c("#e2dccb");
const WOOD = c("#8a6a45");
const DARK_WOOD = c("#6b4f33");
const TIMBER_WALL = c("#a98a62");
const ROUNDHOUSE_WALL = c("#b9a27a");
const HALL_WALL = c("#9c7c55");
const THATCHES = [c("#b8964f"), c("#a7864a")];
const EARTH = c("#8c7a52");
const TURF = c("#7f8f4f");

/** The culture's house style. */
const HOUSES: Record<Culture, "tiled" | "flat" | "round" | "timber"> = {
  roman: "tiled",
  hellenistic: "tiled",
  punic: "flat",
  celtic: "round",
  thracian: "timber",
};

/** Where houses stand, front and sides first; the back centre is left for civic buildings and the flag. */
const PLOTS: P2[] = [[-9, 6], [8, 7], [-13, -2], [13, -1], [0, 13], [-6, 14], [7, 14], [-15, 7], [15, 7], [-11, -10], [11, -10], [-3, 7]];
const HOUSES_BY_LEVEL = [4, 8, 12];

/** Shapes added to one mesh, with the town's own random numbers. */
class Builder {
  readonly mesh = new MeshBuilder();
  constructor(readonly rand: () => number) {}

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.rand() * items.length)];
  }

  /** A flat face (convex polygon), facing away from `inside`. */
  face(points: V3[], color: THREE.Color, inside: V3): void {
    for (let i = 1; i + 1 < points.length; i++) this.mesh.tri(points[0], points[i], points[i + 1], color, inside);
  }

  /** A footprint raised from y0 to y1: walls and a top. */
  prism(foot: readonly P2[], y0: number, y1: number, side: THREE.Color, top: THREE.Color = side): void {
    const cx = foot.reduce((s, p) => s + p[0], 0) / foot.length;
    const cz = foot.reduce((s, p) => s + p[1], 0) / foot.length;
    const inside: V3 = [cx, (y0 + y1) / 2, cz];
    for (let i = 0; i < foot.length; i++) {
      const a = foot[i];
      const b = foot[(i + 1) % foot.length];
      this.face([[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]], side, inside);
    }
    this.face(foot.map((p) => [p[0], y1, p[1]] as const), top, inside);
  }

  box(x: number, y0: number, z: number, w: number, h: number, d: number, turn: number, side: THREE.Color, top: THREE.Color = side): void {
    this.prism(rect(x, z, w, d, turn), y0, y0 + h, side, top);
  }

  /** A pitched roof over a w x d box, its ridge along the box's length; `ends` colours the gable triangles. */
  gable(x: number, y0: number, z: number, w: number, d: number, h: number, turn: number, color: THREE.Color, eave = 0.8, ends = color): void {
    const W = w / 2 + eave;
    const D = d / 2 + eave;
    const P = (u: number, y: number, v: number): V3 => {
      const [px, pz] = turned(x, z, u, v, turn);
      return [px, y, pz];
    };
    const inside: V3 = [x, y0 + h / 3, z];
    this.face([P(-W, y0, -D), P(W, y0, -D), P(W, y0 + h, 0), P(-W, y0 + h, 0)], color, inside);
    this.face([P(-W, y0, D), P(W, y0, D), P(W, y0 + h, 0), P(-W, y0 + h, 0)], color, inside);
    this.face([P(-W, y0, -D), P(-W, y0, D), P(-W, y0 + h, 0)], ends, inside);
    this.face([P(W, y0, -D), P(W, y0, D), P(W, y0 + h, 0)], ends, inside);
  }

  cone(x: number, y0: number, z: number, r: number, h: number, sides: number, color: THREE.Color): void {
    const base = polygon(x, z, r, sides, this.rand());
    const apex: V3 = [x, y0 + h, z];
    const inside: V3 = [x, y0 + h / 3, z];
    for (let i = 0; i < sides; i++) {
      const p = base[i];
      const q = base[(i + 1) % sides];
      this.face([[p[0], y0, p[1]], [q[0], y0, q[1]], apex], color, inside);
    }
  }

  pyramid(x: number, y0: number, z: number, w: number, h: number, turn: number, color: THREE.Color): void {
    const foot = rect(x, z, w, w, turn);
    const apex: V3 = [x, y0 + h, z];
    const inside: V3 = [x, y0 + h / 3, z];
    for (let i = 0; i < 4; i++) {
      const p = foot[i];
      const q = foot[(i + 1) % 4];
      this.face([[p[0], y0, p[1]], [q[0], y0, q[1]], apex], color, inside);
    }
  }
}

/** (u, v) from (x, z), turned by `turn` about it. */
function turned(x: number, z: number, u: number, v: number, turn: number): P2 {
  return [x + u * Math.cos(turn) - v * Math.sin(turn), z + u * Math.sin(turn) + v * Math.cos(turn)];
}

function rect(x: number, z: number, w: number, d: number, turn: number): P2[] {
  return ([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]] as const).map(([u, v]) => turned(x, z, u, v, turn));
}

/** A regular polygon; with no turn, a corner points at the camera (+z), like the tile. */
function polygon(x: number, z: number, r: number, sides: number, turn = 0): P2[] {
  return Array.from({ length: sides }, (_, k) => {
    const a = turn + (k * Math.PI * 2) / sides;
    return [x + r * Math.sin(a), z + r * Math.cos(a)] as const;
  });
}

// ---- Buildings ---------------------------------------------------------------------

function house(b: Builder, x: number, z: number, s: number, turn: number, style: (typeof HOUSES)[Culture]): void {
  const w = between(b.rand, 6, 8.5) * s;
  const d = between(b.rand, 4.5, 6) * s;
  const h = between(b.rand, 4, 5.5) * s;
  if (style === "flat") {
    b.box(x, TOP, z, w, h * 1.35, d, turn, b.pick(OCHRES));
    b.box(x + w * 0.2, TOP + h * 1.35, z, w * 0.35, 1.6, d * 0.5, turn, b.pick(OCHRES));
  } else if (style === "round") {
    const r = between(b.rand, 3.6, 4.6) * s;
    b.prism(polygon(x, z, r, 8), TOP, TOP + 3.2 * s, ROUNDHOUSE_WALL);
    b.cone(x, TOP + 3.2 * s, z, r * 1.25, 5.5 * s, 8, b.pick(THATCHES));
  } else if (style === "timber") {
    b.box(x, TOP, z, w, h, d, turn, TIMBER_WALL);
    b.gable(x, TOP + h, z, w, d, 4.1 * s, turn, b.pick(THATCHES));
  } else {
    b.box(x, TOP, z, w, h, d, turn, b.pick(PLASTERS));
    b.gable(x, TOP + h, z, w, d, 2.6 * s, turn, b.pick(ROOFS));
  }
}

/** A temple on a podium, its columned front facing the camera; `colonnade` puts columns down its sides too. */
function temple(b: Builder, x: number, z: number, s: number, colonnade: boolean): void {
  const w = 9 * s;
  const d = 14 * s;
  const podium = 2.2 * s;
  const columns = 6 * s;
  b.box(x, TOP, z, w + 1.5, podium, d + 1.5, 0, MARBLE);
  b.box(x, TOP + podium, z - 1.2 * s, w - 2.4 * s, columns, d - 4 * s, 0, CELLA);
  const spots: P2[] = [];
  for (let i = 0; i < 4; i++) spots.push([x - w / 2 + 0.9 + (i * (w - 1.8)) / 3, z + d / 2 - 0.9]);
  if (colonnade) {
    for (let j = 1; j < 4; j++) {
      spots.push([x - w / 2 + 0.9, z + d / 2 - 0.9 - (j * (d - 1.8)) / 4]);
      spots.push([x + w / 2 - 0.9, z + d / 2 - 0.9 - (j * (d - 1.8)) / 4]);
    }
  }
  for (const [cx, cz] of spots) b.prism(polygon(cx, cz, 0.55 * s, 6), TOP + podium, TOP + podium + columns, MARBLE);
  b.box(x, TOP + podium + columns, z, w, 0.9 * s, d, 0, MARBLE);
  b.gable(x, TOP + podium + columns + 0.9 * s, z, d, w, 2.6 * s, Math.PI / 2, ROOFS[0], 0.3, MARBLE);
}

function basilica(b: Builder, x: number, z: number, s: number, turn: number): void {
  b.box(x, TOP, z, 17 * s, 3.4 * s, 9 * s, turn, PORTICO);
  b.box(x, TOP, z, 15 * s, 6 * s, 7 * s, turn, BASILICA);
  b.gable(x, TOP + 6 * s, z, 15 * s, 7 * s, 2.8 * s, turn, ROOFS[1]);
}

/** A half-ring of seats, open toward the camera. */
function theatre(b: Builder, x: number, z: number, s: number): void {
  const steps = 9;
  const inner = 4 * s;
  const outer = 9 * s;
  for (let k = 0; k < steps; k++) {
    const a0 = Math.PI * 0.5 + (k * Math.PI) / steps;
    const a1 = a0 + Math.PI / steps;
    const at = (r: number, a: number): P2 => [x + r * Math.sin(a), z + r * Math.cos(a)];
    b.prism([at(inner, a0), at(outer, a0), at(outer, a1), at(inner, a1)], TOP, TOP + 3.5 * s, MARBLE, SEATS);
  }
}

/** A long timber hall under a steep thatched roof. */
function hall(b: Builder, x: number, z: number, s: number): void {
  b.box(x, TOP, z, 13 * s, 5 * s, 7 * s, 0, HALL_WALL);
  b.gable(x, TOP + 5 * s, z, 13 * s, 7 * s, 6 * s, 0, THATCHES[1], 1.2);
}

// ---- Walls -------------------------------------------------------------------------

type WallKind = "palisade" | "stone" | "great" | "rampart";

/** Which walls a culture builds at each walls level (1-3). */
function wallKind(culture: Culture, walls: number): WallKind {
  const earthworks = culture === "celtic" || culture === "thracian";
  if (walls === 1) return "palisade";
  if (walls === 2) return earthworks ? "rampart" : "stone";
  return "great";
}

/** A row of pointed stakes from a to b. */
function stakes(b: Builder, a: P2, e: P2, y0: number, height: number): void {
  const length = Math.hypot(e[0] - a[0], e[1] - a[1]);
  const n = Math.max(1, Math.round(length / 1.5));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = a[0] + (e[0] - a[0]) * t;
    const z = a[1] + (e[1] - a[1]) * t;
    const h = height * between(b.rand, 0.85, 1);
    b.prism(polygon(x, z, 0.75, 5), y0, y0 + h, WOOD);
    b.cone(x, y0 + h, z, 0.75, 1.4, 5, WOOD);
  }
}

function walls(b: Builder, kind: WallKind): void {
  const corners = polygon(0, 0, WALL_RADIUS, 6);
  const great = kind === "great";
  const height = great ? 9 : 6.5;
  const along = (a: P2, e: P2, t: number): P2 => [a[0] + (e[0] - a[0]) * t, a[1] + (e[1] - a[1]) * t];

  for (let edge = 0; edge < 6; edge++) {
    const a = corners[edge];
    const e = corners[(edge + 1) % 6];
    const length = Math.hypot(e[0] - a[0], e[1] - a[1]);
    const turn = Math.atan2(e[1] - a[1], e[0] - a[0]);
    // The side from the front corner to the right has the gate in its middle.
    const runs: [number, number][] = edge === 0 ? [[0.06, 0.36], [0.64, 0.94]] : [[0.06, 0.94]];

    for (const [t0, t1] of runs) {
      const p = along(a, e, t0);
      const q = along(a, e, t1);
      const mid = along(a, e, (t0 + t1) / 2);
      const w = length * (t1 - t0);
      if (kind === "palisade") {
        stakes(b, p, q, TOP, 5.5);
      } else if (kind === "rampart") {
        b.box(mid[0], TOP, mid[1], w + 1, 2.5, 4.5, turn, EARTH, TURF);
        stakes(b, p, q, TOP + 2.5, 4);
      } else {
        b.box(mid[0], TOP, mid[1], w, height, 2.6, turn, WALL, WALL_DARK);
        const merlons = Math.max(2, Math.round(w / 2.4));
        for (let i = 0; i < merlons; i++) {
          const m = along(p, q, (i + 0.5) / merlons);
          b.box(m[0], TOP + height, m[1], 1.1, 1.3, 2.6, turn, WALL);
        }
      }
    }

    if (edge === 0) {
      const gate = along(a, e, 0.5);
      if (kind === "palisade" || kind === "rampart") {
        for (const t of [0.39, 0.61]) {
          const post = along(a, e, t);
          b.prism(polygon(post[0], post[1], 1.1, 5), TOP, TOP + 8, DARK_WOOD);
        }
        b.box(gate[0], TOP + 7, gate[1], length * 0.26, 1.2, 1.2, turn, DARK_WOOD);
      } else {
        const towerHeight = great ? 14 : 10;
        for (const t of [0.39, 0.61]) {
          const post = along(a, e, t);
          b.box(post[0], TOP, post[1], 4, towerHeight, 4, turn, WALL, WALL_DARK);
          if (great) b.pyramid(post[0], TOP + towerHeight, post[1], 4.8, 3.5, turn, ROOFS[0]);
          else battlements(b, post, TOP + towerHeight, 1.3, turn);
        }
        b.box(gate[0], TOP + towerHeight - 3, gate[1], length * 0.22, 3, 2.8, turn, WALL, WALL_DARK);
      }
    }
  }

  if (kind === "stone" || kind === "great") {
    const towerHeight = great ? 13 : 9.5;
    for (const corner of corners) {
      b.box(corner[0], TOP, corner[1], 4.6, towerHeight, 4.6, 0.3, WALL, WALL_DARK);
      if (great) b.pyramid(corner[0], TOP + towerHeight, corner[1], 5.6, 4, 0.3, ROOFS[0]);
      else battlements(b, corner, TOP + towerHeight, 1.6, 0.3);
    }
  }
}

/** Four merlons on a tower's top. */
function battlements(b: Builder, at: P2, y: number, spread: number, turn: number): void {
  for (const [u, v] of [[-1, -1], [1, 1], [-1, 1], [1, -1]] as const) {
    const [x, z] = turned(at[0], at[1], u * spread, v * spread, turn);
    b.box(x, y, z, 1.1, 1.3, 1.1, turn, WALL);
  }
}

// ---- The town ----------------------------------------------------------------------

/** What shapes a town: its culture, level (1-3), walls (0-3), whether it's a capital, and a seed for its layout. */
export interface TownLook {
  culture: Culture;
  level: number;
  walls: number;
  capital: boolean;
  /** Any stable value for this city (0-1), so it keeps the same layout. */
  seed: number;
}

/** Towns already built, by look: a city's model is rebuilt whenever its banner changes, its town needn't be. */
const built = new Map<string, THREE.BufferGeometry>();
const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

/** A city's town as one mesh, in model units (see the top of this file). */
export function buildTown(look: TownLook): THREE.Mesh {
  const key = `${look.culture}|${look.level}|${look.walls}|${look.capital}|${look.seed}`;
  let geometry = built.get(key);
  if (!geometry) {
    geometry = townGeometry(look);
    built.set(key, geometry);
  }
  return new THREE.Mesh(geometry, material);
}

function townGeometry(look: TownLook): THREE.BufferGeometry {
  const b = new Builder(sequence(`town:${look.seed}`));
  const level = Math.max(1, Math.min(3, look.level));
  const style = HOUSES[look.culture];

  // The base: a stone plinth with paving on top.
  b.prism(polygon(0, 0, BASE_RADIUS + 2, 6), 0, 1.5, STONE);
  b.prism(polygon(0, 0, BASE_RADIUS, 6), 1.5, TOP, STONE, PAVING);

  for (const [x, z] of PLOTS.slice(0, HOUSES_BY_LEVEL[level - 1])) {
    const turn = style === "round" ? 0 : b.pick([0, Math.PI / 2, 0.3, -0.3]);
    house(b, x + between(b.rand, -1, 1), z + between(b.rand, -1, 1), level === 1 ? 0.95 : 1, turn, style);
  }

  const grand = look.capital ? 1.15 : 1;
  if (style === "round" || style === "timber") {
    hall(b, 0, -6, [0.9, 1.05, 1.25][level - 1] * grand);
    if (level >= 2) {
      if (look.culture === "thracian") temple(b, 10, -12, 0.65, false);
      else b.cone(10, TOP, -12, 4, 6, 8, THATCHES[0]);
    }
  } else {
    const greek = look.culture === "hellenistic";
    temple(b, 0, -6, [0.6, 0.85, 1.05][level - 1] * grand, greek);
    // Greek towns build their theatre first; the others their basilica.
    if (level >= 2) (greek ? theatre(b, 11, -9, 0.75) : basilica(b, -10, -11, 0.7, 0.2));
    if (level >= 3) (greek ? basilica(b, -10, -11, 0.7, 0.2) : theatre(b, 11, -9, 0.75));
  }

  if (look.walls > 0) walls(b, wallKind(look.culture, Math.min(3, look.walls)));

  return b.mesh.geometry();
}

// ---- Siege works -------------------------------------------------------------------

/** How far out the siege works stand (model units), just past the town's base. */
const SIEGE_RINGS = [30.5];
/** Stakes around each ring. */
const STAKES_PER_RING = 30;
/** How big each stake is: about 13 tall, leaning in. */
const STAKE_SIZE = 3;

const siegeBuilt = new Map<string, THREE.BufferGeometry>();

/**
 * The works around a besieged city: a ring of big sharpened stakes leaning
 * in toward it, three pennants in the besieger's colour, a faint ring on
 * the ground in that colour, and the equipment built so far (`works`, in
 * whole points). In the city's model units.
 */
export function buildSiegeWorks(color: string, seed: number, works = 0): THREE.Group {
  const key = `${color}|${seed}|${works}`;
  let geometry = siegeBuilt.get(key);
  if (!geometry) {
    geometry = siegeGeometry(color, seed, works);
    siegeBuilt.set(key, geometry);
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, material));
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(SIEGE_RINGS[0] - 1.5, SIEGE_RINGS[0] + 1.5, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.4;
  group.add(ring);
  return group;
}

function siegeGeometry(color: string, seed: number, works: number): THREE.BufferGeometry {
  const b = new Builder(sequence(`siege:${seed}`));
  SIEGE_RINGS.forEach((radius, row) => {
    for (let i = 0; i < STAKES_PER_RING; i++) {
      const a = ((i + row * 0.5) / STAKES_PER_RING) * Math.PI * 2 + between(b.rand, -0.04, 0.04);
      stake(b, Math.sin(a) * radius, Math.cos(a) * radius, STAKE_SIZE * between(b.rand, 0.85, 1.1));
    }
  });
  // Pennants on poles, in the besieger's colour.
  const cloth = new THREE.Color(color);
  for (const a of [0.35, 2.45, 4.55]) {
    const x = Math.sin(a) * (SIEGE_RINGS[0] + 2.5);
    const z = Math.cos(a) * (SIEGE_RINGS[0] + 2.5);
    b.prism(polygon(x, z, 0.45, 5), 0, 18, DARK_WOOD);
    b.face([[x, 18, z], [x + 6, 16.4, z], [x, 14.8, z]], cloth, [x + 2, 16.4, z - 1]);
    b.face([[x, 18, z], [x + 6, 16.4, z], [x, 14.8, z]], cloth, [x + 2, 16.4, z + 1]);
  }
  siegeEquipment(b, works);
  return b.mesh.geometry();
}

/** Ladders from 1 point of works, a ram from 2, and a tower for each point from 3. */
function siegeEquipment(b: Builder, works: number): void {
  const at = (angle: number, radius = SIEGE_RINGS[0] - 4): P2 => [Math.sin(angle) * radius, Math.cos(angle) * radius];
  if (works >= 1) {
    for (const angle of [1.05, 3.2]) {
      const [x, z] = at(angle);
      for (const side of [-0.8, 0.8]) b.prism(polygon(x + side, z, 0.3, 4), 0, 12, DARK_WOOD);
      for (let y = 2; y <= 11; y += 3) b.prism(polygon(x, z, 0.9, 4), y, y + 0.35, DARK_WOOD);
    }
  }
  if (works >= 2) {
    const [x, z] = at(5.3);
    b.prism(polygon(x, z, 3.2, 4, Math.PI / 4), 0, 3.4, DARK_WOOD);
    b.prism(polygon(x, z, 1.1, 6), 3.4, 5, DARK_WOOD);
  }
  for (const [i, angle] of [0.2, 2.1, 4.2].entries()) {
    if (works < 3 + i) break;
    const [x, z] = at(angle);
    b.prism(polygon(x, z, 3, 4, Math.PI / 4), 0, 20, DARK_WOOD);
    b.prism(polygon(x, z, 3.6, 4, Math.PI / 4), 20, 21.2, DARK_WOOD);
  }
}

/** A sharpened stake planted at (x, z), leaning in toward the city at the centre. */
function stake(b: Builder, x: number, z: number, size: number): void {
  const r = Math.hypot(x, z);
  const inward = [-x / r, -z / r];
  const tip: V3 = [x + inward[0] * 1.8 * size, 4.4 * size, z + inward[1] * 1.8 * size];
  const w = 0.4 * size;
  const base: V3[] = [[x - w, 0, z - w], [x + w, 0, z - w], [x + w, 0, z + w], [x - w, 0, z + w]];
  const inside: V3 = [(x + tip[0]) / 2, tip[1] / 3, (z + tip[2]) / 2];
  for (let i = 0; i < 4; i++) b.face([base[i], base[(i + 1) % 4], tip], WOOD, inside);
}
