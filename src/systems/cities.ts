import type { GameContext } from "@/core/context.js";
import {
  addLog,
  citiesOf,
  getFaction,
  updateFaction,
  type City,
  type CityId,
  type FactionId,
  type GameState,
  type Road,
} from "@/core/state.js";
import { BUILDING_EFFECTS, LEVEL_POPULATION_LIMIT } from "@/data/buildings.js";
import { ECONOMY, TAX_RATES } from "@/data/economy.js";
import { GAME_SETUP } from "@/data/gameSetup.js";
import { TRADE } from "@/data/trade.js";
import { maxSupplies } from "@/systems/siege.js";
import { TERRAIN } from "@/data/terrain.js";
import { cheapestPath } from "@/systems/pathfinding.js";
import type { MapTopology, TileId } from "@/map/topology.js";

// ---- Creation -----------------------------------------------------------

/** Creates a city and claims its territory. Used by game setup. */
export function createCity(
  ctx: GameContext,
  state: GameState,
  owner: FactionId,
  tile: TileId,
  isCapital: boolean,
  name: string,
): GameState {
  const id: CityId = `city${state.nextCityNumber}`;
  const city: City = {
    id,
    name,
    owner,
    tile,
    population: isCapital ? GAME_SETUP.capitalPopulation : GAME_SETUP.cityPopulation,
    foundedTurn: state.turn,
    isCapital,
    supplies: maxSupplies({ isCapital, buildings: { government: isCapital ? 2 : 1 } }),
    besiegedBy: null,
    besiegedSince: null,
    siegeWorks: 0,
    recruitQueue: [],
    taxRate: "normal",
    // Every city has a council hall; a capital starts with a forum (level 2). None can train more than militia yet.
    buildings: {
      government: isCapital ? 2 : 1,
      spearYard: 0,
      archeryRange: 0,
      stables: 0,
      walls: 0,
      farms: 0,
      market: 0,
      mine: 0,
      port: 0,
      roads: 0,
    },
    constructionQueue: [],
    unsettled: false,
    fishingGrounds: tilesWithin(ctx.topology, tile, GAME_SETUP.territoryRadius).filter(
      (t) => state.tiles[t].terrain === "water",
    ).length,
    // Worked out by measureCoasts and mapTradeRoutes once every city has claimed its land.
    coast: 0,
    landNeighbours: [],
    cutRoads: [],
    seaDistances: {},
  };
  const next: GameState = {
    ...state,
    cities: { ...state.cities, [id]: city },
    nextCityNumber: state.nextCityNumber + 1,
    territory: { ...state.territory, [tile]: { owner, cityId: id } },
  };
  return next;
}

// ---- Territory ----------------------------------------------------------

/**
 * Gives every passable tile within the territory radius of a city to the
 * nearest city, counting steps; on a tie, the city founded first. Runs once,
 * after every city is placed, so where two cities' reach overlaps they split
 * the land between them rather than the first one taking it all. Territory
 * never changes after that.
 */
export function claimTerritory(ctx: GameContext, state: GameState): GameState {
  const nearest = new Map<TileId, { cityId: CityId; steps: number }>();
  for (const city of Object.values(state.cities)) {
    for (const [tile, steps] of stepsWithin(ctx.topology, city.tile, GAME_SETUP.territoryRadius)) {
      if (!TERRAIN[state.tiles[tile].terrain].passable) continue;
      const best = nearest.get(tile);
      if (!best || steps < best.steps) nearest.set(tile, { cityId: city.id, steps });
    }
  }
  const territory = { ...state.territory };
  for (const [tile, { cityId }] of nearest) territory[tile] = { owner: state.cities[cityId].owner, cityId };
  return { ...state, territory };
}

/**
 * Draws each city's region for the map: its claimed land, plus every
 * unclaimed land tile, given to the nearest claimed land by steps over land
 * (ties go the same way every game). Only the map uses it, so filling the
 * gaps between territories changes how the map looks and nothing else.
 * Land no claimed tile can walk to (an island with no city) stays empty.
 */
export function drawRegions(ctx: GameContext, state: GameState): GameState {
  const regions: Record<TileId, CityId> = {};
  for (const [tile, claim] of Object.entries(state.territory)) regions[tile] = claim.cityId;
  let frontier = Object.keys(regions);
  while (frontier.length > 0) {
    const next: TileId[] = [];
    for (const tile of frontier) {
      for (const n of ctx.topology.neighbors(tile)) {
        if (n in regions || ctx.topology.distance(tile, n) !== 1) continue;
        if (!TERRAIN[state.tiles[n].terrain].passable) continue;
        regions[n] = regions[tile];
        next.push(n);
      }
    }
    frontier = next;
  }
  return { ...state, regions };
}

/** The faction whose region a tile is drawn in on the map, if any. */
export function regionOwner(state: GameState, tile: TileId): FactionId | undefined {
  const cityId = state.regions[tile];
  return cityId ? state.cities[cityId]?.owner : undefined;
}

/**
 * Tiles within `radius` steps of `start`, each with its number of steps.
 * Steps are to adjacent tiles only: a sea crossing is for armies, and doesn't
 * bring the land across it within a city's reach.
 */
function stepsWithin(topology: MapTopology, start: TileId, radius: number): Map<TileId, number> {
  const steps = new Map<TileId, number>([[start, 0]]);
  let frontier: TileId[] = [start];
  for (let step = 1; step <= radius; step++) {
    const next: TileId[] = [];
    for (const tile of frontier) {
      for (const n of topology.neighbors(tile)) {
        if (!steps.has(n) && topology.distance(tile, n) === 1) {
          steps.set(n, step);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return steps;
}

/**
 * All tiles within `radius` steps, found by walking to adjacent tiles, so it
 * works on any map topology. Sea crossings don't count as a step.
 */
export function tilesWithin(topology: MapTopology, start: TileId, radius: number): TileId[] {
  return [...stepsWithin(topology, start, radius).keys()];
}

/** How many hills and mountain tiles a city's territory has for a mine to dig. */
export function mineableTiles(state: GameState, cityId: CityId): number {
  return cityTiles(state, cityId).filter((t) => TERRAIN[state.tiles[t].terrain].mineable).length;
}

/** Plains tiles in a city's territory: the farmland its farms earn gold from. */
export function plainsTiles(state: GameState, cityId: CityId): number {
  return cityTiles(state, cityId).filter((t) => state.tiles[t].terrain === "plains").length;
}

/**
 * Each city's tiles, remembered for as long as the territory object lasts:
 * city stats are read on every AI action, and scanning the whole map each
 * time was most of an AI turn's cost. State never changes in place, so a new
 * territory object is all it takes to start afresh.
 */
const tilesByCity = new WeakMap<GameState["territory"], Map<CityId, TileId[]>>();

/** Tiles claimed by a city. Don't modify the list: it's shared. */
export function cityTiles(state: GameState, cityId: CityId): readonly TileId[] {
  let cities = tilesByCity.get(state.territory);
  if (!cities) {
    cities = new Map();
    for (const [tile, claim] of Object.entries(state.territory)) {
      const list = cities.get(claim.cityId);
      if (list) list.push(tile);
      else cities.set(claim.cityId, [tile]);
    }
    tilesByCity.set(state.territory, cities);
  }
  return cities.get(cityId) ?? [];
}

// ---- Population and gold ------------------------------------------------

export interface CityStats {
  /**
   * Most people the city can hold: what its land (and fishing grounds)
   * support, capped by its level's limit until its government is raised.
   */
  capacity: number;
  /** What its land alone could support. */
  landCapacity: number;
  /** Whether its level's limit, rather than its land, is what holds it back. */
  limitedByLevel: boolean;
  /** Growth per turn when the city is small, e.g. 0.025 = 2.5%. Average of its terrain, × ECONOMY.growthMultiplier. */
  baseGrowthRate: number;
  /** The base rate after the city's tax rate. */
  growthRate: number;
  /** People gained (or lost, if over capacity) next turn. */
  growth: number;
  /** Gold added to the owner's treasury each turn (before any siege stops it). */
  gold: number;
  /** How that gold is made up. */
  income: IncomeBreakdown;
}

/** Where a city's gold comes from, step by step. */
export interface IncomeBreakdown {
  /** The flat amount every city pays. */
  base: number;
  /** From its people: so much per 1,000. */
  people: number;
  /** From its mine, for each hills or mountain tile it digs. */
  mine: number;
  /** From its farms, for each plains tile it farms. */
  farms: number;
  /** base + people + mine + farms. */
  subtotal: number;
  /** From its trade routes, by land and sea. */
  trade: number;
  /** The tax rate's multiplier, e.g. 1.5 on high taxes. */
  taxes: number;
  /** The market's multiplier on the subtotal, e.g. 1.15 with a market square. */
  market: number;
  /** The market's multiplier on trade, e.g. 1.5 with a market square. */
  tradeMarket: number;
  /** (subtotal × market + trade × tradeMarket) × taxes, rounded. */
  total: number;
}

export function cityStats(state: GameState, city: City): CityStats {
  const tiles = cityTiles(state, city.id);
  // The sea within reach feeds the city like land does.
  let capacity = city.fishingGrounds * TERRAIN.water.capacity;
  let growthSum = city.fishingGrounds * TERRAIN.water.growth;
  let mineable = 0;
  let plains = 0;
  for (const tile of tiles) {
    const terrain = TERRAIN[state.tiles[tile].terrain];
    capacity += terrain.capacity;
    growthSum += terrain.growth;
    if (terrain.mineable) mineable++;
    if (state.tiles[tile].terrain === "plains") plains++;
  }
  const places = tiles.length + city.fishingGrounds;
  const baseGrowthRate = places > 0 ? (growthSum / places) * ECONOMY.growthMultiplier : 0;
  const tax = TAX_RATES[city.taxRate];
  const farms = BUILDING_EFFECTS.farmsGrowth[city.buildings.farms];
  const port = BUILDING_EFFECTS.portGrowth[city.buildings.port] * seaShare(state, city);
  const growthRate = baseGrowthRate * tax.growth * (1 + farms + port);
  const levelLimit = LEVEL_POPULATION_LIMIT[city.buildings.government];
  const fedCapacity = Math.min(capacity, levelLimit);
  const base = ECONOMY.cityBaseGold;
  const people = Math.round((city.population / 1000) * ECONOMY.goldPer1000People);
  const mine = mineable * BUILDING_EFFECTS.mineGoldPerTile[city.buildings.mine];
  const farmGold = Math.round(plains * BUILDING_EFFECTS.farmsGoldPerPlainsTile[city.buildings.farms]);
  const subtotal = base + people + mine + farmGold;
  const trade = Math.round(tradeRoutes(state, city).reduce((sum, r) => sum + r.gold, 0));
  const market = 1 + BUILDING_EFFECTS.marketGold[city.buildings.market];
  const tradeMarket = 1 + TRADE.marketTrade[city.buildings.market];
  const total = Math.round((subtotal * market + trade * tradeMarket) * tax.gold);

  return {
    capacity: fedCapacity,
    landCapacity: capacity,
    limitedByLevel: levelLimit < capacity,
    baseGrowthRate,
    growthRate,
    growth: populationGrowth(city.population, fedCapacity, growthRate),
    gold: total,
    income: { base, people, mine, farms: farmGold, subtotal, trade, taxes: tax.gold, market, tradeMarket, total },
  };
}

/**
 * Counts each city's coast: the sea within its reach (its fishing grounds)
 * plus any sea touching its land further out. A city can build a port if it
 * has any. Territory never changes, so this runs once, after every city has
 * claimed its land.
 */
export function measureCoasts(ctx: GameContext, state: GameState): GameState {
  const cities = { ...state.cities };
  for (const city of Object.values(state.cities)) cities[city.id] = { ...city, coast: coastTiles(ctx, state, city).size };
  return { ...state, cities };
}

/** The sea a city can build a port on: within its reach, or touching any of its land. */
function coastTiles(ctx: GameContext, state: GameState, city: City): Set<TileId> {
  const sea = new Set(
    tilesWithin(ctx.topology, city.tile, GAME_SETUP.territoryRadius).filter((t) => state.tiles[t].terrain === "water"),
  );
  for (const tile of cityTiles(state, city.id)) {
    for (const n of ctx.topology.neighbors(tile)) if (state.tiles[n].terrain === "water") sea.add(n);
  }
  return sea;
}

/**
 * Where a city's port stands on the map: the sea tile of its coast nearest
 * the city (ties go the same way every game), or null for a city with no
 * coast. Only the map uses it.
 */
export function portTile(ctx: GameContext, state: GameState, city: City): TileId | null {
  let best: TileId | null = null;
  let bestDistance = Infinity;
  for (const tile of coastTiles(ctx, state, city)) {
    const d = ctx.topology.distance(city.tile, tile);
    if (d < bestDistance || (d === bestDistance && best !== null && tile < best)) {
      best = tile;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * Lays out where roads and trade can run, whoever owns the cities: a road
 * between every pair of cities with claimed land next to each other (the
 * cheapest path between them through their own land), and, for coastal
 * cities, the steps over the sea to every other coastal city. Territory
 * never changes, so this runs once, after every city has claimed its land.
 * Who owns a city and what it has built decide which routes are open
 * (`tradeRoutes`).
 */
export function mapTradeRoutes(ctx: GameContext, state: GameState): GameState {
  const bordering = new Map<CityId, Set<CityId>>();
  for (const [tile, claim] of Object.entries(state.territory)) {
    for (const n of ctx.topology.neighbors(tile)) {
      const other = state.territory[n];
      if (!other || other.cityId === claim.cityId || ctx.topology.distance(tile, n) !== 1) continue;
      if (!bordering.has(claim.cityId)) bordering.set(claim.cityId, new Set());
      bordering.get(claim.cityId)!.add(other.cityId);
    }
  }

  const roads: Road[] = [];
  const neighbours = new Map<CityId, CityId[]>();
  const byFounding = Object.values(state.cities).sort((a, b) => a.foundedTurn - b.foundedTurn || cityNumber(a.id) - cityNumber(b.id));
  for (const a of byFounding) {
    for (const bId of [...(bordering.get(a.id) ?? [])].sort((x, y) => cityNumber(x) - cityNumber(y))) {
      const b = state.cities[bId];
      if (cityNumber(b.id) < cityNumber(a.id)) continue; // each pair once
      const tiles = cheapestPath(ctx, state, a.tile, b.tile, (t) => {
        const claim = state.territory[t];
        return !!claim && (claim.cityId === a.id || claim.cityId === b.id) && TERRAIN[state.tiles[t].terrain].passable;
      });
      if (!tiles) continue;
      const watch = new Set(tiles);
      for (const t of tiles) for (const n of ctx.topology.neighbors(t)) watch.add(n);
      roads.push({ cities: [a.id, b.id], tiles, watch: [...watch] });
      neighbours.set(a.id, [...(neighbours.get(a.id) ?? []), b.id]);
      neighbours.set(b.id, [...(neighbours.get(b.id) ?? []), a.id]);
    }
  }

  // Which coastal city each coast tile serves (a tile can serve several).
  const coasts = new Map<CityId, Set<TileId>>();
  const servedBy = new Map<TileId, CityId[]>();
  for (const city of Object.values(state.cities)) {
    const tiles = coastTiles(ctx, state, city);
    if (tiles.size === 0) continue;
    coasts.set(city.id, tiles);
    for (const t of tiles) servedBy.set(t, [...(servedBy.get(t) ?? []), city.id]);
  }

  const cities = { ...state.cities };
  for (const city of Object.values(state.cities)) {
    const seaDistances: Record<CityId, number> = {};
    const start = coasts.get(city.id);
    if (start) {
      // Breadth-first over the sea from the city's whole coast.
      const steps = new Map<TileId, number>();
      let frontier = [...start];
      for (const t of frontier) steps.set(t, 0);
      for (let step = 0; frontier.length > 0; step++) {
        const next: TileId[] = [];
        for (const tile of frontier) {
          for (const other of servedBy.get(tile) ?? []) {
            if (other !== city.id && !(other in seaDistances)) seaDistances[other] = step;
          }
          for (const n of ctx.topology.neighbors(tile)) {
            if (steps.has(n) || state.tiles[n].terrain !== "water" || ctx.topology.distance(tile, n) !== 1) continue;
            steps.set(n, step + 1);
            next.push(n);
          }
        }
        frontier = next;
      }
    }
    cities[city.id] = { ...city, landNeighbours: [...(neighbours.get(city.id) ?? [])].sort(), seaDistances };
  }
  return { ...state, cities, roads };
}

/** The number in a city id ("city12" → 12), for a fixed order. */
function cityNumber(id: CityId): number {
  return Number(id.replace(/\D/g, "")) || 0;
}

/** One trade route, seen from one end. */
export interface TradeRoute {
  partner: CityId;
  by: "land" | "sea";
  /** The lower of the two cities' road (land) or port (sea) levels. */
  level: number;
  /** An enemy army stands on the road or next to it: it pays nothing until the road is clear. */
  cut: boolean;
  /** Gold it pays this end each turn, before taxes and the market (0 while cut). */
  gold: number;
}

const roadsByCity = new WeakMap<GameState["roads"], Map<CityId, Road[]>>();

/** The roads that end at a city. Don't modify the list: it's shared. */
export function roadsOf(state: GameState, cityId: CityId): readonly Road[] {
  let byCity = roadsByCity.get(state.roads);
  if (!byCity) {
    byCity = new Map();
    for (const road of state.roads) for (const id of road.cities) byCity.set(id, [...(byCity.get(id) ?? []), road]);
    roadsByCity.set(state.roads, byCity);
  }
  return byCity.get(cityId) ?? [];
}

const armyOwnersByTile = new WeakMap<GameState["armies"], Map<TileId, FactionId[]>>();

/** Whether an army of anyone but `owner` stands on or next to a road, cutting it. Scouts don't count. */
export function roadCut(state: GameState, road: Road, owner: FactionId): boolean {
  let byTile = armyOwnersByTile.get(state.armies);
  if (!byTile) {
    byTile = new Map();
    for (const army of Object.values(state.armies)) byTile.set(army.tile, [...(byTile.get(army.tile) ?? []), army.owner]);
    armyOwnersByTile.set(state.armies, byTile);
  }
  return road.watch.some((t) => byTile!.get(t)?.some((o) => o !== owner));
}

/**
 * A city's trade routes: by road to each city of the same owner it's joined
 * to, if both have roads, and to each port of the same owner within sailing
 * range, if both have ports. A siege at either end shuts a route; an enemy
 * army on a road or next to it cuts it (it's listed, paying nothing). Cities
 * joined by a road (their land borders) trade only by land, whether or not
 * they've built roads: the sea is for cities the roads don't join.
 */
export function tradeRoutes(state: GameState, city: City): TradeRoute[] {
  if (city.besiegedBy) return [];
  const routes: TradeRoute[] = [];
  const open = (id: CityId): City | null => {
    const other = state.cities[id];
    return other && other.owner === city.owner && !other.besiegedBy ? other : null;
  };
  if (city.buildings.roads > 0) {
    for (const road of roadsOf(state, city.id)) {
      const id = road.cities[0] === city.id ? road.cities[1] : road.cities[0];
      const other = open(id);
      const level = other ? Math.min(city.buildings.roads, other.buildings.roads) : 0;
      if (!other || level === 0) continue;
      const cut = roadCut(state, road, city.owner);
      routes.push({ partner: id, by: "land", level, cut, gold: cut ? 0 : (other.population / 1000) * TRADE.roadGoldPer1000[level] });
    }
  }
  if (city.buildings.port > 0) {
    for (const [id, steps] of Object.entries(city.seaDistances)) {
      if (city.landNeighbours.includes(id)) continue;
      const other = open(id);
      const level = other ? Math.min(city.buildings.port, other.buildings.port) : 0;
      if (other && level > 0 && steps <= TRADE.seaRange[level]) {
        routes.push({ partner: id, by: "sea", level, cut: false, gold: (other.population / 1000) * TRADE.seaGoldPer1000[level] });
      }
    }
  }
  return routes;
}

/**
 * The share of a city's reach that is sea: its coast against its coast and
 * land together. A port's growth bonus is scaled by it, so a city with a
 * sliver of coast gets a sliver of the bonus.
 */
export function seaShare(state: GameState, city: City): number {
  const places = city.coast + cityTiles(state, city.id).length;
  return places > 0 ? city.coast / places : 0;
}

/**
 * Carrying-capacity growth: close to the full rate while the city is small,
 * slowing to zero as it nears capacity (late, by ECONOMY.growthCurve), and
 * negative if it's over capacity. A small city grows as if it had
 * ECONOMY.growthFloorPopulation people, but never past its capacity.
 */
export function populationGrowth(population: number, capacity: number, rate: number): number {
  if (capacity <= 0) return -population;
  // Over capacity (enslaved people moved in), it shrinks back as it always did.
  if (population >= capacity) return Math.round(rate * population * (1 - population / capacity));
  const growing = Math.max(population, ECONOMY.growthFloorPopulation);
  const room = 1 - (population / capacity) ** ECONOMY.growthCurve;
  return Math.min(capacity - population, Math.round(rate * growing * room));
}

/** Total gold a faction gains per turn. Besieged cities pay nothing. */
export function factionIncome(state: GameState, factionId: FactionId): number {
  return citiesOf(state, factionId)
    .filter((city) => !city.besiegedBy)
    .reduce((sum, city) => sum + cityStats(state, city).gold, 0);
}

/** Total population across a faction's cities. */
export function factionPopulation(state: GameState, factionId: FactionId): number {
  return citiesOf(state, factionId).reduce((sum, city) => sum + city.population, 0);
}

/**
 * End-of-turn economy for one faction: every city adds its gold to the
 * treasury, then its population grows toward capacity. A besieged city is
 * cut off: no gold, no growth.
 */
export function processCities(_ctx: GameContext, state: GameState, factionId: FactionId): GameState {
  let cities = state.cities;
  let income = 0;

  for (const city of citiesOf(state, factionId)) {
    if (city.besiegedBy) continue;
    const stats = cityStats(state, city);
    income += stats.gold;
    cities = { ...cities, [city.id]: { ...city, population: Math.max(1, city.population + stats.growth) } };
  }

  return reportCutRoads(updateFaction({ ...state, cities }, factionId, (f) => ({ ...f, gold: f.gold + income })), factionId);
}

/**
 * Tells a faction when an enemy army cuts one of its trading roads, and when
 * it's clear again: once each, not every turn. Each city remembers which of
 * its roads were cut (`City.cutRoads`); a pair is reported once.
 */
function reportCutRoads(state: GameState, factionId: FactionId): GameState {
  let next = state;
  for (const city of citiesOf(state, factionId)) {
    const routes = tradeRoutes(state, city).filter((r) => r.by === "land");
    const cut = routes.filter((r) => r.cut).map((r) => r.partner);
    for (const id of cut) {
      if (!city.cutRoads.includes(id) && cityNumber(city.id) < cityNumber(id)) {
        next = addLog(next, `The road from ${city.name} to ${state.cities[id].name} is cut.`, { kind: "city", factions: [factionId] });
      }
    }
    for (const id of city.cutRoads) {
      if (routes.some((r) => r.partner === id && !r.cut) && cityNumber(city.id) < cityNumber(id)) {
        next = addLog(next, `The road from ${city.name} to ${state.cities[id].name} is open again.`, { kind: "city", factions: [factionId] });
      }
    }
    if (cut.length !== city.cutRoads.length || cut.some((id) => !city.cutRoads.includes(id))) {
      next = { ...next, cities: { ...next.cities, [city.id]: { ...next.cities[city.id], cutRoads: cut } } };
    }
  }
  return next;
}

// ---- Conquest -----------------------------------------------------------

/** Hands a city, and all the land it claims, to a new owner. A captured capital stops being a capital, and any siege ends. */
export function captureCity(state: GameState, cityId: CityId, newOwner: FactionId): GameState {
  const city = state.cities[cityId];
  const territory = { ...state.territory };
  for (const [tile, claim] of Object.entries(state.territory)) {
    if (claim.cityId === cityId) territory[tile] = { ...claim, owner: newOwner };
  }
  return {
    ...state,
    territory,
    cities: {
      ...state.cities,
      [cityId]: {
        ...city,
        owner: newOwner,
        isCapital: false,
        besiegedBy: null,
        besiegedSince: null,
        siegeWorks: 0,
        taxRate: "normal",
        // Its new owner starts with full stores, an ordinary city's (it's no longer a capital).
        supplies: maxSupplies({ isCapital: false, buildings: city.buildings }),
        // Buildings stand; whatever was being built or trained is lost.
        constructionQueue: [],
        recruitQueue: [],
        // The conqueror decides what becomes of it.
        unsettled: true,
        cutRoads: [],
      },
    },
  };
}

/**
 * A faction with no cities left is out of the game: its armies disband and
 * its sieges end. A siege is only checked at the end of the besieger's turn,
 * and a fallen faction has no more turns, so without this a city it was
 * besieging would stay shut in for ever, with no one there to fight.
 */
export function eliminateIfDefeated(state: GameState, factionId: FactionId): GameState {
  const faction = getFaction(state, factionId);
  if (!faction || !faction.alive || citiesOf(state, factionId).length > 0) return state;

  const armies = Object.fromEntries(Object.entries(state.armies).filter(([, a]) => a.owner !== factionId));
  const scouts = Object.fromEntries(Object.entries(state.scouts).filter(([, s]) => s.owner !== factionId));
  const cities = { ...state.cities };
  const freed: City[] = [];
  for (const city of Object.values(state.cities)) {
    if (city.besiegedBy !== factionId) continue;
    cities[city.id] = { ...city, besiegedBy: null, besiegedSince: null, siegeWorks: 0, supplies: maxSupplies(city) };
    freed.push(city);
  }
  let next = updateFaction({ ...state, armies, scouts, cities }, factionId, (f) => ({ ...f, alive: false }));
  next = addLog(next, `${faction.name} has fallen.`, { kind: "war", factions: [factionId], major: true });
  for (const city of freed) next = addLog(next, `The siege of ${city.name} is over.`, { kind: "siege", factions: [city.owner] });
  return next;
}
