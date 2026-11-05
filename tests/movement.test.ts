/** Roads make a city's land cheaper to cross, for every army; and marching up to attack keeps your armies together. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GameContext } from "@/core/context.js";
import { applyAction } from "@/core/actions.js";
import { createGame } from "@/core/setup.js";
import { armyAt, type City, type GameState } from "@/core/state.js";
import { ROMAN_WORLD } from "@/data/scenarios/romanWorld.js";
import { TERRAIN, type TerrainType } from "@/data/terrain.js";
import { regimentSize } from "@/data/units.js";
import { cityTiles } from "@/systems/cities.js";
import { attackOptions, reachableTiles } from "@/systems/armies.js";
import { previewBattle } from "@/systems/combat.js";
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

describe("marching up to attack", () => {
  /** Ariminum besieged by a Carthaginian army, with a Roman relief army three tiles from it. */
  function reliefOfAriminum() {
    const start = newGame();
    const city = Object.values(start.cities).find((c) => c.name === "Ariminum")!;
    const reg = (id: string) => ({ id, unit: "spearmen" as const, tier: 1 as const, soldiers: regimentSize("spearmen"), experience: 0, movementLeft: 12, pinned: false });
    const besiegerTile = "24,29";
    const state: GameState = {
      ...start,
      cities: { ...start.cities, [city.id]: { ...city, besiegedBy: "carthage" } },
      armies: {
        ...start.armies,
        besiegers: { id: "besiegers", owner: "carthage", tile: besiegerTile, destination: null, regiments: [reg("b1")] },
        relief: { id: "relief", owner: "rome", tile: "24,26", destination: null, regiments: [reg("r1"), reg("r2")] },
      },
    };
    return { state, city, besiegerTile, garrison: armyAt(state, city.tile)! };
  }

  it("brings in a besieged city's garrison, when the relief army attacks from outside it", () => {
    const { state, city, besiegerTile, garrison } = reliefOfAriminum();
    const via = attackOptions(ctx, state, state.armies.relief, ["r1", "r2"]).get(besiegerTile);
    assert.ok(via, "the relief army can reach the besiegers");
    assert.notEqual(via, city.tile, "it doesn't shut itself in the city");
    const preview = previewBattle(ctx, state, "relief", ["r1", "r2"], besiegerTile, via);
    assert.equal(preview?.armies, 2);
    assert.equal(preview?.attackers.length, 2 + garrison.regiments.length);
  });

  it("keeps the army it marches into in the battle", () => {
    const { state, city, besiegerTile, garrison } = reliefOfAriminum();
    const all = 2 + garrison.regiments.length;
    const preview = previewBattle(ctx, state, "relief", ["r1", "r2"], besiegerTile, city.tile);
    assert.equal(preview?.attackers.length, all, "the panel counts the garrison");

    const fought = applyAction(ctx, state, "rome", { type: "attack", armyId: "relief", regimentIds: ["r1", "r2"], target: besiegerTile, via: city.tile });
    assert.ok(fought.ok);
    const battle = fought.state.battles[fought.state.battles.length - 1];
    const soldiers = Object.values(battle.attackerForces).reduce((sum, n) => sum + (n ?? 0), 0);
    const expected = [...state.armies.relief.regiments, ...garrison.regiments].reduce((sum, r) => sum + r.soldiers, 0);
    assert.equal(soldiers, expected, "and so does the battle");
  });
});
