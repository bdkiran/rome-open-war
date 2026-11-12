/** How a game is won: last standing, key cities held for a few turns, or score at the time limit. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAction, type Action } from "@/core/actions.js";
import type { GameContext } from "@/core/context.js";
import { createGame } from "@/core/setup.js";
import { currentFaction, type GameState } from "@/core/state.js";
import { VICTORY, type VictoryPreset } from "@/data/gameSetup.js";
import { ROMAN_WORLD } from "@/data/scenarios/romanWorld.js";
import { keyCitiesHeld, outcomeFor, scoreFor, winner } from "@/systems/victory.js";

const map = ROMAN_WORLD.mapEngine.createMap();
const ctx: GameContext = { topology: map.topology };
const newGame = (victory?: VictoryPreset): GameState => createGame(ctx, map, ROMAN_WORLD, { victory });
const named = (s: GameState, name: string) => Object.values(s.cities).find((c) => c.name === name)!;
const apply = (s: GameState, faction: string, action: Action) => {
  const r = applyAction(ctx, s, faction, action);
  assert.ok(r.ok, r.ok ? "" : r.reason);
  return r.state;
};
/** Gives cities to a faction, by name. */
function give(s: GameState, owner: string, names: string[]): GameState {
  const cities = { ...s.cities };
  for (const name of names) cities[named(s, name).id] = { ...named(s, name), owner };
  return { ...s, cities };
}
/** Every faction ends its turn until it's Rome's again (or the game ends). */
function round(s: GameState): GameState {
  let next = apply(s, "rome", { type: "endTurn" });
  while (!winner(next) && currentFaction(next).id !== "rome") next = apply(next, currentFaction(next).id, { type: "endTurn" });
  return next;
}
const FOUR = ["Roma", "Carthago", "Pella", "Corinthus"];

describe("key cities", () => {
  it("are the scenario's six capitals, and key cities is the default", () => {
    const s = newGame();
    assert.equal(s.victory.preset, "keyCities");
    assert.deepEqual(s.victory.keyCities.map((id) => s.cities[id].name), ROMAN_WORLD.keyCities);
    assert.equal(keyCitiesHeld(s, "rome"), 1);
  });

  it("win once held at the end of 5 turns in a row, with a warning on the first", () => {
    let s = give(newGame(), "rome", FOUR);
    for (let turn = 1; turn < VICTORY.holdTurns; turn++) {
      s = round(s);
      assert.equal(winner(s), null, `turn ${turn}`);
    }
    assert.match(s.log.map((e) => e.text).join("\n"), /Roman Republic holds 4 key cities: it wins if it still holds them after turn 5/);
    s = apply(s, "rome", { type: "endTurn" });
    assert.deepEqual(outcomeFor(s, "rome"), { kind: "victory", faction: s.factions[0], reason: "keyCities" });
    assert.equal(s.victory.winner?.turn, VICTORY.holdTurns);
    // Another faction has lost.
    const carthage = outcomeFor(s, "carthage");
    assert.equal(carthage?.kind, "defeat");
    // Nothing more can be done.
    assert.equal(applyAction(ctx, s, currentFaction(s).id, { type: "endTurn" }).ok, false);
  });

  it("start counting again when one is lost", () => {
    let s = give(newGame(), "rome", FOUR);
    s = round(round(s));
    assert.equal(s.victory.holding?.since, 1);
    s = give(s, "macedon", ["Pella"]);
    s = round(s);
    assert.equal(s.victory.holding, null);
    s = give(s, "rome", ["Pella"]);
    s = round(s);
    assert.equal(s.victory.holding?.since, 4);
  });

  it("can be won by an AI, which is Rome's defeat", () => {
    let s = give(newGame(), "carthage", ["Roma", "Pella", "Corinthus"]);
    for (let i = 0; i < VICTORY.holdTurns && !winner(s); i++) s = round(s);
    assert.equal(winner(s)?.faction.id, "carthage");
    const rome = outcomeFor(s, "rome");
    assert.ok(rome?.kind === "defeat" && rome.winner?.reason === "keyCities");
  });

  it("don't count with the conquest preset", () => {
    let s = give(newGame("conquest"), "rome", FOUR);
    for (let i = 0; i < VICTORY.holdTurns + 1; i++) s = round(s);
    assert.equal(winner(s), null);
    assert.equal(s.victory.holding, null);
  });
});

describe("the time limit", () => {
  it("gives the game to the best score once its round is over", () => {
    let s = newGame("timeLimit");
    s = give({ ...s, turn: VICTORY.scoreTurn }, "carthage", ["Roma"]);
    const best = s.factions.filter((f) => f.alive).reduce((a, b) => (scoreFor(s, b.id) > scoreFor(s, a.id) ? b : a));
    s = round(s);
    assert.equal(winner(s)?.faction.id, best.id);
    assert.equal(winner(s)?.reason, "score");
  });

  it("counts cities, people and key cities, not gold", () => {
    const s = newGame("timeLimit");
    const rich = { ...s, factions: s.factions.map((f) => (f.id === "rome" ? { ...f, gold: 100_000 } : f)) };
    assert.equal(scoreFor(rich, "rome"), scoreFor(s, "rome"));
    const more = give(s, "rome", ["Carthago"]);
    assert.ok(scoreFor(more, "rome") - scoreFor(s, "rome") > VICTORY.scorePerCity + VICTORY.scorePerKeyCity);
  });

  it("doesn't end a key-cities game", () => {
    let s: GameState = { ...newGame("keyCities"), turn: VICTORY.scoreTurn };
    s = round(s);
    assert.equal(winner(s), null);
  });
});

describe("last faction standing", () => {
  it("still wins, whatever the preset", () => {
    for (const preset of ["conquest", "keyCities", "timeLimit"] as const) {
      const s = newGame(preset);
      const alone = { ...s, factions: s.factions.map((f) => ({ ...f, alive: f.id === "rome" })) };
      assert.deepEqual(winner(alone), { faction: alone.factions[0], reason: "conquest" }, preset);
    }
  });
});
