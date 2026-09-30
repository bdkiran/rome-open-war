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
} from "@/core/state.js";
import { BUILDING_EFFECTS, LEVEL_POPULATION_LIMIT } from "@/data/buildings.js";
import { ECONOMY, TAX_RATES } from "@/data/economy.js";
import { GAME_SETUP } from "@/data/gameSetup.js";
import { maxSupplies } from "@/systems/siege.js";
import { TERRAIN } from "@/data/terrain.js";
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
    recruitQueue: [],
    taxRate: "normal",
    // Every city has a council hall; a capital starts with a forum (level 2) and a barracks.
    buildings: { government: isCapital ? 2 : 1, barracks: isCapital ? 1 : 0, walls: 0, farms: 0, market: 0, mine: 0 },
    constructionQueue: [],
    unsettled: false,
    fishingGrounds: tilesWithin(ctx.topology, tile, GAME_SETUP.territoryRadius).filter(
      (t) => state.tiles[t].terrain === "water",
    ).length,
  };
  const next: GameState = {
    ...state,
    cities: { ...state.cities, [id]: city },
    nextCityNumber: state.nextCityNumber + 1,
    territory: { ...state.territory, [tile]: { owner, cityId: id } },
  };
  return claimTerritory(ctx, next, id);
}

// ---- Territory ----------------------------------------------------------

/** Claims unowned land within the territory radius. Never takes land that is already claimed. */
function claimTerritory(ctx: GameContext, state: GameState, cityId: CityId): GameState {
  const city = state.cities[cityId];
  const territory = { ...state.territory };
  for (const tile of tilesWithin(ctx.topology, city.tile, GAME_SETUP.territoryRadius)) {
    if (territory[tile]) continue;
    if (!TERRAIN[state.tiles[tile].terrain].passable) continue;
    territory[tile] = { owner: city.owner, cityId };
  }
  return { ...state, territory };
}

/**
 * All tiles within `radius` steps, found by walking neighbors, so it works on
 * any map topology.
 */
export function tilesWithin(topology: MapTopology, start: TileId, radius: number): TileId[] {
  const seen = new Set<TileId>([start]);
  let frontier: TileId[] = [start];
  for (let step = 0; step < radius; step++) {
    const next: TileId[] = [];
    for (const tile of frontier) {
      for (const n of topology.neighbors(tile)) {
        if (!seen.has(n)) {
          seen.add(n);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return [...seen];
}

/** How many hills and mountain tiles a city's territory has for a mine to dig. */
export function mineableTiles(state: GameState, cityId: CityId): number {
  return cityTiles(state, cityId).filter((t) => TERRAIN[state.tiles[t].terrain].mineable).length;
}

/** Tiles claimed by a city. */
export function cityTiles(state: GameState, cityId: CityId): TileId[] {
  return Object.entries(state.territory)
    .filter(([, claim]) => claim.cityId === cityId)
    .map(([tile]) => tile);
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
  /** Growth per turn when the city is small, e.g. 0.025 = 2.5%. Average of its terrain. */
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
  /** base + people + mine. */
  subtotal: number;
  /** The tax rate's multiplier, e.g. 1.5 on high taxes. */
  taxes: number;
  /** The market's multiplier, e.g. 1.3 with a market square. */
  market: number;
  /** subtotal × taxes × market, rounded. */
  total: number;
}

export function cityStats(state: GameState, city: City): CityStats {
  const tiles = cityTiles(state, city.id);
  // The sea within reach feeds the city like land does.
  let capacity = city.fishingGrounds * TERRAIN.water.capacity;
  let growthSum = city.fishingGrounds * TERRAIN.water.growth;
  let mineable = 0;
  for (const tile of tiles) {
    const terrain = TERRAIN[state.tiles[tile].terrain];
    capacity += terrain.capacity;
    growthSum += terrain.growth;
    if (terrain.mineable) mineable++;
  }
  const places = tiles.length + city.fishingGrounds;
  const baseGrowthRate = places > 0 ? growthSum / places : 0;
  const tax = TAX_RATES[city.taxRate];
  const farms = city.buildings.farms;
  const growthRate = baseGrowthRate * tax.growth * (1 + BUILDING_EFFECTS.farmsGrowth[farms]);
  const levelLimit = LEVEL_POPULATION_LIMIT[city.buildings.government];
  const fedCapacity = Math.min(capacity, levelLimit);
  const base = ECONOMY.cityBaseGold;
  const people = Math.floor(city.population / 1000) * ECONOMY.goldPer1000People;
  const mine = mineable * BUILDING_EFFECTS.mineGoldPerTile[city.buildings.mine];
  const subtotal = base + people + mine;
  const market = 1 + BUILDING_EFFECTS.marketGold[city.buildings.market];
  const total = Math.round(subtotal * tax.gold * market);

  return {
    capacity: fedCapacity,
    landCapacity: capacity,
    limitedByLevel: levelLimit < capacity,
    baseGrowthRate,
    growthRate,
    growth: populationGrowth(city.population, fedCapacity, growthRate),
    gold: total,
    income: { base, people, mine, subtotal, taxes: tax.gold, market, total },
  };
}

/**
 * Carrying-capacity growth: close to the full rate while the city is small,
 * slowing to zero as it nears capacity, and negative if it's over capacity.
 */
export function populationGrowth(population: number, capacity: number, rate: number): number {
  if (capacity <= 0) return -population;
  return Math.round(rate * population * (1 - population / capacity));
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

  return updateFaction({ ...state, cities }, factionId, (f) => ({ ...f, gold: f.gold + income }));
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
      // No longer a capital, so its stores are an ordinary city's.
      [cityId]: {
        ...city,
        owner: newOwner,
        isCapital: false,
        besiegedBy: null,
        taxRate: "normal",
        supplies: Math.min(city.supplies, maxSupplies({ isCapital: false, buildings: city.buildings })),
        // Buildings stand; whatever was being built or trained is lost.
        constructionQueue: [],
        recruitQueue: [],
        // The conqueror decides what becomes of it.
        unsettled: true,
      },
    },
  };
}

/** A faction with no cities left is out of the game, and its armies disband. */
export function eliminateIfDefeated(state: GameState, factionId: FactionId): GameState {
  const faction = getFaction(state, factionId);
  if (!faction || !faction.alive || citiesOf(state, factionId).length > 0) return state;

  const armies = Object.fromEntries(Object.entries(state.armies).filter(([, a]) => a.owner !== factionId));
  const next = updateFaction({ ...state, armies }, factionId, (f) => ({ ...f, alive: false }));
  return addLog(next, `${faction.name} has fallen.`, { kind: "war", factions: [factionId], major: true });
}
