/** Rebels: they take a city whose revolt wins, hold it, raise militia, take no turns, and play no part in victory. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAction, type Action } from "@/core/actions.js";
import type { GameContext } from "@/core/context.js";
import { createGame } from "@/core/setup.js";
import { armyAt, currentFaction, getFaction, type City, type GameState } from "@/core/state.js";
import { REBELS } from "@/data/rebels.js";
import { ROMAN_WORLD } from "@/data/scenarios/romanWorld.js";
import { captureCity } from "@/systems/cities.js";
import { conquestMalus, revolt } from "@/systems/order.js";
import { raiseRebelMilitia, rebelRegiments } from "@/systems/rebels.js";
import { lastFactionStanding } from "@/systems/victory.js";
import { simulate } from "../tools/simulation.js";
import { brokenRules } from "./invariants.js";

const map = ROMAN_WORLD.mapEngine.createMap();
const ctx: GameContext = { topology: map.topology };
const newGame = (): GameState => createGame(ctx, map, ROMAN_WORLD);
const named = (s: GameState, name: string): City => Object.values(s.cities).find((c) => c.name === name)!;
const apply = (s: GameState, faction: string, action: Action) => {
  const r = applyAction(ctx, s, faction, action);
  assert.ok(r.ok, r.ok ? "" : r.reason);
  return r.state;
};

/** The state with no army in a city. */
function emptied(state: GameState, city: City): GameState {
  const army = armyAt(state, city.tile);
  if (!army) return state;
  const armies = { ...state.armies };
  delete armies[army.id];
  return { ...state, armies };
}

/** A city, emptied of its garrison, revolts and goes to the rebels. */
function rebelled(state: GameState, name: string, population?: number): GameState {
  const city = named(state, name);
  const empty = emptied(state, city);
  const ready = population ? { ...empty, cities: { ...empty.cities, [city.id]: { ...city, population } } } : empty;
  return revolt(ready, ready.cities[city.id]);
}

describe("rebels", () => {
  it("are in every game, never alive, and left out of the turn order", () => {
    let s = newGame();
    const rebels = getFaction(s, REBELS.id);
    assert.equal(rebels?.alive, false);
    s = rebelled(s, "Croton");
    for (let i = 0; i < s.factions.length * 2; i++) {
      assert.notEqual(currentFaction(s).id, REBELS.id);
      s = apply(s, currentFaction(s).id, { type: "endTurn" });
    }
  });

  it("raise a militia regiment every few turns, up to the size of the revolt", () => {
    const start = rebelled(newGame(), "Croton", 6_000);
    const croton = named(start, "Croton");
    const cap = rebelRegiments(6_000);
    const garrison = armyAt(start, croton.tile)!;
    assert.equal(garrison.regiments.length, cap);
    // Two of them gone: they come back one at a time.
    const thinned = { ...start, armies: { ...start.armies, [garrison.id]: { ...garrison, regiments: garrison.regiments.slice(0, cap - 2) } } };
    const at = (turn: number, s: GameState) => raiseRebelMilitia({ ...s, turn });
    const regiments = (s: GameState) => armyAt(s, croton.tile)!.regiments.length;
    assert.equal(regiments(at(start.turn + 1, thinned)), cap - 2, "not yet");
    const once = at(start.turn + REBELS.raiseEvery, thinned);
    assert.equal(regiments(once), cap - 1);
    const twice = at(start.turn + 2 * REBELS.raiseEvery, once);
    assert.equal(regiments(twice), cap);
    assert.equal(regiments(at(start.turn + 3 * REBELS.raiseEvery, twice)), cap, "never past the cap");
    assert.deepEqual(brokenRules(twice), []);
  });

  it("raise a new garrison in an empty rebel city", () => {
    const start = rebelled(newGame(), "Croton");
    const croton = named(start, "Croton");
    const empty = emptied(start, croton);
    const after = raiseRebelMilitia({ ...empty, turn: start.turn + REBELS.raiseEvery });
    assert.equal(armyAt(after, croton.tile)?.owner, REBELS.id);
    assert.equal(armyAt(after, croton.tile)?.regiments.length, 1);
  });

  it("take a faction's last city, and it falls", () => {
    let s = newGame();
    const cities = { ...s.cities };
    for (const name of ["Croton", "Messana"]) cities[named(s, name).id] = { ...named(s, name), owner: "rome" };
    s = rebelled({ ...s, cities }, "Tarentum");
    assert.equal(getFaction(s, "samnites")?.alive, false);
    assert.equal(named(s, "Tarentum").owner, REBELS.id);
    assert.deepEqual(brokenRules(s), []);
  });

  it("don't count for victory: the last real faction standing wins", () => {
    const s = rebelled(newGame(), "Croton");
    const factions = s.factions.map((f) => (f.id === "rome" ? f : { ...f, alive: false }));
    assert.equal(lastFactionStanding({ ...s, factions })?.id, "rome");
  });

  it("give their city up without a conquest malus, though its fate is still chosen", () => {
    const s = rebelled(newGame(), "Croton");
    const taken = captureCity(emptied(s, named(s, "Croton")), named(s, "Croton").id, "rome");
    const croton = named(taken, "Croton");
    assert.equal(croton.owner, "rome");
    assert.equal(croton.unsettled, true, "the fate screen still comes up");
    assert.equal(croton.conqueredOn, null);
    assert.equal(conquestMalus(taken, croton), 0);
  });

  it("are taken back by an AI neighbour, without an invalid order", () => {
    let retaken = false;
    const result = simulate({
      turns: 40,
      garrison: true,
      prepare: (_ctx, s) => rebelled(s, "Croton"),
      onRound: (s) => {
        assert.deepEqual(brokenRules(s), []);
        if (named(s, "Croton").owner !== REBELS.id) retaken = true;
      },
    });
    assert.deepEqual(result.invalid, []);
    assert.deepEqual(result.stuck, []);
    assert.ok(retaken || named(result.state, "Croton").owner !== REBELS.id, "Croton is still the rebels' after 40 turns");
  });
});
