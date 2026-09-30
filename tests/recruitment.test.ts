/** Level-1 cities train militia; the Barracks unlocks spearmen, archers and cavalry, a level at a time. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GameContext } from "@/core/context.js";
import { createGame } from "@/core/setup.js";
import { armyAt, type City, type GameState } from "@/core/state.js";
import { ROMAN_WORLD } from "@/data/scenarios/romanWorld.js";
import { regimentSize } from "@/data/units.js";
import { buildingAvailable } from "@/systems/buildings.js";
import { canRetrain, canTrain, trainableUnits } from "@/systems/recruitment.js";

function newGame(): GameState {
  const map = ROMAN_WORLD.mapEngine.createMap();
  const ctx: GameContext = { topology: map.topology };
  return createGame(ctx, map, ROMAN_WORLD);
}

const cityNamed = (state: GameState, name: string) => Object.values(state.cities).find((c) => c.name === name)!;
const withCity = (state: GameState, city: City): GameState => ({ ...state, cities: { ...state.cities, [city.id]: city } });

describe("recruitment", () => {
  it("lets a level-1 city train only militia", () => {
    const state = newGame();
    const ariminum = cityNamed(state, "Ariminum");
    assert.deepEqual(trainableUnits(ariminum), ["militia"]);
    assert.equal(canTrain(state, "rome", ariminum.id, "militia").ok, true);
    const spearmen = canTrain(state, "rome", ariminum.id, "spearmen");
    assert.equal(spearmen.ok, false);
    assert.match(spearmen.ok ? "" : spearmen.reason, /Barracks/);
  });

  it("starts capitals with a Barracks, so they can train spearmen", () => {
    const state = newGame();
    const roma = cityNamed(state, "Roma");
    assert.equal(roma.buildings.barracks, 1);
    assert.deepEqual(trainableUnits(roma), ["militia", "spearmen"]);
  });

  it("unlocks archers with Barracks 2 and cavalry with Barracks 3", () => {
    const roma = cityNamed(newGame(), "Roma");
    assert.deepEqual(trainableUnits({ ...roma, buildings: { ...roma.buildings, barracks: 2 } }), ["militia", "spearmen", "archers"]);
    assert.deepEqual(trainableUnits({ ...roma, buildings: { ...roma.buildings, barracks: 3 } }), ["militia", "spearmen", "archers", "cavalry"]);
  });

  it("still retrains a regiment in a city without a Barracks", () => {
    let state = newGame();
    const ariminum = cityNamed(state, "Ariminum");
    const garrison = armyAt(state, ariminum.tile)!;
    const [spearmen] = garrison.regiments;
    assert.equal(spearmen.unit, "spearmen");
    const damaged = { ...spearmen, soldiers: regimentSize("spearmen") / 2 };
    state = { ...state, armies: { ...state.armies, [garrison.id]: { ...garrison, regiments: [damaged] } } };
    assert.equal(canRetrain(state, "rome", ariminum.id, [spearmen.id]).ok, true);
  });
});

describe("the Barracks", () => {
  it("needs a level-2 city for its first two levels and a level-3 city for the third", () => {
    let state = newGame();
    const ariminum = cityNamed(state, "Ariminum"); // level 1
    assert.equal(buildingAvailable(state, ariminum.id, "barracks"), false);

    const roma = cityNamed(state, "Roma"); // level 2, Barracks 1
    assert.equal(buildingAvailable(state, roma.id, "barracks"), true);
    state = withCity(state, { ...roma, buildings: { ...roma.buildings, barracks: 2 } });
    assert.equal(buildingAvailable(state, roma.id, "barracks"), false);
    state = withCity(state, { ...state.cities[roma.id], buildings: { ...roma.buildings, barracks: 2, government: 3 } });
    assert.equal(buildingAvailable(state, roma.id, "barracks"), true);
  });
});
