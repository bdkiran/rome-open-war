/** The banner shown while an enemy's battle, siege or capture plays out. */
import assert from "node:assert/strict";
import { it } from "node:test";
import type { GameContext } from "@/core/context.js";
import { createGame } from "@/core/setup.js";
import type { BattleReport, GameState } from "@/core/state.js";
import { ROMAN_WORLD } from "@/data/scenarios/romanWorld.js";
import { describeStep } from "@/ui/playbackBanner.js";

const map = ROMAN_WORLD.mapEngine.createMap();
const ctx: GameContext = { topology: map.topology };
const before = createGame(ctx, map, ROMAN_WORLD);
const capua = Object.values(before.cities).find((c) => c.name === "Capua")!;

function withBattle(report: Partial<BattleReport>): GameState {
  const battle = {
    id: before.nextBattleNumber, turn: 1, tile: capua.tile, place: "at Capua", attacker: "greeks", defender: "rome",
    attackingArmies: 1, defendingArmies: 1, attackerLosses: 0, defenderLosses: 0, attackerWon: false,
    loserFled: false, defenseBonus: 0, rounds: 1, cityCaptured: null, ...report,
  } as BattleReport;
  return { ...before, battles: [...before.battles, battle], nextBattleNumber: before.nextBattleNumber + 1 };
}

it("names a battle, then its outcome, with no verb after a faction's name", () => {
  assert.deepEqual(describeStep(before, withBattle({})), { during: "Greeks vs Rome at Capua", outcome: "Capua holds" });
  assert.equal(describeStep(before, withBattle({ attackerWon: true, cityCaptured: "Capua" }))?.outcome, "Capua falls to Greeks");
  assert.equal(describeStep(before, withBattle({ place: "near Capua", attackerWon: true }))?.outcome, "Victory for Greeks near Capua");
  assert.equal(describeStep(before, withBattle({ place: "near Capua" }))?.outcome, "Victory for Rome near Capua");
});

it("names a siege or a capture without a battle, and nothing for a plain move", () => {
  const besieged = { ...before, cities: { ...before.cities, [capua.id]: { ...capua, besiegedBy: "carthage" } } };
  assert.deepEqual(describeStep(before, besieged), { during: null, outcome: "Capua besieged by Carthage" });
  const taken = { ...before, cities: { ...before.cities, [capua.id]: { ...capua, owner: "carthage" } } };
  assert.equal(describeStep(before, taken)?.outcome, "Capua falls to Carthage");
  assert.equal(describeStep(before, before), null);
});
