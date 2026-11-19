/** Moving the capital: free, at any time, to any settled city of one's own; the AI does it when it clearly pays. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAction, type Action } from "@/core/actions.js";
import type { GameContext } from "@/core/context.js";
import { createGame } from "@/core/setup.js";
import { citiesOf, getFaction, type City, type GameState } from "@/core/state.js";
import { AI } from "@/data/ai.js";
import { ORDER } from "@/data/order.js";
import { ROMAN_WORLD } from "@/data/scenarios/romanWorld.js";
import { SIEGE } from "@/data/siege.js";
import { nextAction } from "@/ai/ai.js";
import { captureCity } from "@/systems/cities.js";
import { capitalMoveEffect, orderTarget } from "@/systems/order.js";
import { maxSupplies } from "@/systems/siege.js";
import { brokenRules } from "./invariants.js";

const map = ROMAN_WORLD.mapEngine.createMap();
const ctx: GameContext = { topology: map.topology };
const newGame = (): GameState => createGame(ctx, map, ROMAN_WORLD);
const named = (s: GameState, name: string): City => Object.values(s.cities).find((c) => c.name === name)!;
const capitalOf = (s: GameState, faction: string) => citiesOf(s, faction).filter((c) => c.isCapital).map((c) => c.name);
const apply = (s: GameState, faction: string, action: Action) => {
  const r = applyAction(ctx, s, faction, action);
  assert.ok(r.ok, r.ok ? "" : r.reason);
  return r.state;
};
const gain = (s: GameState, faction: string, cityId: string) =>
  capitalMoveEffect(ctx, s, faction, cityId).reduce((sum, e) => sum + e.moved - e.now, 0);

describe("moving the capital", () => {
  it("moves the capital's order bonus, costs nothing, and leaves the stores alone", () => {
    const start = newGame();
    const roma = named(start, "Roma");
    const capua = named(start, "Capua");
    const moved = apply(start, "rome", { type: "moveCapital", cityId: capua.id });
    assert.deepEqual(capitalOf(moved, "rome"), ["Capua"]);
    assert.equal(getFaction(moved, "rome")!.gold, getFaction(start, "rome")!.gold, "it's free");
    assert.equal(orderTarget(ctx, moved, moved.cities[capua.id]).capital, ORDER.capital);
    assert.equal(orderTarget(ctx, moved, moved.cities[roma.id]).capital, 0);
    assert.equal(moved.cities[roma.id].supplies, roma.supplies);
    assert.equal(moved.cities[capua.id].supplies, capua.supplies);
    assert.ok(moved.log.some((e) => e.text === "Rome's capital moves to Capua."));
    assert.deepEqual(brokenRules(moved), []);
  });

  it("can be moved again, and back, in the same turn", () => {
    const start = newGame();
    let s = apply(start, "rome", { type: "moveCapital", cityId: named(start, "Capua").id });
    s = apply(s, "rome", { type: "moveCapital", cityId: named(start, "Arretium").id });
    s = apply(s, "rome", { type: "moveCapital", cityId: named(start, "Roma").id });
    assert.deepEqual(capitalOf(s, "rome"), ["Roma"]);
  });

  it("is refused for another's city, the capital itself, or a city whose fate isn't decided", () => {
    const start = newGame();
    const refused = (s: GameState, cityId: string) => assert.equal(applyAction(ctx, s, "rome", { type: "moveCapital", cityId }).ok, false);
    refused(start, named(start, "Carthago").id);
    refused(start, named(start, "Roma").id);
    const taken = captureCity(start, named(start, "Tarentum").id, "rome");
    refused(taken, named(start, "Tarentum").id);
  });

  it("leaves stores to the city's level: a capital holds no more than any city of its level", () => {
    const s = newGame();
    const roma = named(s, "Roma");
    assert.equal(maxSupplies(roma), SIEGE.supplyTurnsByLevel[roma.buildings.government]);
    assert.equal(roma.supplies, maxSupplies(roma));
  });
});

describe("the AI's capital", () => {
  it("stays put at the start: no seat raises order by enough", () => {
    const s = newGame();
    for (const faction of s.factions.filter((f) => f.alive)) {
      const action = nextAction(ctx, s, faction.id);
      assert.notEqual(action.type, "moveCapital", `${faction.id} moved its capital`);
    }
  });

  it("moves it home when it sits far from most of its cities, to the seat that gains most", () => {
    const start = newGame();
    // Carthage's capital in Iberia: its four African and island cities pay the
    // distance. With no garrisons, so their order isn't held at 100 anyway.
    const cities = { ...start.cities };
    const armies = { ...start.armies };
    for (const city of citiesOf(start, "carthage")) {
      cities[city.id] = { ...city, isCapital: city.name === "Corduba" };
      for (const army of Object.values(start.armies)) if (army.tile === city.tile) delete armies[army.id];
    }
    const s: GameState = { ...start, cities, armies };
    const best = Math.max(...citiesOf(s, "carthage").filter((c) => !c.isCapital).map((c) => gain(s, "carthage", c.id)));
    assert.ok(best >= AI.capitalMoveGain, `the best seat gains only ${best}`);
    const action = nextAction(ctx, s, "carthage");
    assert.equal(action.type, "moveCapital");
    if (action.type !== "moveCapital") return;
    assert.equal(gain(s, "carthage", action.cityId), best);
    const turn = { ...s, currentFactionIndex: s.factions.findIndex((f) => f.id === "carthage") };
    const moved = apply(turn, "carthage", action);
    assert.notEqual(nextAction(ctx, moved, "carthage").type, "moveCapital", "and doesn't move it again");
  });
});
