/** Trade routes: roads and ports at both ends, own cities only, road or sea, cut by sieges; the market's bonus on trade. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GameContext } from "@/core/context.js";
import { createGame } from "@/core/setup.js";
import type { City, CityId, GameState } from "@/core/state.js";
import { BUILDING_EFFECTS, type BuildingType } from "@/data/buildings.js";
import { ROMAN_WORLD } from "@/data/scenarios/romanWorld.js";
import { TRADE } from "@/data/trade.js";
import { cityStats, processCities, roadsOf, tradeRoutes } from "@/systems/cities.js";

const map = ROMAN_WORLD.mapEngine.createMap();

function newGame(): GameState {
  const ctx: GameContext = { topology: map.topology };
  return createGame(ctx, map, ROMAN_WORLD);
}

function build(state: GameState, ids: CityId[], buildings: Partial<Record<BuildingType, number>>): GameState {
  const cities = { ...state.cities };
  for (const id of ids) cities[id] = { ...cities[id], buildings: { ...cities[id].buildings, ...buildings } };
  return { ...state, cities };
}

/** Two cities of the same owner whose land borders. */
function landPair(state: GameState): [City, City] {
  for (const city of Object.values(state.cities)) {
    const other = city.landNeighbours.map((id) => state.cities[id]).find((c) => c.owner === city.owner);
    if (other) return [city, other];
  }
  throw new Error("no land pair");
}

/** Two coastal cities of the same owner within a Jetty's range, not joined by a road. */
function seaPair(state: GameState): [City, City] {
  for (const city of Object.values(state.cities)) {
    const other = Object.entries(city.seaDistances)
      .filter(([id, steps]) => steps <= TRADE.seaRange[1] && !city.landNeighbours.includes(id))
      .map(([id]) => state.cities[id])
      .find((c) => c.owner === city.owner);
    if (other) return [city, other];
  }
  throw new Error("no sea pair");
}

describe("the route map", () => {
  it("is symmetric: land neighbours and sea distances match from both ends", () => {
    const state = newGame();
    for (const city of Object.values(state.cities)) {
      for (const id of city.landNeighbours) assert.ok(state.cities[id].landNeighbours.includes(city.id), `${city.name}–${state.cities[id].name}`);
      for (const [id, steps] of Object.entries(city.seaDistances)) assert.equal(state.cities[id].seaDistances[city.id], steps);
      if (city.coast === 0) assert.deepEqual(city.seaDistances, {}, `${city.name} has no coast`);
    }
  });

  it("gives no city any trade at the start", () => {
    const state = newGame();
    for (const city of Object.values(state.cities)) assert.deepEqual(tradeRoutes(state, city), [], city.name);
  });
});

describe("tradeRoutes", () => {
  it("needs roads at both ends of a land route, and runs at the lower level", () => {
    let state = newGame();
    const [a, b] = landPair(state);
    state = build(state, [a.id], { roads: 2 });
    assert.equal(tradeRoutes(state, state.cities[a.id]).filter((r) => r.partner === b.id).length, 0);
    state = build(state, [b.id], { roads: 1 });
    const route = tradeRoutes(state, state.cities[a.id]).find((r) => r.partner === b.id && r.by === "land");
    assert.ok(route);
    assert.equal(route.level, 1);
    assert.equal(route.gold, (state.cities[b.id].population / 1000) * TRADE.roadGoldPer1000[1]);
  });

  it("needs ports at both ends of a sea route, within the route level's range", () => {
    let state = newGame();
    const [a, b] = seaPair(state);
    state = build(state, [a.id], { port: 1 });
    assert.equal(tradeRoutes(state, state.cities[a.id]).filter((r) => r.by === "sea").length, 0);
    state = build(state, [b.id], { port: 1 });
    const route = tradeRoutes(state, state.cities[a.id]).find((r) => r.partner === b.id && r.by === "sea");
    assert.ok(route);
    assert.equal(route.gold, (state.cities[b.id].population / 1000) * TRADE.seaGoldPer1000[1]);
    // Nothing beyond a Jetty's range.
    for (const r of tradeRoutes(state, state.cities[a.id]).filter((r) => r.by === "sea")) {
      assert.ok(state.cities[a.id].seaDistances[r.partner] <= TRADE.seaRange[1]);
    }
  });

  it("only trades with the owner's own cities, and a siege at either end cuts the route", () => {
    let state = newGame();
    const [a, b] = landPair(state);
    state = build(state, [a.id, b.id], { roads: 1 });
    const rival = Object.values(state.cities).find((c) => c.owner !== a.owner)!.owner;
    const taken = { ...state, cities: { ...state.cities, [b.id]: { ...state.cities[b.id], owner: rival } } };
    assert.equal(tradeRoutes(taken, taken.cities[a.id]).some((r) => r.partner === b.id), false);
    const besieged = { ...state, cities: { ...state.cities, [b.id]: { ...state.cities[b.id], besiegedBy: rival } } };
    assert.equal(tradeRoutes(besieged, besieged.cities[a.id]).some((r) => r.partner === b.id), false);
    assert.deepEqual(tradeRoutes(besieged, besieged.cities[b.id]), []);
  });
});

describe("cutting a road", () => {
  /** A land pair with roads at both ends, the road between them, and a rival faction. */
  function setUp() {
    let state = newGame();
    const [a, b] = landPair(state);
    state = build(state, [a.id, b.id], { roads: 1 });
    const road = roadsOf(state, a.id).find((r) => r.cities.includes(b.id))!;
    const rival = Object.values(state.cities).find((c) => c.owner !== a.owner)!.owner;
    const middle = road.tiles[Math.floor(road.tiles.length / 2)];
    const armyHere = (tile: string, owner: string): GameState => {
      const army = Object.values(state.armies)[0];
      return { ...state, armies: { ...state.armies, raider: { ...army, id: "raider", owner, tile } } };
    };
    const route = (s: GameState) => tradeRoutes(s, s.cities[a.id]).find((r) => r.partner === b.id && r.by === "land")!;
    return { state, a, b, road, rival, middle, armyHere, route };
  }

  it("stops a land route's gold while an enemy army stands on the road", () => {
    const { state, rival, middle, armyHere, route } = setUp();
    assert.equal(route(state).cut, false);
    const raided = armyHere(middle, rival);
    assert.equal(route(raided).cut, true);
    assert.equal(route(raided).gold, 0);
  });

  it("is also done from a tile next to the road, but not by the owner's own army", () => {
    const { state, a, road, rival, armyHere, route } = setUp();
    const beside = road.watch.find((t) => !road.tiles.includes(t) && state.tiles[t].terrain !== "water");
    if (beside) assert.equal(route(armyHere(beside, rival)).cut, true);
    assert.equal(route(armyHere(road.tiles[1], a.owner)).cut, false);
  });

  it("reports the cut once, and the reopening once, to the owner", () => {
    const { state, a, rival, middle, armyHere } = setUp();
    const raided = armyHere(middle, rival);
    const cut = processCities({ topology: map.topology }, raided, a.owner);
    const cutReports = (s: GameState) => s.log.filter((e) => e.text.includes("is cut")).length;
    assert.equal(cutReports(cut), 1);
    assert.equal(cutReports(processCities({ topology: map.topology }, cut, a.owner)), 1, "not reported again");
    const { raider: _, ...armies } = cut.armies;
    const clear = processCities({ topology: map.topology }, { ...cut, armies }, a.owner);
    assert.equal(clear.log.filter((e) => e.text.includes("open again")).length, 1);
  });
});

describe("road or sea", () => {
  /** Two cities of the same owner joined by a road, whose coasts are also within a Jetty's range. */
  function bothPair(state: GameState): [City, City] {
    for (const city of Object.values(state.cities)) {
      const other = city.landNeighbours
        .filter((id) => (city.seaDistances[id] ?? Infinity) <= TRADE.seaRange[1])
        .map((id) => state.cities[id])
        .find((c) => c.owner === city.owner);
      if (other) return [city, other];
    }
    throw new Error("no pair joined by road and sea");
  }

  it("never trades by sea between cities a road joins, built or not", () => {
    let state = newGame();
    const [a, b] = bothPair(state);
    state = build(state, [a.id, b.id], { port: 1 });
    assert.deepEqual(tradeRoutes(state, state.cities[a.id]).filter((r) => r.partner === b.id), []);
    state = build(state, [a.id, b.id], { port: 1, roads: 1 });
    assert.deepEqual(tradeRoutes(state, state.cities[a.id]).filter((r) => r.partner === b.id).map((r) => r.by), ["land"]);
  });

  it("still trades by sea between ports no road joins", () => {
    let state = newGame();
    const [a, b] = seaPair(state);
    state = build(state, [a.id, b.id], { port: 1 });
    assert.deepEqual(tradeRoutes(state, state.cities[a.id]).filter((r) => r.partner === b.id).map((r) => r.by), ["sea"]);
  });
});

describe("trade gold", () => {
  it("is the only income the market multiplies, then everything is taxed", () => {
    let state = newGame();
    const [a, b] = landPair(state);
    for (const market of [0, 1, 2, 3]) {
      state = build(state, [a.id, b.id], { roads: 1, market });
      const city = { ...state.cities[a.id], taxRate: "high" as const };
      const i = cityStats(state, city).income;
      assert.ok(i.trade > 0);
      assert.equal(i.tradeMarket, 1 + TRADE.marketTrade[market]);
      assert.equal(i.total, Math.round((i.subtotal + i.trade * i.tradeMarket) * i.taxes));
    }
  });
});
