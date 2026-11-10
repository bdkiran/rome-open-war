/** The game controller: AI turns, and the playback hook the browser uses to show them. */
import assert from "node:assert/strict";
import { it } from "node:test";
import type { GameContext } from "@/core/context.js";
import { createGame } from "@/core/setup.js";
import { currentFaction, type GameState } from "@/core/state.js";
import { ROMAN_WORLD } from "@/data/scenarios/romanWorld.js";
import { GameController, type AiStep, type ControllerOptions } from "@/game/controller.js";

const map = ROMAN_WORLD.mapEngine.createMap();
const ctx: GameContext = { topology: map.topology };

/** Ends the player's turn and waits until it comes round again. */
function playRound(options: ControllerOptions): Promise<GameState> {
  const controller = new GameController(ctx, createGame(ctx, map, ROMAN_WORLD), options);
  const player = currentFaction(controller.getState()).id;
  return new Promise((done) => {
    controller.subscribe((state) => {
      if (state.turn > 1 && currentFaction(state).id === player) done(state);
    });
    const result = controller.dispatch(player, { type: "endTurn" });
    assert.ok(result.ok);
  });
}

it("shows every AI action to the playback hook, in order, then plays on", async () => {
  const steps: AiStep[] = [];
  const final = await playRound({ aiTurnDelayMs: 0, showAiAction: async (step) => void steps.push(step) });
  assert.ok(steps.length > 13, `${steps.length} AI actions`);
  for (let i = 1; i < steps.length; i++) assert.equal(steps[i].before, steps[i - 1].after, `step ${i} starts where ${i - 1} ended`);
  const ais = final.factions.filter((f) => f.controller === "ai").length;
  assert.equal(steps.filter((s) => s.action.type === "endTurn").length, ais, "every AI ends its turn once");
  assert.equal(steps[steps.length - 1].after, final);
});

it("plays the same game with or without the hook", async () => {
  const watched = await playRound({ aiTurnDelayMs: 0, showAiAction: async () => {} });
  const plain = await playRound({ aiTurnDelayMs: 0 });
  assert.deepEqual(watched, plain);
});
