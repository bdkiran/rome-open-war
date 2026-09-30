/**
 * Plays a whole game with the AI controlling every faction except the
 * player, who just ends their turns (occupying any city that falls to them).
 * Runs the real game code in Node, with no browser. Used by the test suite
 * (tests/) and the balance report (tools/simulate.ts).
 */
import { applyAction, type Action } from "@/core/actions.js";
import type { GameContext } from "@/core/context.js";
import { createGame } from "@/core/setup.js";
import { armyAt, citiesOf, currentFaction, type GameState } from "@/core/state.js";
import { nextAction } from "@/ai/ai.js";
import { ROMAN_WORLD } from "@/data/scenarios/romanWorld.js";
import { regimentSize, type UnitType } from "@/data/units.js";

export interface SimulationOptions {
  /** Play until this turn is over (or one faction is left). */
  turns: number;
  /** Seeds the battles. Defaults to the scenario's own seed. */
  seed?: number;
  /** Give the passive player a strong garrison in each city, so the AIs fight each other. */
  garrison?: boolean;
  /** Freeze every state, so any rule that mutates state instead of copying it throws. */
  freeze?: boolean;
  /** Called at the start of every round (each time the player's turn comes up). */
  onRound?: (state: GameState) => void;
}

export interface SimulationResult {
  ctx: GameContext;
  state: GameState;
  /** Every action the AI tried that applyAction refused. Should be empty. */
  invalid: string[];
  /** AI turns that hit the action limit without ending. Should be empty. */
  stuck: string[];
  actions: number;
  actionsByType: Record<string, number>;
  mostActionsInOneTurn: number;
  ms: number;
}

/** AI actions allowed in one turn before it's treated as stuck. */
const ACTION_LIMIT = 200;

/** Plays a game: see the top of this file. */
export function simulate(options: SimulationOptions): SimulationResult {
  const scenario = { ...ROMAN_WORLD, seed: options.seed ?? ROMAN_WORLD.seed };
  const map = scenario.mapEngine.createMap();
  const ctx: GameContext = { topology: map.topology };
  const keep = (s: GameState) => (options.freeze ? deepFreeze(s) : s);
  let state = createGame(ctx, map, scenario);
  const player = state.factions.find((f) => f.controller === "human")!.id;
  if (options.garrison) state = garrisonCities(state, player);
  state = keep(state);

  const result: Omit<SimulationResult, "state" | "ms"> = {
    ctx,
    invalid: [],
    stuck: [],
    actions: 0,
    actionsByType: {},
    mostActionsInOneTurn: 0,
  };
  const started = performance.now();

  while (state.turn <= options.turns && state.factions.filter((f) => f.alive).length > 1) {
    const faction = currentFaction(state);
    if (faction.controller === "human") {
      options.onRound?.(state);
      for (const city of citiesOf(state, faction.id).filter((c) => c.unsettled)) {
        state = keep(mustApply(ctx, state, faction.id, { type: "settleCity", cityId: city.id, choice: "occupy" }));
      }
      state = keep(mustApply(ctx, state, faction.id, { type: "endTurn" }));
      continue;
    }

    let taken = 0;
    while (currentFaction(state).id === faction.id) {
      if (taken === ACTION_LIMIT) {
        result.stuck.push(`${faction.id} on turn ${state.turn}`);
        state = keep(mustApply(ctx, state, faction.id, { type: "endTurn" }));
        break;
      }
      const action = nextAction(ctx, state, faction.id);
      result.actionsByType[action.type] = (result.actionsByType[action.type] ?? 0) + 1;
      taken++;
      const applied = applyAction(ctx, state, faction.id, action);
      if (!applied.ok) {
        result.invalid.push(`${faction.id} on turn ${state.turn}: ${JSON.stringify(action)}: ${applied.reason}`);
        state = keep(mustApply(ctx, state, faction.id, { type: "endTurn" }));
        break;
      }
      state = keep(applied.state);
      result.actions++;
    }
    result.mostActionsInOneTurn = Math.max(result.mostActionsInOneTurn, taken);
  }

  return { ...result, state, ms: performance.now() - started };
}

function mustApply(ctx: GameContext, state: GameState, factionId: string, action: Action): GameState {
  const applied = applyAction(ctx, state, factionId, action);
  if (!applied.ok) throw new Error(`${factionId} couldn't ${action.type}: ${applied.reason}`);
  return applied.state;
}

/** Replaces the army in each of the player's cities with six full regiments. */
function garrisonCities(state: GameState, player: string): GameState {
  const armies = { ...state.armies };
  const units: UnitType[] = ["spearmen", "spearmen", "archers", "archers", "cavalry", "cavalry"];
  for (const city of citiesOf(state, player)) {
    const here = armyAt(state, city.tile);
    if (here) delete armies[here.id];
    const id = `g${city.id}`;
    armies[id] = {
      id,
      owner: player,
      tile: city.tile,
      destination: null,
      regiments: units.map((unit, i) => ({
        id: `${id}r${i}`,
        unit,
        soldiers: regimentSize(unit),
        movementLeft: 0,
        pinned: false,
      })),
    };
  }
  return { ...state, armies };
}

/** Freezes an object and everything in it, skipping anything already frozen (shared with an earlier state). */
function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
