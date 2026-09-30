/**
 * A peacetime economy model for tuning the economic levers: tax rates, and
 * what to do with a conquered city. It runs one faction's cities forward
 * with the real rules (income, growth, construction) and nothing else: no
 * wars, no armies, no upkeep. Cities build the way the AI builds in
 * peacetime, so extra people turn into higher levels and better buildings,
 * which is where growth pays back.
 *
 * Used by the levers report (tools/levers.ts) and tests/balance.test.ts.
 */
import type { GameContext } from "@/core/context.js";
import { citiesOf, getFaction, type City, type CityId, type FactionId, type GameState } from "@/core/state.js";
import { AI } from "@/data/ai.js";
import { LEVEL_POPULATION, MAX_CITY_LEVEL } from "@/data/buildings.js";
import { SETTLEMENT_ORDER, type SettlementChoice } from "@/data/conquest.js";
import type { TaxRate } from "@/data/economy.js";
import { aiBuildOrder, aiTaxRate } from "@/ai/ai.js";
import { canBuild, nextLevel, progressConstruction, queueConstruction } from "@/systems/buildings.js";
import { captureCity, factionPopulation, processCities } from "@/systems/cities.js";
import { settleCity } from "@/systems/conquest.js";

/** Picks a city's tax rate each turn. */
export type TaxPolicy = (state: GameState, city: City) => TaxRate;

/** Whether a city has the people its next government needs (or is already at the top level). */
function readyToAdvance(city: City): boolean {
  const level = city.buildings.government;
  return level >= MAX_CITY_LEVEL || city.population >= LEVEL_POPULATION[level + 1];
}

/** The tax policies the levers report compares. */
export const TAX_POLICIES: Record<string, { description: string; policy: TaxPolicy }> = {
  "all low": { description: "Low taxes everywhere.", policy: () => "low" },
  "all normal": { description: "Normal taxes everywhere.", policy: () => "normal" },
  "all high": { description: "High taxes everywhere.", policy: () => "high" },
  "grow, then tax": {
    description: "Low taxes until a city has the people for its next level, high after.",
    policy: (_state, city) => (readyToAdvance(city) ? "high" : "low"),
  },
  "grow, then normal": {
    description: "Low taxes until a city has the people for its next level, normal after.",
    policy: (_state, city) => (readyToAdvance(city) ? "normal" : "low"),
  },
  "the AI": {
    description: "The AI's own choice in peacetime: normal taxes, high in a city at its capacity (it can't grow anyway).",
    policy: (state, city) => aiTaxRate(state, city, getFaction(state, city.owner)?.gold ?? 0, false) ?? city.taxRate,
  },
};

/** One faction's economy at the end of a turn of the model. */
export interface EconomyTurn {
  /** Gold its cities have paid in so far, before anything is spent. */
  earned: number;
  treasury: number;
  people: number;
  /** Its cities at the top level. */
  topLevelCities: number;
}

/**
 * Runs a faction's economy forward in peace: each turn it sets its taxes by
 * the policy, queues a building in each idle city in the AI's peacetime
 * order (keeping the AI's reserve), then collects income, grows and builds.
 */
export function runEconomy(ctx: GameContext, state: GameState, factionId: FactionId, turns: number, policy: TaxPolicy): EconomyTurn[] {
  let s = state;
  let earned = 0;
  const track: EconomyTurn[] = [];
  for (let turn = 0; turn < turns; turn++) {
    const cities = { ...s.cities };
    for (const city of citiesOf(s, factionId)) cities[city.id] = { ...city, taxRate: policy(s, city) };
    s = { ...s, cities };

    for (const { id } of citiesOf(s, factionId)) {
      if (s.cities[id].constructionQueue.length > 0) continue;
      for (const building of aiBuildOrder(s, id, false)) {
        const next = nextLevel(s.cities[id], building);
        const gold = getFaction(s, factionId)?.gold ?? 0;
        if (!next || gold < next.def.cost + AI.buildReserve) continue;
        if (canBuild(s, factionId, id, building).ok) {
          s = queueConstruction(s, factionId, id, building);
          break;
        }
      }
    }

    const before = getFaction(s, factionId)?.gold ?? 0;
    s = processCities(ctx, s, factionId);
    earned += (getFaction(s, factionId)?.gold ?? 0) - before;
    s = progressConstruction(s, factionId);
    track.push({
      earned,
      treasury: getFaction(s, factionId)?.gold ?? 0,
      people: factionPopulation(s, factionId),
      topLevelCities: citiesOf(s, factionId).filter((c) => c.buildings.government === MAX_CITY_LEVEL).length,
    });
  }
  return track;
}

/** Every living faction's economy under one tax policy, added together turn by turn. */
export function worldEconomy(ctx: GameContext, state: GameState, turns: number, policy: TaxPolicy): EconomyTurn[] {
  const tracks = state.factions.filter((f) => f.alive).map((f) => runEconomy(ctx, state, f.id, turns, policy));
  return Array.from({ length: turns }, (_, t) => ({
    earned: tracks.reduce((n, tr) => n + tr[t].earned, 0),
    treasury: tracks.reduce((n, tr) => n + tr[t].treasury, 0),
    people: tracks.reduce((n, tr) => n + tr[t].people, 0),
    topLevelCities: tracks.reduce((n, tr) => n + tr[t].topLevelCities, 0),
  }));
}

/**
 * What each fate of a conquered city is worth to its conqueror, turn by turn:
 * the plunder plus everything its cities earn afterwards, on normal taxes.
 */
export function settlementValues(
  ctx: GameContext,
  state: GameState,
  cityId: CityId,
  conqueror: FactionId,
  turns: number,
): Record<SettlementChoice, number[]> {
  const taken = captureCity(state, cityId, conqueror);
  const gold = getFaction(taken, conqueror)?.gold ?? 0;
  const values = {} as Record<SettlementChoice, number[]>;
  for (const choice of SETTLEMENT_ORDER) {
    const settled = settleCity(taken, conqueror, cityId, choice);
    const plunder = (getFaction(settled, conqueror)?.gold ?? 0) - gold;
    values[choice] = runEconomy(ctx, settled, conqueror, turns, () => "normal").map((t) => t.earned + plunder);
  }
  return values;
}

/** The owner of the nearest city that isn't this city's: who'd take it. */
export function likelyConqueror(ctx: GameContext, state: GameState, city: City): FactionId {
  return Object.values(state.cities)
    .filter((c) => c.owner !== city.owner)
    .sort((a, b) => ctx.topology.distance(a.tile, city.tile) - ctx.topology.distance(b.tile, city.tile))[0].owner;
}

/** The first turn (1-based) on which `a` is ahead of `b`, or null if it never gets there. */
export function overtakes(a: readonly number[], b: readonly number[]): number | null {
  const turn = a.findIndex((value, i) => value > b[i]);
  return turn < 0 ? null : turn + 1;
}
