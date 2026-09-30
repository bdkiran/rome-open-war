/**
 * Whole AI-vs-AI games, checked as they're played: the AI never issues an
 * invalid order or gets stuck, no AI ends in debt, the game state never
 * breaks the rules in invariants.ts, and no rule changes a state in place.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GameState } from "@/core/state.js";
import { simulate, type SimulationOptions } from "../tools/simulation.js";
import { brokenRules } from "./invariants.js";

/**
 * Plays a game, checking the rules every round, and fails on anything wrong.
 * Every state is frozen, so a rule that changes state in place instead of
 * returning a new one throws.
 */
function playCleanly(options: SimulationOptions): GameState {
  const broken: string[] = [];
  const onRound = (state: GameState) => broken.push(...brokenRules(state));
  const result = simulate({ ...options, freeze: true, onRound });
  broken.push(...brokenRules(result.state));

  assert.deepEqual(result.invalid, [], "the AI issued invalid orders");
  assert.deepEqual(result.stuck, [], "an AI turn never ended");
  assert.deepEqual(broken.slice(0, 10), [], "the game state broke the rules");
  // The passive player isn't managing its money, so only the AI is held to this.
  const debt = result.state.factions.filter((f) => f.controller === "ai" && f.gold < 0).map((f) => `${f.id} ${f.gold}`);
  assert.deepEqual(debt, [], "an AI faction ended in debt");
  return result.state;
}

describe("AI-vs-AI games", () => {
  it("plays 100 turns cleanly", () => {
    playCleanly({ turns: 100 });
  });

  it("plays 100 turns cleanly with other battle seeds", () => {
    for (const seed of [1, 2]) playCleanly({ turns: 100, seed });
  });

  it("plays 100 turns cleanly when the AIs fight each other (--garrison)", () => {
    playCleanly({ turns: 100, garrison: true });
  });
});

describe("game state", () => {
  it("stays plain data that survives a round trip through JSON", () => {
    const { state } = simulate({ turns: 100, garrison: true });
    assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
  });

  it("plays out the same way from the same seed", () => {
    const once = simulate({ turns: 30, seed: 3 }).state;
    const again = simulate({ turns: 30, seed: 3 }).state;
    assert.deepEqual(again, once);
  });
});
