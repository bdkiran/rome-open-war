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
    // Not in the long run: some policy beats all-high by 100 turns. Growing
    // cities first always should; plain normal taxes did until cities also
    // had unit buildings to pay for, and no longer do within 100 turns.
    const best = Math.max(normal[TURNS - 1], growThenTax[TURNS - 1]);
    assert.ok(best > high[TURNS - 1], "high taxes shouldn't be the best policy after 100 turns");
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

  it("never pays much more for exterminating in the long run", () => {
    // Plunder can buy a poor conqueror an early lead that lasts: a small city
    // taken by a faction with a few hundred gold, or a big one whose halved
    // people regrow fast toward its cap (Camulodunon, at turn 100, by under
    // 1%). Near-ties like those are fine; a real long-run advantage isn't.
    for (const turn of [50, TURNS]) {
      const leads = values
        .map((v, i) => ({ city: cities[i].name, lead: v.exterminate[turn - 1] / Math.max(v.occupy[turn - 1], v.enslave[turn - 1]) - 1 }))
        .filter((c) => c.lead > 0.03)
        .map((c) => `${c.city} +${Math.round(c.lead * 100)}%`);
      assert.deepEqual(leads, [], `exterminating should never lead by more than 3% after ${turn} turns`);
    }
  });

  it("makes occupying overtake exterminating within a war's length", () => {
    const turns = values.map((v) => overtakes(v.occupy, v.exterminate) ?? Infinity).sort((a, b) => a - b);
    const median = turns[Math.floor(turns.length / 2)];
    assert.ok(median >= 8 && median <= 40, `occupying overtook exterminating after a median ${median} turns; expected 8–40`);
  });
});
