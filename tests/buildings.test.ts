/** Which buildings a city can build next: what the Construction tab lists. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GameContext } from "@/core/context.js";
import { createGame } from "@/core/setup.js";
import { updateFaction, type City, type GameState } from "@/core/state.js";
import { BUILDING_EFFECTS, LEVEL_POPULATION } from "@/data/buildings.js";
import { ROMAN_WORLD } from "@/data/scenarios/romanWorld.js";
import { buildingAvailable, canBuild } from "@/systems/buildings.js";
import { cityStats, mineableTiles, plainsTiles, seaShare } from "@/systems/cities.js";

function newGame(): GameState {
  const map = ROMAN_WORLD.mapEngine.createMap();
  const ctx: GameContext = { topology: map.topology };
  return createGame(ctx, map, ROMAN_WORLD);
}

function cityNamed(state: GameState, name: string): City {
  return Object.values(state.cities).find((c) => c.name === name)!;
}

function withCity(state: GameState, city: City): GameState {
  return { ...state, cities: { ...state.cities, [city.id]: city } };
}

describe("buildingAvailable", () => {
  it("offers a mine only where there are hills or mountains to dig", () => {
    const state = newGame();
    const hilly = Object.values(state.cities).find((c) => mineableTiles(state, c.id) > 0)!;
    const flat = Object.values(state.cities).find((c) => mineableTiles(state, c.id) === 0)!;
    assert.equal(buildingAvailable(state, hilly.id, "mine"), true);
    assert.equal(buildingAvailable(state, flat.id, "mine"), false);
  });

  it("holds back a building's next level until the city reaches it", () => {
    let state = newGame();
    const ariminum = cityNamed(state, "Ariminum"); // a level-1 city
    assert.equal(buildingAvailable(state, ariminum.id, "walls"), true);
    state = withCity(state, { ...ariminum, buildings: { ...ariminum.buildings, walls: 1 } });
    assert.equal(buildingAvailable(state, ariminum.id, "walls"), false);
  });

  it("offers the next government only once the city has the people", () => {
    let state = newGame();
    const ariminum = cityNamed(state, "Ariminum");
    const needed = LEVEL_POPULATION[2];
    state = withCity(state, { ...ariminum, population: needed - 1 });
    assert.equal(buildingAvailable(state, ariminum.id, "government"), false);
    state = withCity(state, { ...ariminum, population: needed });
    assert.equal(buildingAvailable(state, ariminum.id, "government"), true);
  });

  it("still offers a building the faction can't afford, which canBuild then refuses", () => {
    const state = updateFaction(newGame(), "rome", (f) => ({ ...f, gold: 0 }));
    const roma = cityNamed(state, "Roma");
    assert.equal(buildingAvailable(state, roma.id, "walls"), true);
    const check = canBuild(state, "rome", roma.id, "walls");
    assert.equal(check.ok, false);
    assert.match(check.ok ? "" : check.reason, /^Costs /);
  });
});

describe("ports and roads", () => {
  it("offers a port only to a city with sea on its coast, and roads to any", () => {
    const state = newGame();
    const coastal = Object.values(state.cities).find((c) => c.coast > 0)!;
    const inland = Object.values(state.cities).find((c) => c.coast === 0)!;
    assert.equal(buildingAvailable(state, coastal.id, "port"), true);
    assert.equal(buildingAvailable(state, inland.id, "port"), false);
    assert.equal(buildingAvailable(state, coastal.id, "roads"), true);
    assert.equal(buildingAvailable(state, inland.id, "roads"), true);
  });

  it("offers a port where the sea touches a city's land, even beyond its fishing grounds", () => {
    const state = newGame();
    for (const name of ["Amaseia", "Treva", "Sardis"]) {
      const city = cityNamed(state, name);
      assert.equal(city.fishingGrounds, 0, `${name} has no fishing grounds`);
      assert.ok(city.coast > 0, `${name}'s land touches the sea`);
      assert.equal(buildingAvailable(state, city.id, "port"), true, name);
    }
  });

  it("scales a port's growth by the city's share of sea, on top of its farms", () => {
    let state = newGame();
    const city = Object.values(state.cities).find((c) => c.coast > 0)!;
    const base = cityStats(state, city).growthRate;
    const withBoth = { ...city, buildings: { ...city.buildings, farms: 1, port: 1 } };
    state = withCity(state, withBoth);
    const share = seaShare(state, withBoth);
    assert.ok(share > 0 && share < 1);
    const expected = base * (1 + BUILDING_EFFECTS.farmsGrowth[1] + BUILDING_EFFECTS.portGrowth[1] * share);
    assert.ok(Math.abs(cityStats(state, withBoth).growthRate - expected) < 1e-12);
  });
});

describe("gold from farms and ports", () => {
  it("adds gold for every plains tile with farms, and every sea tile with a port, before taxes and the market", () => {
    let state = newGame();
    const city = Object.values(state.cities).find((c) => c.coast > 0 && plainsTiles(state, c.id) > 0)!;
    const before = cityStats(state, city).income;
    for (const level of [1, 2, 3] as const) {
      const built = { ...city, taxRate: "high" as const, buildings: { ...city.buildings, farms: level, port: level, market: 1 } };
      state = withCity(state, built);
      const income = cityStats(state, built).income;
      assert.equal(income.farms, Math.round(plainsTiles(state, city.id) * BUILDING_EFFECTS.farmsGoldPerPlainsTile[level]));
      assert.equal(income.port, Math.round(city.coast * BUILDING_EFFECTS.portGoldPerSeaTile[level]));
      assert.equal(income.subtotal, before.subtotal + income.farms + income.port);
      assert.equal(income.total, Math.round(income.subtotal * income.taxes * income.market));
    }
  });

  it("gives no farm gold to a city with no plains, and none from farms or port unbuilt", () => {
    const state = newGame();
    const noPlains = Object.values(state.cities).find((c) => plainsTiles(state, c.id) === 0)!;
    assert.equal(cityStats(state, { ...noPlains, buildings: { ...noPlains.buildings, farms: 3 } }).income.farms, 0);
    for (const city of Object.values(state.cities)) {
      const income = cityStats(state, city).income;
      assert.equal(income.farms + income.port, 0, city.name);
    }
  });
});
