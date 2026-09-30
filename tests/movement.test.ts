/** Roads make a city's land cheaper to cross, for every army. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GameContext } from "@/core/context.js";
import { createGame } from "@/core/setup.js";
import { armyAt, type City, type GameState } from "@/core/state.js";
import { ROMAN_WORLD } from "@/data/scenarios/romanWorld.js";
import { TERRAIN, type TerrainType } from "@/data/terrain.js";
import { cityTiles } from "@/systems/cities.js";
import { reachableTiles } from "@/systems/armies.js";
import { costToTarget, enterCost } from "@/systems/pathfinding.js";

const map = ROMAN_WORLD.mapEngine.createMap();
const ctx: GameContext = { topology: map.topology };
const newGame = (): GameState => createGame(ctx, map, ROMAN_WORLD);
const withRoads = (state: GameState, city: City, roads: number): GameState => ({
  ...state,
  cities: { ...state.cities, [city.id]: { ...city, buildings: { ...city.buildings, roads } } },
});
/** A city with land of this terrain, and one such tile. */
function cityWith(state: GameState, terrain: TerrainType): { city: City; tile: string } {
  for (const city of Object.values(state.cities)) {
    const tile = cityTiles(state, city.id).find((t) => state.tiles[t].terrain === terrain);
    if (tile) return { city, tile };
  }
  throw new Error(`no city has ${terrain}`);
}

describe("enterCost", () => {
  it("is the terrain's cost without roads", () => {
    const state = newGame();
    for (const terrain of ["plains", "hills", "mountains"] as const) {
      const { tile } = cityWith(state, terrain);
      assert.equal(enterCost(state, tile), TERRAIN[terrain].moveCost, terrain);
    }
  });

  it("eases rough ground with Tracks, mountains with Roads, and everything with Paved roads", () => {
    const state = newGame();
    const hills = cityWith(state, "hills");
    const mountains = cityWith(state, "mountains");
    const plains = cityWith(state, "plains");
    assert.equal(enterCost(withRoads(state, hills.city, 1), hills.tile), 2);
    assert.equal(enterCost(withRoads(state, mountains.city, 1), mountains.tile), 4);
    assert.equal(enterCost(withRoads(state, mountains.city, 2), mountains.tile), 2);
    for (const { city, tile } of [hills, mountains, plains]) assert.equal(enterCost(withRoads(state, city, 3), tile), 1);
  });

  it("leaves land outside the territory alone", () => {
    const state = newGame();
    const { city } = cityWith(state, "hills");
    const outside = map.topology.allTiles().find((t) => state.tiles[t].terrain === "hills" && !state.territory[t])!;
    assert.equal(enterCost(withRoads(state, city, 3), outside), TERRAIN.hills.moveCost);
  });
});

describe("roads on the move", () => {
  it("let an army, even an enemy's, reach further across the city's land", () => {
    const state = newGame();
    const roma = Object.values(state.cities).find((c) => c.name === "Roma")!;
    // Hand Roma's garrison to Carthage: an enemy army standing on Roman roads.
    const garrison = armyAt(state, roma.tile)!;
    const enemy = { ...garrison, owner: "carthage", regiments: garrison.regiments.map((r) => ({ ...r, movementLeft: 12 })) };
    const base = { ...state, armies: { ...state.armies, [garrison.id]: enemy } };
    const ids = enemy.regiments.map((r) => r.id);
    const without = reachableTiles(ctx, base, enemy, ids);
    const paved = withRoads(base, roma, 3);
    const withPaved = reachableTiles(ctx, paved, enemy, ids);
    assert.ok(withPaved.size > without.size, `${withPaved.size} tiles reachable with paved roads, ${without.size} without`);
  });

  it("are counted by the march planner too", () => {
    const state = newGame();
    const roma = Object.values(state.cities).find((c) => c.name === "Roma")!;
    const land = cityTiles(state, roma.id).filter((t) => t !== roma.tile);
    // Total cost to march from each tile of Roma's land back to the city.
    const total = (s: GameState) => {
      const cost = costToTarget(ctx, s, roma.tile, roma.owner);
      return land.reduce((sum, t) => sum + (cost.get(t) ?? 0), 0);
    };
    assert.ok(total(withRoads(state, roma, 3)) < total(state));
  });
});
