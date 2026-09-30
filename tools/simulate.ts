/**
 * Balance report: plays a whole AI-vs-AI game and prints how it went. Use it
 * before and after any change to the rules, the numbers in src/data/ or the
 * AI, to compare the numbers and check that the AI never issues an invalid
 * order, nobody ends up in debt, cities grow and advance, treasuries don't
 * pile up, and the war moves.
 *
 *   npm run simulate                              # 100 turns
 *   npm run simulate -- --turns 60 --garrison --seed 7
 *
 * --garrison gives the passive player a strong garrison in each city, so the
 * AIs fight each other instead of just overrunning the player.
 */
import { armiesOf, armySoldiers, citiesOf, type GameState } from "@/core/state.js";
import { factionUpkeep } from "@/systems/armies.js";
import { factionIncome } from "@/systems/cities.js";
import { simulate } from "./simulation.js";

const args = process.argv.slice(2);
const option = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? Number(args[at + 1]) : undefined;
};

const snapshotTurns = [25, 50, 75];
const out: string[] = [];
const summary = (state: GameState) =>
  state.factions
    .map((f) => {
      const soldiers = armiesOf(state, f.id).reduce((n, a) => n + armySoldiers(a), 0);
      const net = Math.round(factionIncome(state, f.id) - factionUpkeep(state, f.id));
      const fallen = f.alive ? "" : " (fallen)";
      return `  ${f.shortName}${fallen}: ${citiesOf(state, f.id).length} cities, ${soldiers} soldiers, ${f.gold} gold, ${net >= 0 ? "+" : ""}${net}/turn`;
    })
    .join("\n");

const result = simulate({
  turns: option("turns") ?? 100,
  seed: option("seed"),
  garrison: args.includes("--garrison"),
  onRound: (state) => {
    if (snapshotTurns.includes(state.turn)) out.push(`Turn ${state.turn}:\n${summary(state)}`);
  },
});

const { state } = result;
const cities = Object.values(state.cities);
const levels = [1, 2, 3].map((l) => cities.filter((c) => c.buildings.government === l).length);
const largest = [...cities].sort((a, b) => b.population - a.population);
const median = largest[Math.floor(largest.length / 2)].population;
const debt = state.factions.filter((f) => f.gold < 0);
const byType = Object.entries(result.actionsByType).sort((a, b) => b[1] - a[1]);

out.push(`Final (turn ${state.turn}):\n${summary(state)}`);
out.push(`City levels: ${levels[0]} at level 1, ${levels[1]} at level 2, ${levels[2]} at level 3`);
out.push(`Largest cities: ${largest.slice(0, 5).map((c) => `${c.name} ${c.population}`).join(", ")}; median ${median}`);
out.push(
  `AI: ${result.actions} actions in ${(result.ms / 1000).toFixed(1)}s ` +
    `(${(result.ms / Math.max(result.actions, 1)).toFixed(2)} ms each), ` +
    `most in one turn ${result.mostActionsInOneTurn}, INVALID ${result.invalid.length}`,
);
out.push(`Actions by type: ${byType.map(([t, n]) => `${t} ${n}`).join(", ")}`);
out.push(`In debt: ${debt.length ? debt.map((f) => `${f.shortName} ${f.gold}`).join(", ") : "nobody"}`);
for (const line of [...result.invalid, ...result.stuck.map((s) => `STUCK ${s}`)]) out.push(line);

console.log(out.join("\n"));
const aiDebt = debt.filter((f) => f.controller === "ai");
process.exitCode = result.invalid.length || result.stuck.length || aiDebt.length ? 1 : 0;
