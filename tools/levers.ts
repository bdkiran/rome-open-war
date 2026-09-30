/**
 * Levers report: what the economy's choices are worth, measured with the
 * real rules. Use it before and after tuning taxes (src/data/economy.ts),
 * conquest (src/data/conquest.ts) or the AI's economic choices
 * (src/data/ai.ts), and compare.
 *
 *   npm run levers                        # horizons up to 100 turns
 *   npm run levers -- --turns 150 --from 60 --seed 7
 *
 * 1. Taxes: every faction runs its economy from the start of the game under
 *    each tax policy, in peace, building up as the AI does (tools/economy.ts).
 * 2. Conquest: every city in a real game at turn --from (default 50) is taken
 *    by its nearest rival and settled each way; which choice has earned the
 *    most by each horizon, and when occupying overtakes the others.
 * 3. The AI: what it actually chooses over a whole AI-vs-AI game.
 */
import type { GameContext } from "@/core/context.js";
import { createGame } from "@/core/setup.js";
import type { GameState } from "@/core/state.js";
import { SETTLEMENT_ORDER, type SettlementChoice } from "@/data/conquest.js";
import type { TaxRate } from "@/data/economy.js";
import { ROMAN_WORLD } from "@/data/scenarios/romanWorld.js";
import { likelyConqueror, overtakes, settlementValues, TAX_POLICIES, worldEconomy } from "./economy.js";
import { simulate } from "./simulation.js";

const args = process.argv.slice(2);
const option = (name: string, fallback: number) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? Number(args[at + 1]) : fallback;
};
const turns = option("turns", 100);
const from = option("from", 50);
const seed = option("seed", ROMAN_WORLD.seed);
const horizons = [5, 10, 25, 50, 100, 150, 200].filter((h) => h <= turns);
const k = (n: number) => `${Math.round(n / 1000)}k`;
const turnOf = (t: number | null) => (t === null ? `not within ${turns}` : `turn ${t}`);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

// ---- 1. Taxes ---------------------------------------------------------------

const scenario = { ...ROMAN_WORLD, seed };
const map = scenario.mapEngine.createMap();
const ctx: GameContext = { topology: map.topology };
const start = createGame(ctx, map, scenario);

console.log(`TAXES: every faction from the start, in peace, building up as the AI does. Gold earned by all factions.`);
const curves: Record<string, number[]> = {};
const taxRows: Record<string, Record<string, string | number>> = {};
for (const [name, { policy }] of Object.entries(TAX_POLICIES)) {
  const track = worldEconomy(ctx, start, turns, policy);
  curves[name] = track.map((t) => t.earned);
  const row: Record<string, string | number> = {};
  for (const h of horizons.filter((h) => h >= 25)) row[`gold@${h}`] = k(track[h - 1].earned);
  row[`level 3@${turns}`] = track[turns - 1].topLevelCities;
  row[`people@${turns}`] = k(track[turns - 1].people);
  taxRows[name] = row;
}
console.table(taxRows);
for (const [name, { description }] of Object.entries(TAX_POLICIES)) console.log(`  ${name}: ${description}`);
console.log("When one policy's gold overtakes another's:");
for (const [a, b] of [
  ["all normal", "all high"],
  ["grow, then tax", "all high"],
  ["grow, then tax", "all normal"],
  ["grow, then normal", "all normal"],
  ["the AI", "all normal"],
  ["all low", "all normal"],
]) {
  console.log(`  ${a} overtakes ${b}: ${turnOf(overtakes(curves[a], curves[b]))}`);
}

// ---- 2. Conquest ------------------------------------------------------------

let midGame: GameState | undefined;
const played = simulate({ turns: Math.max(from, 1), seed, onRound: (s) => (s.turn === from ? (midGame = s) : undefined) });
const conquestState = midGame ?? played.state;

console.log(`\nCONQUEST: every city at turn ${conquestState.turn}, taken by its nearest rival. Which choice has earned the most (plunder + income after):`);
const wins: Record<SettlementChoice, Record<string, number>> = { occupy: {}, enslave: {}, exterminate: {} };
const breakEven: Record<"exterminate" | "enslave", (number | null)[]> = { exterminate: [], enslave: [] };
const cities = Object.values(conquestState.cities);
for (const city of cities) {
  const values = settlementValues(ctx, conquestState, city.id, likelyConqueror(ctx, conquestState, city), turns);
  for (const h of horizons) {
    const best = [...SETTLEMENT_ORDER].sort((a, b) => values[b][h - 1] - values[a][h - 1])[0];
    wins[best][`${h} turns`] = (wins[best][`${h} turns`] ?? 0) + 1;
  }
  breakEven.exterminate.push(overtakes(values.occupy, values.exterminate));
  breakEven.enslave.push(overtakes(values.occupy, values.enslave));
}
console.table(Object.fromEntries(SETTLEMENT_ORDER.map((c) => [c, Object.fromEntries(horizons.map((h) => [`${h} turns`, wins[c][`${h} turns`] ?? 0]))])));
for (const other of ["exterminate", "enslave"] as const) {
  const reached = breakEven[other].filter((t): t is number => t !== null);
  const never = breakEven[other].length - reached.length;
  console.log(
    `  Occupying overtakes ${other === "exterminate" ? "exterminating" : "enslaving"}: ` +
      (reached.length ? `median turn ${median(reached)}, range ${Math.min(...reached)}–${Math.max(...reached)}` : "never") +
      (never ? `; never within ${turns} turns for ${never} of ${cities.length} cities` : ""),
  );
}

// ---- 3. What the AI does ------------------------------------------------------

console.log(`\nTHE AI over a ${turns}-turn AI-vs-AI game:`);
const seen = new Set<number>();
const settled: Record<SettlementChoice, number> = { occupy: 0, enslave: 0, exterminate: 0 };
const taxTurns: Record<TaxRate, number> = { low: 0, normal: 0, high: 0 };
simulate({
  turns,
  seed,
  onRound: (s) => {
    for (const city of Object.values(s.cities)) {
      if (s.factions.find((f) => f.id === city.owner)?.controller === "ai") taxTurns[city.taxRate]++;
    }
    for (const entry of s.log) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      if (entry.text.includes(" occupied ")) settled.occupy++;
      else if (entry.text.includes(" enslaved ")) settled.enslave++;
      else if (entry.text.includes(" to the sword")) settled.exterminate++;
    }
  },
});
const cityTurns = Object.values(taxTurns).reduce((a, b) => a + b, 0);
console.log(`  Conquered cities: ${SETTLEMENT_ORDER.map((c) => `${settled[c]} ${c}`).join(", ")}`);
console.log(`  City-turns by tax rate: ${(Object.keys(taxTurns) as TaxRate[]).map((r) => `${r} ${Math.round((taxTurns[r] * 100) / Math.max(cityTurns, 1))}%`).join(", ")}`);
