/** The AI saves up for Forums and Senates instead of always buying something cheaper. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAction, type Action } from "@/core/actions.js";
import type { GameContext } from "@/core/context.js";
import { createGame } from "@/core/setup.js";
import { citiesOf, currentFaction, type Army, type GameState, type Regiment } from "@/core/state.js";
import { governmentToSave, nextAction } from "@/ai/ai.js";
import { BUILDINGS, LEVEL_POPULATION } from "@/data/buildings.js";
import { ROMAN_WORLD } from "@/data/scenarios/romanWorld.js";
import { regimentSize } from "@/data/units.js";

const map = ROMAN_WORLD.mapEngine.createMap();
const ctx: GameContext = { topology: map.topology };
const FORUM = BUILDINGS.government.levels[1].cost;
const CARTHAGE = "carthage";
const SPENDING = ["build", "buildWatchtower", "trainScout", "trainRegiment"];

/** Carthage to play, with one of its level 1 cities holding the people for a Forum, and this much gold. */
function ready(gold: number): { state: GameState; cityId: string } {
  const start = createGame(ctx, map, ROMAN_WORLD);
  const city = citiesOf(start, CARTHAGE).find((c) => c.buildings.government === 1)!;
  const state: GameState = {
    ...start,
    currentFactionIndex: start.factions.findIndex((f) => f.id === CARTHAGE),
    factions: start.factions.map((f) => (f.id === CARTHAGE ? { ...f, gold } : f)),
    cities: { ...start.cities, [city.id]: { ...city, population: LEVEL_POPULATION[2] } },
  };
  return { state, cityId: city.id };
}

/** Gives each of Carthage's cities a garrison of `regiments`. */
function garrisoned(state: GameState, regiments: number): GameState {
  const armies = { ...state.armies };
  citiesOf(state, CARTHAGE).forEach((city) => {
    for (const a of Object.values(armies)) if (a.tile === city.tile) delete armies[a.id];
    const list: Regiment[] = Array.from({ length: regiments }, (_, i) => ({
      id: `g${city.id}r${i}`, unit: "militia", tier: 1, soldiers: regimentSize("militia"), experience: 0, movementLeft: 0, pinned: false,
    }));
    const army: Army = { id: `g${city.id}`, owner: CARTHAGE, tile: city.tile, regiments: list, destination: null };
    if (regiments > 0) armies[army.id] = army;
  });
  return { ...state, armies };
}

/** Everything Carthage does in its turn. */
function playTurn(start: GameState): Action[] {
  const actions: Action[] = [];
  let state = start;
  for (let i = 0; i < 200 && currentFaction(state).id === CARTHAGE; i++) {
    const action = nextAction(ctx, state, CARTHAGE);
    actions.push(action);
    const result = applyAction(ctx, state, CARTHAGE, action);
    assert.ok(result.ok, result.ok ? "" : result.reason);
    state = result.state;
  }
  return actions;
}

describe("saving for a government building", () => {
  it("builds it first when there's the gold", () => {
    const { state, cityId } = ready(FORUM + 500);
    const first = playTurn(garrisoned(state, 3)).find((a) => SPENDING.includes(a.type));
    assert.deepEqual(first, { type: "build", cityId, building: "government" });
  });

  it("buys nothing else while it saves", () => {
    const { state } = ready(FORUM);
    const spent = playTurn(garrisoned(state, 3)).filter((a) => SPENDING.includes(a.type));
    assert.deepEqual(spent, []);
  });

  it("still trains while it has under the minimum of regiments per city", () => {
    const { state } = ready(FORUM);
    const actions = playTurn(garrisoned(state, 1));
    assert.ok(actions.some((a) => a.type === "trainRegiment"), "it trains");
    assert.ok(!actions.some((a) => a.type === "build"), "and still saves");
  });

  it("still retrains battered regiments while it saves", () => {
    const { state } = ready(FORUM);
    const manned = garrisoned(state, 3);
    const armies = Object.fromEntries(Object.entries(manned.armies).map(([id, a]) => [
      id,
      a.owner === CARTHAGE ? { ...a, regiments: a.regiments.map((r) => ({ ...r, soldiers: 30 })) } : a,
    ]));
    assert.ok(playTurn({ ...manned, armies }).some((a) => a.type === "replenish"));
  });

  it("stops saving when a city is besieged", () => {
    const { state, cityId } = ready(FORUM);
    assert.equal(governmentToSave(state, CARTHAGE)?.id, cityId);
    const other = citiesOf(state, CARTHAGE).find((c) => c.id !== cityId)!;
    const besieged = { ...state, cities: { ...state.cities, [other.id]: { ...other, besiegedBy: "rome" } } };
    assert.equal(governmentToSave(besieged, CARTHAGE), null);
  });

  it("doesn't save for a city without the people, or one already building it", () => {
    const { state, cityId } = ready(FORUM);
    const city = state.cities[cityId];
    const small = { ...state, cities: { ...state.cities, [cityId]: { ...city, population: LEVEL_POPULATION[2] - 1 } } };
    assert.equal(governmentToSave(small, CARTHAGE), null);
    const queued = { ...state, cities: { ...state.cities, [cityId]: { ...city, constructionQueue: [{ building: "government" as const, level: 2, turnsLeft: 4, cost: FORUM }] } } };
    assert.equal(governmentToSave(queued, CARTHAGE), null);
  });
});
