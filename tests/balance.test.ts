/**
 * The economy's levers stay real choices: no tax policy and no fate for a
 * conquered city is best at every horizon. Measured with the peacetime
 * economy model in tools/economy.ts; `npm run levers` prints the numbers.
 * If a tuning change fails one of these, look at the report before
 * loosening the ranges.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GameContext } from "@/core/context.js";
import { createGame } from "@/core/setup.js";
import type { GameState } from "@/core/state.js";
import { SETTLEMENT_ORDER, type SettlementChoice } from "@/data/conquest.js";
import { ROMAN_WORLD } from "@/data/scenarios/romanWorld.js";
import { likelyConqueror, overtakes, settlementValues, TAX_POLICIES, worldEconomy } from "../tools/economy.js";
import { simulate } from "../tools/simulation.js";

const map = ROMAN_WORLD.mapEngine.createMap();
const ctx: GameContext = { topology: map.topology };
const TURNS = 100;

describe("taxes", () => {
  const start = createGame(ctx, map, ROMAN_WORLD);
  const gold = (name: string) => worldEconomy(ctx, start, TURNS, TAX_POLICIES[name].policy).map((t) => t.earned);
  const low = gold("all low");
  const normal = gold("all normal");
  const high = gold("all high");
  const growThenTax = gold("grow, then tax");

  it("pay most on high in the short run, but not in the long run", () => {
    assert.ok(high[24] > normal[24] && high[24] > low[24], "high taxes should lead after 25 turns");
    assert.ok(normal[TURNS - 1] > high[TURNS - 1], "normal taxes should overtake high ones within 100 turns");
  });

  it("reward growing a city first, then taxing it, within a game's length", () => {
    const turn = overtakes(growThenTax, high);
    assert.ok(turn !== null && turn >= 30 && turn <= 90, `growing first overtook all-high taxes on turn ${turn}; expected 30–90`);
  });
});

describe("conquest", () => {
  // A real game's cities at turn 50, grown and built up by the AI.
  let atTurn50: GameState | undefined;
  const played = simulate({ turns: 50, onRound: (s) => (s.turn === 50 ? (atTurn50 = s) : undefined) });
  const midGame = atTurn50 ?? played.state;
  const cities = Object.values(midGame.cities);
  const values = cities.map((city) => settlementValues(ctx, midGame, city.id, likelyConqueror(ctx, midGame, city), TURNS));
  const bestAt = (turn: number) =>
    values.map((v) => [...SETTLEMENT_ORDER].sort((a, b) => v[b][turn - 1] - v[a][turn - 1])[0] as SettlementChoice);

  it("pays most for exterminating in the short run", () => {
    const share = bestAt(5).filter((c) => c === "exterminate").length / cities.length;
    assert.ok(share >= 0.9, `exterminating was best after 5 turns for only ${Math.round(share * 100)}% of cities`);
  });

  it("rarely pays most for exterminating in the long run", () => {
    // Accepted: plunder can buy a poor conqueror a lasting lead, most of all
    // from a big city whose halved people regrow fast toward its cap
    // (Camulodunon, taken by a faction with 394 gold, is ahead 15% at 50
    // turns). What mustn't happen is exterminating becoming the usual
    // long-run choice.
    const share = (turn: number) => bestAt(turn).filter((c) => c === "exterminate").length / cities.length;
    assert.ok(share(50) <= 0.1, `exterminating was best after 50 turns for ${Math.round(share(50) * 100)}% of cities`);
    assert.ok(share(TURNS) <= 0.05, `exterminating was best after 100 turns for ${Math.round(share(TURNS) * 100)}% of cities`);
  });

  it("makes occupying overtake exterminating within a war's length", () => {
    const turns = values.map((v) => overtakes(v.occupy, v.exterminate) ?? Infinity).sort((a, b) => a - b);
    const median = turns[Math.floor(turns.length / 2)];
    assert.ok(median >= 8 && median <= 40, `occupying overtook exterminating after a median ${median} turns; expected 8–40`);
  });
});
