import * as THREE from "three";
import { armySoldiers, getFaction, type GameState } from "@/core/state.js";
import { TERRAIN } from "@/data/terrain.js";
import type { TileDataMap } from "@/map/tiles.js";
import type { MapTopology, Point, TileId } from "@/map/topology.js";
import { formatCompact } from "@/render/format.js";
import type { ViewState } from "@/render/mapView.js";
import { isSpent } from "@/systems/armies.js";
import { Camera3D } from "@/render/three/camera3d.js";
import { buildArmy, buildCity, ModelLibrary, siegeRing, type Figure } from "@/render/three/models.js";
import { hash, Terrain3D } from "@/render/three/terrain3d.js";

/** Walking pace, in strides per second. */
const WALK_SPEED = 2.4;
/** How long an army takes to walk from one tile to the next when it moves, in seconds. */
const SECONDS_PER_TILE = 0.32;
/** A long move is sped up so it never takes longer than this. */
const MAX_WALK_SECONDS = 2.2;
/** Models are drawn a little larger than life so they read at campaign zoom. */
const ARMY_SCALE = 1.4;
const CITY_SCALE = 1.2;
/** City name plates are hidden when zoomed out further than this. */
const LABEL_MIN_ZOOM = 0.3;

type Rgba = readonly [number, number, number, number];

/** An army walking from where it was to where it now is. */
interface Walk {
  /** Points along the way, in three.js coordinates, from start to finish. */
  points: THREE.Vector3[];
  start: number;
  duration: number;
}

/**
 * The map in 3D: terrain, cities and armies as models, and overlays for
 * territory, fog, move and attack highlights, the selected tile, march routes
 * and sea crossings. City name plates are HTML, placed over the canvas each
 * frame. Armies stand still, and walk from tile to tile when they move.
 */
export class MapView3D {
  readonly camera = new Camera3D();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly terrain: Terrain3D;
  private readonly library = new ModelLibrary();

  private readonly armies = new Map<
    string,
    { key: string; figure: Figure; tile: TileId; position: THREE.Vector3; walk: Walk | null }
  >();
  /** Armies that merged into another, walking to it before they disappear. */
  private readonly ghosts: { figure: Figure; position: THREE.Vector3; walk: Walk; id: string }[] = [];
  /** Where each regiment was last shown, so an army split off from another walks out from it. */
  private regimentSpots = new Map<string, { tile: TileId; position: THREE.Vector3 }>();
  private readonly cities = new Map<string, { key: string; object: THREE.Object3D }>();
  private readonly cityLabels = new Map<string, { el: HTMLElement; text: string }>();
  private readonly layers = { borders: null as THREE.Object3D | null, selection: null as THREE.Object3D | null, route: null as THREE.Object3D | null };
  private seen = { territory: null as unknown, selected: null as unknown, route: "", overlay: [] as unknown[] };
  private lastTime = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly topology: MapTopology,
    private readonly tiles: TileDataMap,
    private readonly labelLayer: HTMLElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene.background = new THREE.Color("#000000");

    this.terrain = new Terrain3D(topology, tiles);
    this.scene.add(this.terrain.group);
    this.scene.add(new THREE.HemisphereLight("#e8eef2", "#4a4636", 1.6));
    const sun = new THREE.DirectionalLight("#fff1d6", 2.2);
    sun.position.set(-0.6, 1, 0.5);
    this.scene.add(sun);
    this.scene.add(this.buildCrossings());

    this.camera.setBounds(topology.bounds());
    // Once any model files have loaded, rebuild what's on the map so they're used.
    void this.library.load().then(() => {
      if (this.library.count === 0) return;
      for (const { figure } of this.armies.values()) this.scene.remove(figure.object);
      for (const { object } of this.cities.values()) this.scene.remove(object);
      this.armies.clear();
      this.cities.clear();
    });
  }

  resize(): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.renderer.setSize(width, height, false);
    this.camera.setViewSize(width, height);
  }

  pick(screenPoint: Point): TileId | null {
    return this.terrain.pick(this.camera.rayAt(screenPoint));
  }

  screenOf(tile: TileId): Point | null {
    return this.camera.toScreen(this.terrain.top(tile));
  }

  draw(state: GameState, view: ViewState, time: number): boolean {
    const delta = Math.min(0.1, Math.max(0, time - this.lastTime));
    this.lastTime = time;

    this.syncOverlay(state, view);
    this.syncBorders(state);
    this.syncSelection(view);
    this.syncRoute(view);
    this.syncCities(state, view);
    const animating = this.syncArmies(state, view, time, delta);

    this.renderer.render(this.scene, this.camera.three);
    this.placeLabels(state);
    return animating;
  }

  // ---- Tile colours: territory, fog and highlights ----------------------------

  private syncOverlay(state: GameState, view: ViewState): void {
    const key = [state.territory, state.factions, view.visible, view.reachable, view.attackable, view.hovered];
    if (key.every((k, i) => k === this.seen.overlay[i])) return;
    this.seen.overlay = key;

    const colors = new Map(state.factions.map((f) => [f.id, rgb(f.color)]));
    this.terrain.paintOverlay((tile) => {
      let c: Rgba | null = null;
      const claim = state.territory[tile];
      if (claim) c = over(c, [...colors.get(claim.owner)!, 0.24]);
      if (view.visible && !view.visible.has(tile)) c = over(c, [0.02, 0.05, 0.07, 0.45]);
      if (view.reachable.has(tile)) c = over(c, [0.96, 0.93, 0.87, 0.32]);
      if (view.attackable.has(tile)) c = over(c, [0.84, 0.23, 0.17, 0.45]);
      if (tile === view.hovered) c = over(c, [1, 1, 1, 0.16]);
      return c;
    });
  }

  // ---- Borders, selection, routes, crossings --------------------------------------

  /** Coloured strips along every edge where the owner changes. */
  private syncBorders(state: GameState): void {
    if (state.territory === this.seen.territory) return;
    this.seen.territory = state.territory;
    const ribbons = new Ribbons();
    for (const [tile, claim] of Object.entries(state.territory)) {
      const color = getFaction(state, claim.owner)?.color ?? "#000000";
      const center = this.topology.tileCenter(tile);
      const h = this.terrain.heightOf(tile) + 0.5;
      for (const edge of this.terrain.edgesOf(tile)) {
        const other = edge.neighbor ? state.territory[edge.neighbor] : undefined;
        if (other?.owner === claim.owner) continue;
        ribbons.inset(edge.a, edge.b, center, h, 3, color);
      }
    }
    this.replace("borders", ribbons.mesh());
  }

  /** A gold outline around the selected tile. */
  private syncSelection(view: ViewState): void {
    if (view.selected === this.seen.selected) return;
    this.seen.selected = view.selected;
    if (!view.selected) return this.replace("selection", null);
    const ribbons = new Ribbons();
    const center = this.topology.tileCenter(view.selected);
    const h = this.terrain.heightOf(view.selected) + 0.8;
    for (const edge of this.terrain.edgesOf(view.selected)) ribbons.inset(edge.a, edge.b, center, h, 3.5, "#e0b54f");
    this.replace("selection", ribbons.mesh());
  }

  /**
   * The selected army's march route, as a dashed line in a different colour
   * for each turn of the journey: gold for this turn, then orange, red,
   * purple and on. Where one turn ends, a dot marks where the army will stop.
   */
  private syncRoute(view: ViewState): void {
    const key = view.selected + ":" + view.route.join(",") + ":" + view.routeTurns.join(",");
    if (key === this.seen.route) return;
    this.seen.route = key;
    if (view.route.length === 0 || !view.selected) return this.replace("route", null);
    const ribbons = new Ribbons();
    let from = view.selected;
    view.route.forEach((to, i) => {
      const turn = view.routeTurns[i] ?? 0;
      const color = ROUTE_COLORS[turn % ROUTE_COLORS.length];
      const h = Math.max(this.terrain.heightOf(from), this.terrain.heightOf(to)) + 1.5;
      ribbons.dashed(this.topology.tileCenter(from), this.topology.tileCenter(to), h, 3.2, color);
      // Where this turn's march ends (the next tile is reached on a later turn, or it's the destination).
      const endsTurn = i === view.route.length - 1 || (view.routeTurns[i + 1] ?? turn) !== turn;
      if (endsTurn) ribbons.dot(this.topology.tileCenter(to), this.terrain.heightOf(to) + 1.8, 5, color);
      from = to;
    });
    this.replace("route", ribbons.mesh());
  }

  /** Sea crossings: dashed pale lines between the two shores. Built once. */
  private buildCrossings(): THREE.Object3D {
    const ribbons = new Ribbons();
    for (const [a, b] of this.topology.links?.() ?? []) {
      const h = Math.max(this.terrain.heightOf(a), this.terrain.heightOf(b)) + 1;
      ribbons.dashed(this.topology.tileCenter(a), this.topology.tileCenter(b), h, 2.6, "#f4eedd");
    }
    return ribbons.mesh() ?? new THREE.Group();
  }

  private replace(layer: keyof MapView3D["layers"], object: THREE.Object3D | null): void {
    const old = this.layers[layer];
    if (old) {
      this.scene.remove(old);
      old.traverse((n) => (n as THREE.Mesh).geometry?.dispose());
    }
    this.layers[layer] = object;
    if (object) this.scene.add(object);
  }

  // ---- Cities -------------------------------------------------------------

  private syncCities(state: GameState, view: ViewState): void {
    for (const city of Object.values(state.cities)) {
      const color = getFaction(state, city.owner)?.color ?? "#888888";
      const besieger = city.besiegedBy ? getFaction(state, city.besiegedBy)?.color ?? null : null;
      // Whether the banner flies: a garrison is there. A city the player can't
      // see into keeps its banner up, so the fog doesn't give it away.
      const inSight = city.owner === view.activeFaction || !view.visible || view.visible.has(city.tile);
      const holding = Object.values(state.armies).find((a) => a.tile === city.tile && a.owner === city.owner);
      const garrisoned = inSight ? holding !== undefined : true;
      const garrison = inSight && holding ? { label: formatCompact(armySoldiers(holding)), regiments: holding.regiments.length } : null;
      const key = `${color}|${city.isCapital}|${besieger}|${city.buildings.government}|${city.buildings.walls}|${garrisoned}|${garrison?.label}|${garrison?.regiments}`;
      const existing = this.cities.get(city.id);
      if (existing?.key === key) continue;
      if (existing) this.scene.remove(existing.object);

      const group = new THREE.Group();
      group.add(
        buildCity(
          color,
          { capital: city.isCapital, level: city.buildings.government, walls: city.buildings.walls, garrisoned, garrison },
          this.library,
        ),
      );
      if (besieger) group.add(siegeRing(besieger));
      group.position.copy(this.terrain.top(city.tile));
      group.scale.setScalar(CITY_SCALE);
      this.scene.add(group);
      this.cities.set(city.id, { key, object: group });
    }
  }

  /** Name plates under each city, as HTML over the canvas. */
  private placeLabels(state: GameState): void {
    const show = this.camera.zoom >= LABEL_MIN_ZOOM;
    for (const city of Object.values(state.cities)) {
      let label = this.cityLabels.get(city.id);
      if (!label) {
        const el = document.createElement("div");
        el.className = "city-plate";
        this.labelLayer.append(el);
        label = { el, text: "" };
        this.cityLabels.set(city.id, label);
      }
      const faction = getFaction(state, city.owner);
      const text = `${city.name}|${formatCompact(city.population)}|${faction?.color}|${city.isCapital}`;
      if (text !== label.text) {
        label.text = text;
        label.el.innerHTML = `<span class="name">${city.name}</span><span class="pop">${formatCompact(city.population)}</span>`;
        label.el.style.setProperty("--faction", faction?.color ?? "#888");
        label.el.classList.toggle("capital", city.isCapital);
      }
      const at = show ? this.camera.toScreen(this.terrain.top(city.tile).add(new THREE.Vector3(0, 0, 36))) : null;
      if (!at || at.x < -80 || at.y < -40 || at.x > this.canvas.clientWidth + 80 || at.y > this.canvas.clientHeight + 40) {
        label.el.hidden = true;
        continue;
      }
      label.el.hidden = false;
      label.el.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px) translate(-50%, 0)`;
    }
  }

  // ---- Armies -------------------------------------------------------------

  /**
   * Adds, updates and removes army models to match the game. An army whose
   * tile has changed walks there along a land route, facing the way it goes;
   * otherwise it stands still. Returns true while any army is walking.
   */
  private syncArmies(state: GameState, view: ViewState, time: number, delta: number): boolean {
    const cityTiles = new Set(Object.values(state.cities).map((c) => c.tile));
    const shown = new Set<string>();
    let animating = false;

    for (const army of Object.values(state.armies)) {
      const mine = army.owner === view.activeFaction;
      if (view.visible && !mine && !view.visible.has(army.tile)) continue;
      shown.add(army.id);

      const look = {
        color: getFaction(state, army.owner)?.color ?? "#888888",
        label: formatCompact(armySoldiers(army)),
        regiments: army.regiments.length,
        faded: mine && isSpent(army),
      };
      const key = JSON.stringify(look);
      const target = this.standingPoint(army.tile, cityTiles);
      let entry = this.armies.get(army.id);

      if (!entry) {
        const figure = buildArmy(look, this.library);
        // A new army made of regiments we've seen elsewhere (split off from
        // another army) walks out from where they were.
        const from = this.regimentSpots.get(army.regiments[0]?.id ?? "");
        entry = from && from.tile !== army.tile
          ? { key, figure, tile: from.tile, position: from.position.clone(), walk: null }
          : { key, figure, tile: army.tile, position: target.clone(), walk: null };
        this.armies.set(army.id, entry);
        this.scene.add(figure.object);
      } else if (entry.key !== key) {
        // Its look changed (strength, colour, spent): swap the model, keeping where it stands.
        this.scene.remove(entry.figure.object);
        entry.figure = buildArmy(look, this.library);
        entry.key = key;
        this.scene.add(entry.figure.object);
      }

      if (entry.tile !== army.tile) {
        entry.walk = this.walkBetween(entry.position, entry.tile, army.tile, target, time);
        entry.tile = army.tile;
      }

      const object = entry.figure.object;
      object.scale.setScalar(ARMY_SCALE * (cityTiles.has(army.tile) && !entry.walk ? 0.8 : 1));
      if (entry.walk) {
        const done = this.stepWalk(entry, time);
        if (done) {
          // Arrived: face the camera again (before animate, which squares the banner to it).
          entry.walk = null;
          object.rotation.y = 0;
        } else {
          animating = true;
        }
        entry.figure.animate(done ? 0 : Math.sin((time * WALK_SPEED + hash(army.id)) * Math.PI * 2), delta);
      } else {
        entry.position.copy(target);
        entry.figure.animate(0, delta);
      }
      object.position.copy(entry.position);
      // A garrison standing in its own city is shown by the city's banner, not a figure.
      const cityHere = Object.values(state.cities).find((c) => c.tile === army.tile);
      object.visible = !(cityHere?.owner === army.owner && !entry.walk);
    }

    for (const [id, entry] of this.armies) {
      if (shown.has(id)) continue;
      this.armies.delete(id);
      // Merged into another army on another tile: walk there first, then disappear.
      // (Its regiments are the ones last seen on its tile; only one army stands on a tile.)
      const oldIds = new Set([...this.regimentSpots].filter(([, spot]) => spot.tile === entry.tile).map(([rid]) => rid));
      const joined = Object.values(state.armies).find(
        (a) => a.id !== id && a.tile !== entry.tile && a.regiments.some((r) => oldIds.has(r.id)),
      );
      if (joined && (!view.visible || view.visible.has(joined.tile) || joined.owner === view.activeFaction)) {
        const target = this.standingPoint(joined.tile, cityTiles);
        const walk = this.walkBetween(entry.position, entry.tile, joined.tile, target, time);
        this.ghosts.push({ figure: entry.figure, position: entry.position.clone(), walk, id });
      } else {
        this.scene.remove(entry.figure.object);
      }
    }

    // Walk the merging armies to the army they joined.
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const ghost = this.ghosts[i];
      const done = this.stepWalk({ position: ghost.position, walk: ghost.walk, figure: ghost.figure }, time);
      ghost.figure.object.position.copy(ghost.position);
      ghost.figure.animate(done ? 0 : Math.sin((time * WALK_SPEED + hash(ghost.id)) * Math.PI * 2), delta);
      if (done) {
        this.scene.remove(ghost.figure.object);
        this.ghosts.splice(i, 1);
      } else {
        animating = true;
      }
    }

    const spots = new Map<string, { tile: TileId; position: THREE.Vector3 }>();
    for (const army of Object.values(state.armies)) {
      const entry = this.armies.get(army.id);
      if (!entry) continue;
      for (const r of army.regiments) spots.set(r.id, { tile: army.tile, position: entry.position.clone() });
    }
    this.regimentSpots = spots;
    return animating;
  }

  /**
   * Where an army stands on a tile: the middle, or, as a city's garrison, in
   * front of its gate, outside the walls.
   */
  private standingPoint(tile: TileId, cityTiles: ReadonlySet<TileId>): THREE.Vector3 {
    const p = this.terrain.top(tile);
    return cityTiles.has(tile) ? p.add(new THREE.Vector3(10, 0, 34)) : p;
  }

  /**
   * A walk from an army's current spot to its new one, through the centres
   * of the tiles on the shortest route over land (or straight across, if
   * there's no such route, as over a sea crossing's water).
   */
  private walkBetween(from: THREE.Vector3, fromTile: TileId, toTile: TileId, to: THREE.Vector3, time: number): Walk {
    const route = this.landRoute(fromTile, toTile);
    const points = [from.clone(), ...route.slice(1, -1).map((t) => this.terrain.top(t)), to.clone()];
    const steps = Math.max(1, route.length - 1);
    return { points, start: time, duration: Math.min(MAX_WALK_SECONDS, steps * SECONDS_PER_TILE) };
  }

  /** The shortest chain of neighbouring land tiles between two tiles, ends included. */
  private landRoute(from: TileId, to: TileId): TileId[] {
    const previous = new Map<TileId, TileId | null>([[from, null]]);
    const queue = [from];
    while (queue.length > 0 && !previous.has(to)) {
      const tile = queue.shift()!;
      if (previous.size > 400) break;
      for (const n of this.topology.neighbors(tile)) {
        if (previous.has(n)) continue;
        if (n !== to && !TERRAIN[this.tiles[n].terrain].passable) continue;
        previous.set(n, tile);
        queue.push(n);
      }
    }
    if (!previous.has(to)) return [from, to];
    const route: TileId[] = [];
    for (let t: TileId | null = to; t !== null; t = previous.get(t) ?? null) route.unshift(t);
    return route;
  }

  /** Moves a walking army along its route for this frame. Returns true once it has arrived. */
  private stepWalk(entry: { position: THREE.Vector3; walk: Walk | null; figure: Figure }, time: number): boolean {
    const walk = entry.walk!;
    const progress = Math.min(1, (time - walk.start) / walk.duration);
    const segments = walk.points.length - 1;
    const along = progress * segments;
    const i = Math.min(segments - 1, Math.floor(along));
    const a = walk.points[i];
    const b = walk.points[i + 1];
    entry.position.lerpVectors(a, b, along - i);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    if (dx !== 0 || dz !== 0) entry.figure.object.rotation.y = Math.atan2(dx, dz);
    return progress >= 1;
  }
}

/** The colours of a march route's legs, one per turn. */
const ROUTE_COLORS = ["#e0b54f", "#e8864a", "#d9534f", "#b565c9", "#5b8fd9", "#4fb88a"];

/** Flat coloured strips laid on the terrain, collected into one mesh. */
class Ribbons {
  private readonly positions: number[] = [];
  private readonly colors: number[] = [];

  /** A strip along a tile edge, `width` wide, on the inside of the tile. */
  inset(a: Point, b: Point, center: Point, height: number, width: number, color: string): void {
    const inward = (p: Point) => {
      const dx = center.x - p.x;
      const dy = center.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: p.x + (dx / len) * width, y: p.y + (dy / len) * width };
    };
    this.quad(a, b, inward(b), inward(a), height, color);
  }

  /** A dashed strip from one point to another. */
  dashed(from: Point, to: Point, height: number, width: number, color: string): void {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const dash = 9;
    const nx = -(to.y - from.y) / (length || 1) * (width / 2);
    const ny = (to.x - from.x) / (length || 1) * (width / 2);
    for (let t = 0; t < length; t += dash * 1.8) {
      const s = t / length;
      const e = Math.min(length, t + dash) / length;
      const p = { x: from.x + (to.x - from.x) * s, y: from.y + (to.y - from.y) * s };
      const q = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
      this.quad({ x: p.x + nx, y: p.y + ny }, { x: q.x + nx, y: q.y + ny }, { x: q.x - nx, y: q.y - ny }, { x: p.x - nx, y: p.y - ny }, height, color);
    }
  }

  /** A flat, round marker: a hexagon-ish disc of the given radius. */
  dot(center: Point, height: number, radius: number, color: string): void {
    const [r, g, b] = rgb(color);
    const sides = 10;
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      this.positions.push(center.x, height, center.y);
      this.positions.push(center.x + Math.cos(a0) * radius, height, center.y + Math.sin(a0) * radius);
      this.positions.push(center.x + Math.cos(a1) * radius, height, center.y + Math.sin(a1) * radius);
      for (let v = 0; v < 3; v++) this.colors.push(r, g, b);
    }
  }

  mesh(): THREE.Mesh | null {
    if (this.positions.length === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    mesh.renderOrder = 2;
    return mesh;
  }

  private quad(a: Point, b: Point, c: Point, d: Point, h: number, color: string): void {
    const [r, g, bl] = rgb(color);
    for (const p of [a, b, c, a, c, d]) {
      this.positions.push(p.x, h, p.y);
      this.colors.push(r, g, bl);
    }
  }
}

/** A hex colour as linear 0-1 channels, ready for vertex colours. */
function rgb(hex: string): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

/** Paints `top` over `base` (both with alpha). */
function over(base: Rgba | null, top: Rgba): Rgba {
  if (!base) return top;
  const a = top[3] + base[3] * (1 - top[3]);
  const mix = (i: number) => (top[i] * top[3] + base[i] * base[3] * (1 - top[3])) / a;
  return [mix(0), mix(1), mix(2), a];
}
