import type { GameContext } from "@/core/context.js";
import { citiesOf, type Army, type GameState, type Regiment } from "@/core/state.js";
import { ECONOMY } from "@/data/economy.js";
import { GAME_SETUP, STARTING_ARMIES } from "@/data/gameSetup.js";
import type { Scenario, ScenarioFaction } from "@/data/scenarios/types.js";
import { TERRAIN } from "@/data/terrain.js";
import { ARMY_RULES, UNITS, regimentSize } from "@/data/units.js";
import type { GameMap } from "@/map/mapEngine.js";
import type { TileId } from "@/map/topology.js";
import { claimTerritory, createCity, measureCoasts } from "@/systems/cities.js";

/**
 * Builds the starting state for a scenario: every faction's cities at their
 * historical locations, and its starting armies in its cities. No other
 * cities are ever created.
 */
export function createGame(ctx: GameContext, map: GameMap, scenario: Scenario): GameState {
  const { factions } = scenario;
  if (factions.length === 0) throw new Error("A game needs at least one faction");

  let state: GameState = {
    turn: 1,
    factions: factions.map(({ cities: _cities, ...f }) => ({ ...f, alive: true, gold: ECONOMY.startingGold })),
    currentFactionIndex: 0,
    tiles: map.tiles,
    territory: {},
    cities: {},
    armies: {},
    nextCityNumber: 1,
    nextArmyNumber: 1,
    nextRegimentNumber: 1,
    log: [],
    nextLogNumber: 1,
    battles: [],
    nextBattleNumber: 1,
    mapSeed: scenario.seed,
    rngState: scenario.seed >>> 0,
  };

  state = measureCoasts(ctx, claimTerritory(ctx, placeCities(ctx, state, map, factions)));
  return placeStartingArmies(state);
}

/**
 * Places each faction's cities at their real locations: capitals first, then
 * one city per faction per round. A location that falls on a sea tile moves
 * to the nearest land. A city closer than GAME_SETUP.minCitySpacing to one
 * already placed moves over land to the nearest tile that isn't, at most
 * GAME_SETUP.maxCityShift steps away, so their land doesn't overlap;
 * if there's none, as far from its neighbours as it can get, and they share
 * their land (claimTerritory).
 */
function placeCities(ctx: GameContext, state: GameState, map: GameMap, factions: readonly ScenarioFaction[]): GameState {
  if (!map.locate) throw new Error("This scenario places cities by location, but its map can't locate places");

  const ordered = factions.map((f) =>
    [...f.cities].sort((a, b) => Number(Boolean(b.capital)) - Number(Boolean(a.capital))),
  );
  const rounds = Math.max(...ordered.map((list) => list.length));

  let next = state;
  for (let round = 0; round < rounds; round++) {
    factions.forEach((faction, i) => {
      const city = ordered[i][round];
      if (!city) return;
      const real = nearestFreeLand(ctx, next, map.locate!(city.lon, city.lat));
      if (!real) {
        console.warn(`Couldn't place ${city.name}: no land near ${city.lon}, ${city.lat}`);
        return;
      }
      const tile = spacedTile(ctx, next, real);
      next = createCity(ctx, next, faction.id, tile, Boolean(city.capital), city.name);
    });
  }
  return next;
}

/**
 * Where to put a city whose real location is `real`: the nearest tile, over
 * land, that's at least GAME_SETUP.minCitySpacing from every city already
 * placed, at most GAME_SETUP.maxCityShift steps from `real`. Steps go to
 * adjacent land only, so a city never moves across the sea. If no tile is
 * that far, the one in reach that's farthest from its nearest neighbour (the
 * nearest such tile on a tie), so crowded cities still get what room they can.
 */
function spacedTile(ctx: GameContext, state: GameState, real: TileId): TileId {
  const cities = Object.values(state.cities).map((c) => c.tile);
  if (cities.length === 0) return real;
  const room = (t: TileId) => Math.min(GAME_SETUP.minCitySpacing, ...cities.map((c) => ctx.topology.distance(c, t)));

  let best = { tile: real, room: room(real) };
  const seen = new Set([real]);
  let frontier = [real];
  for (let step = 1; step <= GAME_SETUP.maxCityShift && best.room < GAME_SETUP.minCitySpacing; step++) {
    const next: TileId[] = [];
    for (const tile of frontier) {
      for (const n of ctx.topology.neighbors(tile)) {
        if (seen.has(n) || ctx.topology.distance(tile, n) !== 1 || !TERRAIN[state.tiles[n].terrain].passable) continue;
        seen.add(n);
        next.push(n);
      }
    }
    // Tiles in reach at this many steps, in a fixed order; a nearer tile wins a tie.
    for (const tile of next.sort()) {
      if (cities.includes(tile)) continue;
      const r = room(tile);
      if (r > best.room) best = { tile, room: r };
    }
    frontier = next;
  }
  return best.tile;
}

/** The closest passable tile without a city, searching outward from `tile`. */
function nearestFreeLand(ctx: GameContext, state: GameState, tile: TileId | null): TileId | null {
  if (!tile) return null;
  const taken = new Set(Object.values(state.cities).map((c) => c.tile));
  const seen = new Set([tile]);
  const queue = [tile];
  while (queue.length > 0) {
    const t = queue.shift()!;
    if (TERRAIN[state.tiles[t].terrain].passable && !taken.has(t)) return t;
    for (const n of ctx.topology.neighbors(t)) {
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return null;
}

/**
 * Gives every faction its free starting armies, ready to move: one in its
 * capital, and a garrison in each of its other cities (STARTING_ARMIES).
 */
function placeStartingArmies(state: GameState): GameState {
  let next = state;
  for (const faction of next.factions) {
    for (const city of citiesOf(next, faction.id)) {
      const plan = city.isCapital ? STARTING_ARMIES.capital : STARTING_ARMIES.city;
      const regiments: Regiment[] = [];
      for (const { unit, regiments: count } of plan) {
        for (let i = 0; i < count; i++) {
          regiments.push({
            id: `reg${next.nextRegimentNumber + regiments.length}`,
            unit,
            tier: 1,
            soldiers: regimentSize(unit),
            movementLeft: UNITS[unit].movement,
            pinned: false,
          });
        }
      }
      if (regiments.length === 0) continue;

      const army: Army = { id: `army${next.nextArmyNumber}`, owner: faction.id, tile: city.tile, regiments, destination: null };
      next = {
        ...next,
        armies: { ...next.armies, [army.id]: army },
        nextArmyNumber: next.nextArmyNumber + 1,
        nextRegimentNumber: next.nextRegimentNumber + regiments.length,
      };
    }
  }
  return next;
}
