import * as THREE from "three";
import { armySoldiers, getFaction, type Army, type City, type CityId, type GameState } from "@/core/state.js";
import { TERRAIN } from "@/data/terrain.js";
import type { TileDataMap } from "@/map/tiles.js";
import type { MapTopology, Point, TileId } from "@/map/topology.js";
import { cityPlate } from "@/render/cityPlate.js";
import { formatCompact } from "@/render/format.js";
import type { ViewState } from "@/render/mapView.js";
import { isSpent } from "@/systems/armies.js";
import { portTile, regionOwner, roadCut, roadsOf, tradeRoutes, type TradeRoute } from "@/systems/cities.js";
import { towerOwner } from "@/systems/watchtowers.js";
import { Camera3D } from "@/render/three/camera3d.js";
import { buildArmy, buildCart, buildCity, buildPort, buildScout, buildShip, buildWatchtower, clashBurst, ModelLibrary, setFlagClock, WATCHTOWER_SPOT, type Figure } from "@/render/three/models.js";
import { hash, Terrain3D } from "@/render/three/terrain3d.js";
import { buildSiegeWorks } from "@/render/three/town.js";

/** Walking pace, in strides per second. */
const WALK_SPEED = 2.4;
/** How long an army takes to walk from one tile to the next when it moves, in seconds. */
const SECONDS_PER_TILE = 0.32;
/** A long move is sped up so it never takes longer than this. */
const MAX_WALK_SECONDS = 2.2;
/** Other factions' armies walk faster, so watching their turns stays quick. */
const ENEMY_SECONDS_PER_TILE = 0.15;
const ENEMY_MAX_WALK_SECONDS = 0.9;
/** How long a battle's clash plays, and an attacker's lunge toward its target (seconds). */
const CLASH_SECONDS = 0.8;
const LUNGE_SECONDS = 0.45;
/** How far a lunge goes toward the target tile, as a share of the way. */
const LUNGE_REACH = 0.35;
/** A released battle strikes after this long even if an attacker is still walking (seconds). */
const MAX_BATTLE_WAIT = 3;
/** Models are drawn a little larger than life so they read at campaign zoom. */
const ARMY_SCALE = 1.4;
const CITY_SCALE = 1.2;
/** A scout is drawn a little smaller than an army's figure. */
const SCOUT_SCALE = 1.1;
/** Watchtowers are slim, so they're drawn larger to read at campaign zoom. */
const TOWER_SCALE = 1.9;
/** Ports are drawn a little larger than life, so they read at campaign zoom without crowding the sea tile. */
const PORT_SCALE = 1.4;
/** Where a pier starts, from the shore's land tile (0) to the port tile's centre (1). */
const PORT_OFFSHORE = 0.55;
/**
 * A sea trade route: a soft, faint lane curving over the water (unlike a
 * crossing's bold dashes), with a ship sailing it from port to port and back.
 */
const SEA_LANE = { color: "#a9d8e8", width: 1.6, lift: 0.9, opacity: 0.35 };
/** Trading ships: their size, and their speed in map units a second. */
const SHIP_SCALE = 1.3;
const SHIP_SPEED = 28;
/** Trading carts on the roads: their size, their speed, and how far short of each town they turn round. */
const CART_SCALE = 1.6;
const CART_SPEED = 14;
const CART_TOWN_CLEARANCE = 30;
/**
 * More trade, more traffic: a route carries one ship or cart for every this
 * much gold a turn it pays (both ends together), from one up to the most.
 */
const TRAFFIC = { goldPerVehicle: 6, most: 4 };
/** The fog over tiles out of sight: a dark blue-grey wash, [r, g, b, opacity]. */
const FOG: Rgba = [0.02, 0.05, 0.07, 0.6];
/** City name plates are hidden when zoomed out further than this. */
const LABEL_MIN_ZOOM = 0.3;

type Rgba = readonly [number, number, number, number];

/** An army walking from where it was to where it now is. */
interface Walk {
  /** Points along the way, in three.js coordinates, from start to finish. */
  points: THREE.Vector3[];
  start: number;
  duration: number;
  /** A lunge at the enemy: the army keeps facing this way and strikes rather than walks. */
  lungeFacing?: number;
}

/**
 * A battle being played on the map. Its attackers walk up beside the tile and
 * hold there; once it's released and they've arrived, they strike and the
 * clash plays. Until the blow lands, the armies on the tile stay where they
 * stood (even ones the battle destroyed) and its city keeps its old colours.
 */
interface MapBattle {
  tile: TileId;
  color: string;
  attackers: ReadonlySet<string>;
  /** When it was released to strike, or null while held (an enemy's step waits for the camera). */
  released: number | null;
  /** When the blow was struck, or null before. */
  struck: number | null;
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
    { key: string; figure: Figure; tile: TileId; position: THREE.Vector3; walk: Walk | null; besieging: CityId | null; facing: { y: number; until: number } | null }
  >();
  /** Battles waiting for their blow, or whose clash is still playing. */
  private readonly battles: MapBattle[] = [];
  /** Armies that merged into another, walking to it before they disappear. */
  private readonly ghosts: { figure: Figure; position: THREE.Vector3; walk: Walk; id: string }[] = [];
  /** Where each regiment was last shown, so an army split off from another walks out from it. */
  private regimentSpots = new Map<string, { tile: TileId; position: THREE.Vector3 }>();
  private readonly cities = new Map<string, { key: string; object: THREE.Object3D }>();
  /** Scouts on the map: they walk as armies do, but stand aside so both can be seen. */
  private readonly scouts = new Map<string, { key: string; figure: Figure; tile: TileId; position: THREE.Vector3; walk: Walk | null }>();
  /** Battle clashes playing on the map. */
  private readonly clashes: { object: THREE.Object3D; update(progress: number): void; start: number }[] = [];
  /** Watchtowers by tile, keyed by their owner's colour. */
  private readonly towers = new Map<TileId, { key: string; object: THREE.Object3D }>();
  /** Ports by city, keyed by their owner's colour and level. */
  private readonly ports = new Map<CityId, { key: string; object: THREE.Object3D }>();
  /** The way over the water between two ports, by the pair of port tiles: found once each. */
  private readonly lanes = new Map<string, TileId[]>();
  /** Ships and carts on the player's trade routes. */
  private traffic: { sea: Trip[]; land: Trip[] } = { sea: [], land: [] };
  private readonly cityLabels = new Map<string, { el: HTMLElement; text: string }>();
  /** The state and player the plates were last filled in for. */
  private platesFor: GameState | null = null;
  private platesFaction: string | null = null;
  private readonly layers = { roads: null as THREE.Object3D | null, borders: null as THREE.Object3D | null, selection: null as THREE.Object3D | null, route: null as THREE.Object3D | null, seaRoutes: null as THREE.Object3D | null, landTrade: null as THREE.Object3D | null };
  private seen = { roads: [] as unknown[], territory: null as unknown, selected: null as unknown, route: "", overlay: [] as unknown[], seaRoutes: [] as unknown[], landTrade: [] as unknown[] };
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
    setFlagClock(time);

    this.syncOverlay(state, view);
    this.syncBorders(state);
    this.syncRoads(state, view);
    this.syncSeaRoutes(state, view);
    this.syncLandTrade(state, view);
    this.moveTraffic(time);
    this.syncSelection(view);
    this.syncRoute(view);
    this.syncClearings(state);
    this.syncCities(state, view);
    this.syncWatchtowers(state);
    this.syncPorts(state);
    this.syncArmies(state, view, time, delta);
    this.syncScouts(state, view, time, delta);
    this.syncClashes(time);

    this.renderer.render(this.scene, this.camera.three);
    this.placeLabels(state, view);
    // Banners are always waving, so the map keeps redrawing.
    return true;
  }

  // ---- Tile colours: territory, fog and highlights ----------------------------

  private syncOverlay(state: GameState, view: ViewState): void {
    const key = [state.territory, state.factions, view.visible, view.reachable, view.attackable, view.hovered];
    if (key.every((k, i) => k === this.seen.overlay[i])) return;
    this.seen.overlay = key;

    const colors = new Map(state.factions.map((f) => [f.id, rgb(f.color)]));
    this.terrain.paintFog((tile) => (view.visible && !view.visible.has(tile) ? FOG : null));
    this.terrain.paintOverlay((tile) => {
      let c: Rgba | null = null;
      // Worked land in full colour; the rest of the city's region fainter, so the gaps don't show.
      const claim = state.territory[tile];
      const region = claim?.owner ?? regionOwner(state, tile);
      if (region) c = over(c, [...colors.get(region)!, claim ? 0.24 : 0.12]);
      if (view.visible && !view.visible.has(tile)) c = over(c, FOG);
      if (view.reachable.has(tile)) c = over(c, [0.96, 0.93, 0.87, 0.32]);
      if (view.attackable.has(tile)) c = over(c, [0.84, 0.23, 0.17, 0.45]);
      if (tile === view.hovered) c = over(c, [1, 1, 1, 0.16]);
      return c;
    });
  }

  // ---- Borders, selection, routes, crossings --------------------------------------

  /**
   * Coloured strips along every edge where the owner changes, drawn around
   * whole regions (state.regions) so neighbouring factions' borders meet.
   * Territory changes hands with its city, so it marks when to redraw.
   */
  private syncBorders(state: GameState): void {
    if (state.territory === this.seen.territory) return;
    this.seen.territory = state.territory;
    const ribbons = new Ribbons();
    for (const tile of Object.keys(state.regions)) {
      const owner = regionOwner(state, tile);
      if (!owner) continue;
      const color = getFaction(state, owner)?.color ?? "#000000";
      const center = this.topology.tileCenter(tile);
      const h = this.terrain.heightOf(tile) + 0.5;
      for (const edge of this.terrain.edgesOf(tile)) {
        if (edge.neighbor && regionOwner(state, edge.neighbor) === owner) continue;
        ribbons.inset(edge.a, edge.b, center, h, 3, color);
      }
    }
    this.replace("borders", ribbons.mesh());
  }

  /**
   * Built roads: each city's half of a road (the tiles in its land) once it
   * has roads, from a dirt track to a pale paved road. The player's own roads
   * are drawn dashed red while an enemy army cuts them. Dimmed in the fog.
   */
  private syncRoads(state: GameState, view: ViewState): void {
    const key = [state.cities, state.armies, view.visible, view.player];
    if (key.every((k, i) => k === this.seen.roads[i])) return;
    this.seen.roads = key;
    const ribbons = new Ribbons();
    for (const road of state.roads) {
      const owners = road.cities.map((id) => state.cities[id].owner);
      const cut = !!view.player && owners.every((o) => o === view.player) && roadCut(state, road, view.player);
      for (let i = 0; i < road.tiles.length; i++) {
        const tile = road.tiles[i];
        const city = state.cities[state.territory[tile]?.cityId ?? ""];
        const level = city?.buildings.roads ?? 0;
        if (level === 0) continue;
        const fogged = !!view.visible && !view.visible.has(tile);
        const style = ROAD_STYLES[level];
        const color = fogged ? style.fogged : style.color;
        const center = this.topology.tileCenter(tile);
        // Half way to the tiles before and after: each city draws only its own half of the road.
        for (const n of [road.tiles[i - 1], road.tiles[i + 1]]) {
          if (!n) continue;
          const other = this.topology.tileCenter(n);
          const mid = { x: (center.x + other.x) / 2, y: (center.y + other.y) / 2 };
          const h = Math.max(this.terrain.heightOf(tile), this.terrain.heightOf(n)) + 0.6;
          if (cut) ribbons.dashed(center, mid, h, style.width, fogged ? CUT_ROAD_FOGGED : CUT_ROAD);
          else ribbons.strip(center, mid, h, style.width, color);
        }
      }
    }
    this.replace("roads", ribbons.mesh());
  }

  /**
   * The player's open sea trade routes: a dashed lane over the water from
   * port to port. Like roads, they're always drawn; a route whose port is
   * lost or besieged disappears with it.
   */
  private syncSeaRoutes(state: GameState, view: ViewState): void {
    const key = [state.cities, view.player];
    if (key.every((k, i) => k === this.seen.seaRoutes[i])) return;
    this.seen.seaRoutes = key;
    this.traffic.sea = [];
    if (!view.player) return this.replace("seaRoutes", null);
    const ctx = { topology: this.topology };
    const color = getFaction(state, view.player)?.color ?? "#888888";
    const group = new THREE.Group();
    for (const city of Object.values(state.cities)) {
      if (city.owner !== view.player) continue;
      for (const route of tradeRoutes(state, city)) {
        // Each pair once, from the city with the lower id.
        if (route.by !== "sea" || route.partner < city.id) continue;
        const from = portTile(ctx, state, city);
        const to = portTile(ctx, state, state.cities[route.partner]);
        if (!from || !to) continue;
        const lane = this.lane(state, from, to);
        const sea = this.terrain.heightOf(lane[0]);
        // A smooth curve through the tiles' centres, so the lane doesn't zig-zag.
        const points = lane.map((t) => {
          const c = this.topology.tileCenter(t);
          return new THREE.Vector3(c.x, sea + SEA_LANE.lift, c.y);
        });
        if (points.length < 2 || points[0].distanceTo(points[points.length - 1]) < 1) continue;
        const curve: THREE.Curve<THREE.Vector3> =
          points.length > 2 ? new THREE.CatmullRomCurve3(points, false, "centripetal") : new THREE.LineCurve3(points[0], points[1]);
        group.add(softLane(curve, SEA_LANE.width, SEA_LANE.color, SEA_LANE.opacity));
        const length = curve.getLength();
        const ships = vehiclesFor(state, city, route);
        const start = hash(`${city.id}|${route.partner}`);
        for (let i = 0; i < ships; i++) {
          const ship = buildShip(color);
          ship.scale.setScalar(SHIP_SCALE);
          group.add(ship);
          this.traffic.sea.push({ curve, length, object: ship, phase: (start + i / ships) % 1, speed: SHIP_SPEED, margin: 0, sea, ground: [] });
        }
      }
    }
    this.replace("seaRoutes", group.children.length > 0 ? group : null);
    this.moveTraffic(this.lastTime);
  }

  /**
   * Carts on the player's open land trade routes, along the road from town to
   * town; more trade, more carts. A road cut by an enemy army carries none.
   */
  private syncLandTrade(state: GameState, view: ViewState): void {
    const key = [state.cities, state.armies, state.roads, view.player];
    if (key.every((k, i) => k === this.seen.landTrade[i])) return;
    this.seen.landTrade = key;
    this.traffic.land = [];
    if (!view.player) return this.replace("landTrade", null);
    const color = getFaction(state, view.player)?.color ?? "#888888";
    const group = new THREE.Group();
    for (const city of Object.values(state.cities)) {
      if (city.owner !== view.player) continue;
      for (const route of tradeRoutes(state, city)) {
        // Each pair once, from the city with the lower id; none on a cut road.
        if (route.by !== "land" || route.cut || route.partner < city.id) continue;
        const road = roadsOf(state, city.id).find((r) => r.cities.includes(route.partner));
        if (!road || road.tiles.length < 2) continue;
        const ground = road.tiles.map((t) => {
          const c = this.topology.tileCenter(t);
          return new THREE.Vector3(c.x, this.terrain.heightOf(t), c.y);
        });
        const curve: THREE.Curve<THREE.Vector3> =
          ground.length > 2 ? new THREE.CatmullRomCurve3(ground, false, "centripetal") : new THREE.LineCurve3(ground[0], ground[1]);
        const length = curve.getLength();
        const margin = Math.min(CART_TOWN_CLEARANCE, length * 0.3);
        const carts = vehiclesFor(state, city, route);
        const start = hash(`${city.id}|${route.partner}|land`);
        for (let i = 0; i < carts; i++) {
          const cart = buildCart(color);
          cart.scale.setScalar(CART_SCALE);
          group.add(cart);
          this.traffic.land.push({ curve, length, object: cart, phase: (start + i / carts) % 1, speed: CART_SPEED, margin, sea: null, ground });
        }
      }
    }
    this.replace("landTrade", group.children.length > 0 ? group : null);
    this.moveTraffic(this.lastTime);
  }

  /**
   * Moves every ship and cart along its route, out to the far end and back:
   * ships bob on the water, carts keep to the ground of the tile they're on.
   */
  private moveTraffic(time: number): void {
    for (const trip of [...this.traffic.sea, ...this.traffic.land]) {
      const run = trip.length - 2 * trip.margin;
      if (run <= 0) continue;
      const round = run * 2;
      let travelled = (time * trip.speed + trip.phase * round) % round;
      const homeward = travelled > run;
      if (homeward) travelled = round - travelled;
      const u = Math.min(1, Math.max(0, (trip.margin + travelled) / trip.length));
      const at = trip.curve.getPointAt(u);
      const heading = trip.curve.getTangentAt(u);
      const y = trip.sea !== null ? trip.sea + Math.sin(time * 2 + trip.phase * 10) * 0.25 : groundUnder(trip.ground, at.x, at.z);
      trip.object.position.set(at.x, y, at.z);
      trip.object.rotation.y = Math.atan2(-heading.z, heading.x) + (homeward ? Math.PI : 0);
    }
  }

  /** The shortest way over the water from one sea tile to another (both included), or just the two if there's none. */
  private lane(state: GameState, from: TileId, to: TileId): TileId[] {
    const key = from < to ? `${from}|${to}` : `${to}|${from}`;
    const known = this.lanes.get(key);
    if (known) return known[0] === from ? known : [...known].reverse();
    const cameFrom = new Map<TileId, TileId | null>([[from, null]]);
    let frontier = [from];
    while (frontier.length > 0 && !cameFrom.has(to)) {
      const next: TileId[] = [];
      for (const tile of frontier) {
        for (const n of this.topology.neighbors(tile)) {
          if (cameFrom.has(n) || state.tiles[n].terrain !== "water" || this.topology.distance(tile, n) !== 1) continue;
          cameFrom.set(n, tile);
          next.push(n);
        }
      }
      frontier = next;
    }
    let lane: TileId[] = [from, to];
    if (cameFrom.has(to)) {
      lane = [];
      for (let t: TileId | null = to; t !== null; t = cameFrom.get(t) ?? null) lane.unshift(t);
    }
    this.lanes.set(key, lane);
    return lane;
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
      // A city being fought over keeps its old look until the blow lands.
      if (this.battleBefore(city.tile, LUNGE_SECONDS) && this.cities.has(city.id)) continue;
      const color = getFaction(state, city.owner)?.color ?? "#888888";
      const besieger = city.besiegedBy ? getFaction(state, city.besiegedBy)?.color ?? null : null;
      // Whether the banner flies: a garrison is there. A city the player can't
      // see into keeps its banner up, so the fog doesn't give it away.
      const inSight = city.owner === view.activeFaction || !view.visible || view.visible.has(city.tile);
      const holding = Object.values(state.armies).find((a) => a.tile === city.tile && a.owner === city.owner);
      const garrisoned = inSight ? holding !== undefined : true;
      const garrison = inSight && holding ? { label: formatCompact(armySoldiers(holding)), regiments: holding.regiments.length } : null;
      const culture = getFaction(state, city.owner)?.culture ?? "roman";
      const key = `${color}|${culture}|${city.isCapital}|${besieger}|${city.buildings.government}|${city.buildings.walls}|${Math.floor(city.siegeWorks)}|${garrisoned}|${garrison?.label}|${garrison?.regiments}`;
      const existing = this.cities.get(city.id);
      if (existing?.key === key) continue;
      if (existing) this.scene.remove(existing.object);

      const group = new THREE.Group();
      group.add(
        buildCity(
          color,
          { capital: city.isCapital, level: city.buildings.government, walls: city.buildings.walls, culture, garrisoned, garrison, seed: hash(city.id) },
          this.library,
        ),
      );
      if (besieger) group.add(buildSiegeWorks(besieger, hash(city.id), Math.floor(city.siegeWorks)));
      group.position.copy(this.terrain.top(city.tile));
      group.scale.setScalar(CITY_SCALE);
      this.scene.add(group);
      this.cities.set(city.id, { key, object: group });
    }
  }

  /** A tower model on every watchtower's tile, in its owner's colours (it changes hands with its city). */
  /** Keeps trees and peaks out of the way of cities and watchtowers. */
  private syncClearings(state: GameState): void {
    const cities = new Set(Object.values(state.cities).map((c) => c.tile));
    const towers = Object.keys(state.watchtowers).map((tile) => {
      const top = this.terrain.top(tile);
      return {
        x: top.x + WATCHTOWER_SPOT.x * TOWER_SCALE,
        z: top.z + WATCHTOWER_SPOT.z * TOWER_SCALE,
        radius: WATCHTOWER_SPOT.radius * TOWER_SCALE,
      };
    });
    this.terrain.setClearings(cities, towers);
  }

  private syncWatchtowers(state: GameState): void {
    for (const tile of Object.keys(state.watchtowers)) {
      const key = getFaction(state, towerOwner(state, tile) ?? "")?.color ?? "#888888";
      const existing = this.towers.get(tile);
      if (existing?.key === key) continue;
      if (existing) this.scene.remove(existing.object);
      const object = buildWatchtower(key);
      const group = new THREE.Group();
      group.add(object);
      group.position.copy(this.terrain.top(tile));
      group.scale.setScalar(TOWER_SCALE);
      this.scene.add(group);
      this.towers.set(tile, { key, object: group });
    }
  }

  /**
   * A port model for every city with a port, at the shore of its port tile
   * (a little out from the land nearest the city), its pier running out
   * to sea. Sails in the owner's colour; one boat per level.
   */
  private syncPorts(state: GameState): void {
    const ctx = { topology: this.topology };
    for (const city of Object.values(state.cities)) {
      const level = city.buildings.port;
      const color = getFaction(state, city.owner)?.color ?? "#888888";
      const key = `${color}|${level}`;
      const existing = this.ports.get(city.id);
      if (existing?.key === key) continue;
      if (existing) {
        this.scene.remove(existing.object);
        this.ports.delete(city.id);
      }
      const sea = level > 0 ? portTile(ctx, state, city) : null;
      if (!sea) continue;
      // The land beside the port tile nearest the city: the pier starts on that shore.
      const shore = this.topology
        .neighbors(sea)
        .filter((n) => this.topology.distance(sea, n) === 1 && state.tiles[n].terrain !== "water")
        .sort((a, b) => this.topology.distance(city.tile, a) - this.topology.distance(city.tile, b) || (a < b ? -1 : 1))[0];
      const at = this.topology.tileCenter(sea);
      const land = shore ? this.topology.tileCenter(shore) : this.topology.tileCenter(city.tile);
      const group = new THREE.Group();
      group.add(buildPort(color, level));
      // A little out from the shore, so the pier stands clear of a city on it.
      const out = PORT_OFFSHORE;
      group.position.set(land.x + (at.x - land.x) * out, this.terrain.heightOf(sea), land.y + (at.y - land.y) * out);
      group.rotation.y = Math.atan2(-(at.y - land.y), at.x - land.x);
      group.scale.setScalar(PORT_SCALE);
      this.scene.add(group);
      this.ports.set(city.id, { key, object: group });
    }
  }

  /**
   * Name plates under each city, as HTML over the canvas. Their contents
   * (cityPlate.ts) are worked out again only when the game state changes.
   */
  private placeLabels(state: GameState, view: ViewState): void {
    const show = this.camera.zoom >= LABEL_MIN_ZOOM;
    const fresh = state !== this.platesFor || view.activeFaction !== this.platesFaction;
    this.platesFor = state;
    this.platesFaction = view.activeFaction;
    for (const city of Object.values(state.cities)) {
      let label = this.cityLabels.get(city.id);
      if (!label) {
        const el = document.createElement("div");
        el.className = "city-plate";
        this.labelLayer.append(el);
        label = { el, text: "" };
        this.cityLabels.set(city.id, label);
      }
      if (fresh || label.text === "") {
        const faction = getFaction(state, city.owner);
        const html = cityPlate(state, city, city.owner === view.activeFaction);
        const text = `${html}|${faction?.color}|${city.isCapital}`;
        if (text !== label.text) {
          label.text = text;
          label.el.innerHTML = html;
          label.el.style.setProperty("--faction", faction?.color ?? "#888");
          label.el.classList.toggle("capital", city.isCapital);
        }
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
    // Armies that appeared or changed tile this frame: their regiments' last spots say nothing about a transfer.
    const justPlaced = new Set<string>();
    // Cities under siege, by tile and besieger: an army next to one its faction besieges is attacking it.
    const sieges = Object.values(state.cities).filter((c) => c.besiegedBy !== null);

    for (const army of Object.values(state.armies)) {
      const mine = army.owner === view.activeFaction;
      if (view.visible && !mine && !view.visible.has(army.tile)) continue;
      shown.add(army.id);

      const look = {
        color: getFaction(state, army.owner)?.color ?? "#888888",
        label: formatCompact(armySoldiers(army)),
        regiments: army.regiments.length,
        faded: mine && isSpent(army),
        seed: hash(army.id),
        culture: getFaction(state, army.owner)?.culture ?? "roman",
      };
      const key = JSON.stringify(look);
      const target = this.standingPoint(army.tile, cityTiles);
      let entry = this.armies.get(army.id);

      if (!entry) {
        const figure = buildArmy(look, this.library);
        // A new army made of regiments we've seen elsewhere (split off from
        // another army) walks out from where they were.
        const from = this.regimentSpots.get(army.regiments[0]?.id ?? "");
        // One already besieging when first seen doesn't strike: it's not the siege's first blow.
        const besieging = this.besiegedBeside(army, sieges)?.id ?? null;
        entry = from && from.tile !== army.tile
          ? { key, figure, tile: from.tile, position: from.position.clone(), walk: null, besieging: null, facing: null }
          : { key, figure, tile: army.tile, position: target.clone(), walk: null, besieging, facing: null };
        this.armies.set(army.id, entry);
        justPlaced.add(army.id);
        this.scene.add(figure.object);
      } else if (entry.key !== key) {
        // Its look changed (strength, colour, spent): swap the model, keeping where it stands.
        this.scene.remove(entry.figure.object);
        entry.figure = buildArmy(look, this.library);
        entry.key = key;
        this.scene.add(entry.figure.object);
      }

      // An attacker walks up beside its battle and holds; it strikes first, then walks in (or flees).
      // An army standing on a battlefield stays put until the blow lands.
      const attacking = this.battles.find((b) => b.struck === null && b.attackers.has(army.id));
      const holding = this.battleBefore(entry.tile, LUNGE_SECONDS);
      if (entry.tile !== army.tile && entry.walk?.lungeFacing === undefined && !holding) {
        const to = attacking ? this.besideBattle(entry.tile, army.tile, attacking.tile) : army.tile;
        if (to !== entry.tile) {
          const at = to === army.tile ? target : this.standingPoint(to, cityTiles);
          entry.walk = this.walkBetween(entry.position, entry.tile, to, at, time, !mine);
          entry.tile = to;
          justPlaced.add(army.id);
        }
      }

      const object = entry.figure.object;
      object.scale.setScalar(ARMY_SCALE * (cityTiles.has(army.tile) && !entry.walk ? 0.8 : 1));
      if (entry.walk) {
        const lunging = entry.walk.lungeFacing;
        const done = this.stepWalk(entry, time);
        if (done) {
          // Arrived: face the camera again (before animate, which squares the banner to it).
          object.rotation.y = entry.walk.lungeFacing ?? 0;
          entry.walk = null;
        } else {
          animating = true;
        }
        const walking = !done && lunging === undefined;
        entry.figure.animate(walking ? Math.sin((time * WALK_SPEED + hash(army.id)) * Math.PI * 2) : 0, delta);
      } else {
        // Where a walk left it, until the walk to where it now stands begins.
        if (entry.tile === army.tile) entry.position.copy(target);
        const besieged = this.besiegedBeside(army, sieges);
        if (besieged) {
          // Face the city it's besieging.
          const city = this.terrain.top(besieged.tile);
          object.rotation.y = Math.atan2(city.x - entry.position.x, city.z - entry.position.z);
        } else {
          // Facing the camera, as after any march, once a blow has landed.
          object.rotation.y = entry.facing && time < entry.facing.until ? entry.facing.y : 0;
        }
        entry.figure.animate(0, delta, besieged !== undefined);
        // The first blow of a siege, once: the entry remembers it, as the figure is rebuilt whenever its look changes.
        const besieging = besieged?.id ?? null;
        if (besieging !== null && besieging !== entry.besieging) entry.figure.strike?.();
        entry.besieging = besieging;
      }
      object.position.copy(entry.position);
      // A garrison standing in its own city is shown by the city's banner, not a figure.
      const cityHere = Object.values(state.cities).find((c) => c.tile === army.tile);
      object.visible = !(cityHere?.owner === army.owner && !entry.walk);
    }

    this.strikeBattles(time);

    for (const [id, entry] of this.armies) {
      if (shown.has(id)) continue;
      // Destroyed in a battle still being played: it stands until the clash is over.
      if (this.battleBefore(entry.tile, CLASH_SECONDS) || this.battles.some((b) => b.attackers.has(id) && b.struck === null)) {
        if (entry.walk && this.stepWalk(entry, time)) entry.walk = null;
        entry.figure.object.position.copy(entry.position);
        animating = true;
        continue;
      }
      this.armies.delete(id);
      // Merged into another army on another tile: walk there first, then disappear.
      // (Its regiments are the ones last seen on its tile; only one army stands on a tile.)
      const oldIds = new Set([...this.regimentSpots].filter(([, spot]) => spot.tile === entry.tile).map(([rid]) => rid));
      const joined = Object.values(state.armies).find(
        (a) => a.id !== id && a.tile !== entry.tile && a.regiments.some((r) => oldIds.has(r.id)),
      );
      if (joined && (!view.visible || view.visible.has(joined.tile) || joined.owner === view.activeFaction)) {
        const target = this.standingPoint(joined.tile, cityTiles);
        const walk = this.walkBetween(entry.position, entry.tile, joined.tile, target, time, joined.owner !== view.activeFaction);
        entry.figure.object.visible = true; // A garrison's figure was hidden in its city.
        this.ghosts.push({ figure: entry.figure, position: entry.position.clone(), walk, id });
      } else {
        this.scene.remove(entry.figure.object);
      }
    }

    // Regiments that moved from one standing army to another: the armies stay
    // where they are, so a figure for the regiments walks across.
    for (const army of Object.values(state.armies)) {
      if (justPlaced.has(army.id) || !this.armies.has(army.id)) continue;
      const movedFrom = new Map<TileId, { soldiers: number; regiments: number; position: THREE.Vector3 }>();
      for (const r of army.regiments) {
        const spot = this.regimentSpots.get(r.id);
        if (!spot || spot.tile === army.tile) continue;
        const group = movedFrom.get(spot.tile) ?? { soldiers: 0, regiments: 0, position: spot.position };
        group.soldiers += r.soldiers;
        group.regiments++;
        movedFrom.set(spot.tile, group);
      }
      const mine = army.owner === view.activeFaction;
      for (const [fromTile, group] of movedFrom) {
        // If nothing's left behind the old army has gone, and the loop above already walks its figure across.
        const leftBehind = Object.values(state.armies).some((a) => a.tile === fromTile && a.owner === army.owner);
        if (!leftBehind || (!mine && view.visible && !view.visible.has(army.tile))) continue;
        const id = `${army.id}:${fromTile}`;
        const faction = getFaction(state, army.owner);
        const figure = buildArmy({
          color: faction?.color ?? "#888888",
          label: formatCompact(group.soldiers),
          regiments: group.regiments,
          faded: false,
          seed: hash(id),
          culture: faction?.culture ?? "roman",
        }, this.library);
        figure.object.scale.setScalar(ARMY_SCALE);
        this.scene.add(figure.object);
        const walk = this.walkBetween(group.position, fromTile, army.tile, this.standingPoint(army.tile, cityTiles), time, !mine);
        this.ghosts.push({ figure, position: group.position.clone(), walk, id });
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

  /** The city this army's faction is besieging from beside it, if any. */
  private besiegedBeside(army: Army, sieges: readonly City[]): City | undefined {
    return sieges.find((c) => c.besiegedBy === army.owner && this.topology.neighbors(army.tile).includes(c.tile));
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
  /** A walk along the land route between two tiles; at the faster pace for another faction's army. */
  private walkBetween(from: THREE.Vector3, fromTile: TileId, toTile: TileId, to: THREE.Vector3, time: number, fast: boolean): Walk {
    const route = this.landRoute(fromTile, toTile);
    const points = [from.clone(), ...route.slice(1, -1).map((t) => this.terrain.top(t)), to.clone()];
    const steps = Math.max(1, route.length - 1);
    const duration = fast
      ? Math.min(ENEMY_MAX_WALK_SECONDS, steps * ENEMY_SECONDS_PER_TILE)
      : Math.min(MAX_WALK_SECONDS, steps * SECONDS_PER_TILE);
    return { points, start: time, duration };
  }

  /** Seconds until every walk, lunge and clash on the map has finished, as of the last frame drawn. */
  animationLeft(): number {
    let left = 0;
    for (const walk of [...[...this.armies.values(), ...this.scouts.values()].map((e) => e.walk), ...this.ghosts.map((g) => g.walk)]) {
      if (walk) left = Math.max(left, walk.start + walk.duration - this.lastTime);
    }
    for (const battle of this.battles) if (battle.struck === null && battle.released !== null) left = Math.max(left, LUNGE_SECONDS + CLASH_SECONDS);
    for (const clash of this.clashes) left = Math.max(left, clash.start + CLASH_SECONDS - this.lastTime);
    return left;
  }

  /**
   * Plays a battle on a tile: the attacking armies walk up beside it, strike,
   * and the clash plays in the attacker's colour; only then do the armies on
   * the tile fall or flee and the winner walk in. A held battle waits for
   * releaseBattles before striking.
   */
  battle(tile: TileId, color: string, attackers: readonly string[], held = false): void {
    this.battles.push({ tile, color, attackers: new Set(attackers), released: held ? null : this.lastTime, struck: null });
  }

  /** Lets every held battle strike. */
  releaseBattles(): void {
    for (const battle of this.battles) battle.released ??= this.lastTime;
  }

  /** Whether a battle on this tile hasn't yet struck, or struck less than `after` seconds ago. */
  private battleBefore(tile: TileId, after: number): boolean {
    return this.battles.some((b) => b.tile === tile && (b.struck === null || this.lastTime < b.struck + after));
  }

  /**
   * Where an attacker stops on its way: a tile beside the battle. Its new
   * tile if that's beside it, else the last tile of the land route before it.
   */
  private besideBattle(from: TileId, to: TileId, battle: TileId): TileId {
    if (this.topology.distance(from, battle) === 1) return from;
    if (this.topology.distance(to, battle) === 1) return to;
    const route = this.landRoute(from, battle);
    return route.length >= 2 ? route[route.length - 2] : from;
  }

  /**
   * Strikes each released battle once its attackers have arrived: those
   * beside it lunge and the clash plays. Drops battles whose clash is over.
   */
  private strikeBattles(time: number): void {
    for (let i = this.battles.length - 1; i >= 0; i--) {
      const battle = this.battles[i];
      if (battle.struck !== null) {
        if (time >= battle.struck + CLASH_SECONDS) this.battles.splice(i, 1);
        continue;
      }
      if (battle.released === null) continue;
      const attackers = [...battle.attackers].map((id) => this.armies.get(id)).filter((e) => e !== undefined);
      const arrived = attackers.every((e) => !e.walk || e.walk.lungeFacing !== undefined);
      if (!arrived && time < battle.released + MAX_BATTLE_WAIT) continue;
      for (const entry of attackers) {
        if (entry.walk || this.topology.distance(entry.tile, battle.tile) !== 1) continue;
        const reach = entry.position.clone().lerp(this.terrain.top(battle.tile), LUNGE_REACH);
        const facing = Math.atan2(reach.x - entry.position.x, reach.z - entry.position.z);
        entry.walk = { points: [entry.position.clone(), reach, entry.position.clone()], start: time, duration: LUNGE_SECONDS, lungeFacing: facing };
        entry.facing = { y: facing, until: time + (entry.figure.strike?.() ?? 0) };
      }
      this.clash(battle.tile, battle.color);
      battle.struck = time;
    }
  }

  /** Plays a battle's clash on a tile, in the attacker's colour. */
  private clash(tile: TileId, color: string): void {
    const burst = clashBurst(color);
    burst.object.position.copy(this.terrain.top(tile));
    burst.object.scale.setScalar(CITY_SCALE);
    burst.update(0);
    this.scene.add(burst.object);
    this.clashes.push({ ...burst, start: this.lastTime });
  }

  /** A figure for every scout in sight, walking to where it now stands. */
  private syncScouts(state: GameState, view: ViewState, time: number, delta: number): void {
    const shown = new Set<string>();
    for (const scout of Object.values(state.scouts)) {
      const mine = scout.owner === view.activeFaction;
      if (view.visible && !mine && !view.visible.has(scout.tile)) continue;
      shown.add(scout.id);
      const faction = getFaction(state, scout.owner);
      const target = this.terrain.top(scout.tile).add(new THREE.Vector3(-20, 0, 14));
      let entry = this.scouts.get(scout.id);
      if (!entry) {
        const figure = buildScout(faction?.color ?? "#888888", faction?.culture ?? "roman", this.library);
        figure.object.scale.setScalar(SCOUT_SCALE);
        entry = { key: scout.id, figure, tile: scout.tile, position: target.clone(), walk: null };
        this.scouts.set(scout.id, entry);
        this.scene.add(figure.object);
      }
      if (entry.tile !== scout.tile) {
        entry.walk = this.walkBetween(entry.position, entry.tile, scout.tile, target, time, !mine);
        entry.tile = scout.tile;
      }
      if (entry.walk) {
        const done = this.stepWalk(entry, time);
        if (done) {
          entry.walk = null;
          entry.figure.object.rotation.y = 0;
        }
        entry.figure.animate(done ? 0 : Math.sin((time * WALK_SPEED + hash(scout.id)) * Math.PI * 2), delta);
      } else {
        entry.position.copy(target);
        entry.figure.animate(0, delta);
      }
      entry.figure.object.position.copy(entry.position);
    }
    for (const [id, entry] of this.scouts) {
      if (shown.has(id)) continue;
      this.scene.remove(entry.figure.object);
      this.scouts.delete(id);
    }
  }

  /** Moves the clashes along and removes finished ones. */
  private syncClashes(time: number): void {
    for (let i = this.clashes.length - 1; i >= 0; i--) {
      const clash = this.clashes[i];
      const progress = (time - clash.start) / CLASH_SECONDS;
      clash.update(progress);
      if (progress >= 1) {
        this.scene.remove(clash.object);
        this.clashes.splice(i, 1);
      }
    }
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
    if (walk.lungeFacing !== undefined) entry.figure.object.rotation.y = walk.lungeFacing;
    else if (dx !== 0 || dz !== 0) entry.figure.object.rotation.y = Math.atan2(dx, dz);
    return progress >= 1;
  }
}

/** The colours of a march route's legs, one per turn. */
/** How each level of roads looks (index = level): a dirt track, a gravel road, a pale paved road. */
const ROAD_STYLES = [
  { color: "#000000", fogged: "#000000", width: 0 },
  { color: "#9c7b52", fogged: "#5e4c38", width: 2.2 },
  { color: "#b7a585", fogged: "#6d6352", width: 2.8 },
  { color: "#e3dccb", fogged: "#86827a", width: 3.4 },
];

/** A cut road: dashed, in red, so it doesn't read as a sea crossing. */
const CUT_ROAD = "#c4473a";
const CUT_ROAD_FOGGED = "#6e3a33";

const ROUTE_COLORS = ["#e0b54f", "#e8864a", "#d9534f", "#b565c9", "#5b8fd9", "#4fb88a"];

/** Flat coloured strips laid on the terrain, collected into one mesh. */
/** A ship or cart on a trade route, going out and back along its curve. */
interface Trip {
  curve: THREE.Curve<THREE.Vector3>;
  length: number;
  object: THREE.Object3D;
  /** Where on its round trip it is at time 0 (0-1). */
  phase: number;
  speed: number;
  /** How far short of each end it turns round (carts stop outside the towns). */
  margin: number;
  /** The water's height for a ship; null for a cart, which follows `ground`. */
  sea: number | null;
  /** A cart's road: each tile's centre at its ground height. */
  ground: THREE.Vector3[];
}

/** How many ships or carts a route carries: one per TRAFFIC.goldPerVehicle it pays both ends, from one up to the most. */
function vehiclesFor(state: GameState, city: City, route: TradeRoute): number {
  const back = tradeRoutes(state, state.cities[route.partner]).find((r) => r.partner === city.id && r.by === route.by);
  const gold = route.gold + (back?.gold ?? 0);
  return Math.max(1, Math.min(TRAFFIC.most, Math.round(gold / TRAFFIC.goldPerVehicle)));
}

/** The ground height under (x, z) on a road: the nearest road tile's, just above the road. */
function groundUnder(ground: readonly THREE.Vector3[], x: number, z: number): number {
  let best = ground[0];
  let bestDistance = Infinity;
  for (const p of ground) {
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = p;
    }
  }
  return best.y + 0.6;
}

/** A soft lane along a curve: a thin, faint ribbon just above the water. */
function softLane(curve: THREE.Curve<THREE.Vector3>, width: number, color: string, opacity: number): THREE.Mesh {
  const steps = Math.max(2, Math.ceil(curve.getLength() / 4));
  const positions: number[] = [];
  let previous: [THREE.Vector3, THREE.Vector3] | null = null;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const side = new THREE.Vector3(-t.z, 0, t.x).normalize().multiplyScalar(width / 2);
    const pair: [THREE.Vector3, THREE.Vector3] = [p.clone().add(side), p.clone().sub(side)];
    if (previous) {
      const [a, b] = previous;
      const [c, d] = pair;
      positions.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
    }
    previous = pair;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }),
  );
  mesh.renderOrder = 2;
  return mesh;
}

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

  /** A solid strip from one point to another, with round ends so joined strips meet cleanly. */
  strip(from: Point, to: Point, height: number, width: number, color: string): void {
    const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const nx = (-(to.y - from.y) / length) * (width / 2);
    const ny = ((to.x - from.x) / length) * (width / 2);
    this.quad({ x: from.x + nx, y: from.y + ny }, { x: to.x + nx, y: to.y + ny }, { x: to.x - nx, y: to.y - ny }, { x: from.x - nx, y: from.y - ny }, height, color);
    this.dot(from, height, width / 2, color);
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
