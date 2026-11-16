/** Generals: their bodyguard, their traits, how they're gained and lost, and one per army. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAction } from "@/core/actions.js";
import type { GameContext } from "@/core/context.js";
import type { Rng } from "@/core/rng.js";
import { createGame } from "@/core/setup.js";
import type { Army, GameState, Regiment } from "@/core/state.js";
import { EXPERIENCE } from "@/data/experience.js";
import { GENERALS, type GeneralTrait } from "@/data/generals.js";
import { ROMAN_WORLD } from "@/data/scenarios/romanWorld.js";
import { regimentSize, UNITS, type UnitType } from "@/data/units.js";
import { canMove, refreshMovement, regimentUpkeep } from "@/systems/armies.js";
import { resolveBattle, routLosses, type Battlefield } from "@/systems/combat.js";
import { generalCap, generalCount, leadershipOf, replenishBodyguards, rewardVictors, strikeGenerals } from "@/systems/generals.js";
import { canRetrain } from "@/systems/recruitment.js";
import { brokenRules } from "./invariants.js";

const map = ROMAN_WORLD.mapEngine.createMap();
const ctx: GameContext = { topology: map.topology };
const newGame = (): GameState => createGame(ctx, map, ROMAN_WORLD);
let next = 0;
const regiment = (unit: UnitType, soldiers = regimentSize(unit), experience = 0): Regiment => ({
  id: `x${next++}`, unit, tier: 1, soldiers, experience, movementLeft: UNITS[unit].movement, pinned: false,
});
const general = (traits: GeneralTrait[], soldiers: number = GENERALS.bodyguardSize): Regiment => ({
  ...regiment("bodyguard", soldiers), general: { name: "Testus", traits },
});
/** Dice that always roll the same. */
const dice = (value: number): Rng => ({ next: () => value, state: 0 });
const open: Battlefield = { defenseBonus: 0, openGround: true };
const line = () => [regiment("spearmen"), regiment("spearmen"), regiment("militia")];

/** Two armies on neighbouring empty plains, Rome's to attack. */
function standoff(mine: Regiment[], theirs: Regiment[]): { state: GameState; attacker: Army; target: string } {
  const state = newGame();
  const occupied = new Set([...Object.values(state.cities).map((c) => c.tile), ...Object.values(state.armies).map((a) => a.tile)]);
  const free = (t: string) => map.tiles[t].terrain === "plains" && !occupied.has(t);
  const from = ctx.topology.allTiles().find((t) => free(t) && ctx.topology.neighbors(t).some((n) => free(n) && ctx.topology.distance(t, n) === 1
    && ctx.topology.neighbors(n).every((m) => m === t || !occupied.has(m))))!;
  const target = ctx.topology.neighbors(from).find((n) => free(n) && ctx.topology.distance(from, n) === 1)!;
  const attacker: Army = { id: "a", owner: "rome", tile: from, regiments: mine, destination: null };
  const defender: Army = { id: "d", owner: "carthage", tile: target, regiments: theirs, destination: null };
  return { state: { ...state, armies: { a: attacker, d: defender } }, attacker, target };
}

describe("a general's traits", () => {
  it("Fierce: his side deals more in melee", () => {
    const plain = resolveBattle([general(["wary"]), ...line()], line(), open, null);
    const fierce = resolveBattle([general(["fierce"]), ...line()], line(), open, null);
    assert.ok(fierce.attackerWins);
    assert.ok(fierce.attackerLosses < plain.attackerLosses, `${fierce.attackerLosses} vs ${plain.attackerLosses}`);
  });

  it("Stubborn: his side takes less when it defends, and nothing more when it attacks", () => {
    const plain = resolveBattle(line(), [general(["wary"]), ...line()], open, null);
    const stubborn = resolveBattle(line(), [general(["stubborn"]), ...line()], open, null);
    assert.ok(!stubborn.attackerWins);
    assert.ok(stubborn.defenderLosses < plain.defenderLosses);
    const attacking = resolveBattle([general(["stubborn"]), ...line()], line(), open, null);
    const attackingPlain = resolveBattle([general(["wary"]), ...line()], line(), open, null);
    assert.equal(attacking.attackerLosses, attackingPlain.attackerLosses);
  });

  it("Besieger: walls count less when he storms, but never below none", () => {
    const walled: Battlefield = { defenseBonus: 0.4, openGround: false, walls: 0.3 };
    const plain = resolveBattle([general(["wary"]), ...line()], line(), walled, null);
    const besieger = resolveBattle([general(["besieger"]), ...line()], line(), walled, null);
    assert.ok(besieger.defenderLosses > plain.defenderLosses);
    const noWalls: Battlefield = { defenseBonus: 0.4, openGround: false, walls: 0 };
    assert.deepEqual(
      resolveBattle([general(["besieger"]), ...line()], line(), noWalls, null),
      resolveBattle([general(["wary"]), ...line()], line(), noWalls, null),
    );
  });

  it("Wary: his beaten army loses fewer while it flees", () => {
    assert.equal(leadershipOf([general(["wary"])]).routFactor, GENERALS.wary);
    assert.equal(routLosses(1000, [], GENERALS.wary), Math.round(routLosses(1000, []) * GENERALS.wary));
  });

  it("Swift: his army moves further, never past the cap", () => {
    const state = newGame();
    const capital = Object.values(state.cities).find((c) => c.owner === "rome" && c.isCapital)!;
    const army: Army = { id: "s", owner: "rome", tile: capital.tile, regiments: [general(["swift"]), regiment("spearmen"), regiment("cavalry")], destination: null };
    const refreshed = refreshMovement({ ...state, armies: { s: army } }, "rome").armies.s.regiments;
    assert.equal(refreshed[1].movementLeft, Math.min(GENERALS.swiftCap, UNITS.spearmen.movement + GENERALS.swift));
    assert.equal(refreshed[2].movementLeft, UNITS.cavalry.movement);
    assert.equal(refreshed[0].movementLeft, GENERALS.swiftCap);
  });

  it("Drillmaster: his regiments earn more from a battle that counts", () => {
    const spear = regiment("spearmen");
    const { state, attacker, target } = standoff([general(["drillmaster"]), spear, regiment("spearmen")], [regiment("militia")]);
    const result = applyAction(ctx, state, "rome", { type: "attack", armyId: attacker.id, regimentIds: attacker.regiments.map((r) => r.id), target });
    assert.ok(result.ok);
    const after = Object.values(result.state.armies).flatMap((a) => a.regiments).find((r) => r.id === spear.id)!;
    assert.equal(after.experience, EXPERIENCE.win + GENERALS.drillmaster);
  });
});

describe("gaining and losing generals", () => {
  it("a winning army without one may gain one, with a full bodyguard and a trait", () => {
    const { state } = standoff(line(), line());
    const won = rewardVictors(state, dice(0), "a", state.armies.a.regiments, "near here");
    const guard = won.armies.a.regiments.find((r) => r.general)!;
    assert.equal(guard.unit, "bodyguard");
    assert.equal(guard.soldiers, GENERALS.bodyguardSize);
    assert.equal(guard.general!.traits.length, 1);
    assert.equal(won.nextRegimentNumber, state.nextRegimentNumber + 1);
    assert.ok(won.log.at(-1)!.major);
    assert.deepEqual(brokenRules(won), []);
    // Without the luck, no general.
    assert.equal(rewardVictors(state, dice(0.99), "a", state.armies.a.regiments, "").armies.a.regiments.length, 3);
  });

  it("not past the cap, not into a full army, and not a second one", () => {
    const { state } = standoff(line(), line());
    const cap = generalCap(state, "rome");
    const crowded: GameState = { ...state, armies: { ...state.armies, a: { ...state.armies.a, regiments: Array.from({ length: 10 }, () => regiment("militia")) } } };
    assert.equal(rewardVictors(crowded, dice(0), "a", [], "").armies.a.regiments.length, 10);
    const led = { ...state, armies: { ...state.armies, a: { ...state.armies.a, regiments: [general(["fierce"], 60), ...line()] } } };
    assert.equal(generalCount(rewardVictors(led, dice(0.99), "a", [], ""), "rome"), 1);
    const many: Army[] = Array.from({ length: cap }, (_, i) => ({ id: `g${i}`, owner: "rome", tile: `far${i}`, regiments: [general(["wary"])], destination: null }));
    const capped: GameState = { ...state, armies: { ...state.armies, ...Object.fromEntries(many.map((a) => [a.id, a])) } };
    assert.equal(generalCount(rewardVictors(capped, dice(0), "a", [], ""), "rome"), cap);
  });

  it("a winning general may learn a trait he doesn't have", () => {
    const { state } = standoff([general(["fierce"]), ...line()], line());
    const taught = rewardVictors(state, dice(0), "a", state.armies.a.regiments, "");
    const traits = taught.armies.a.regiments[0].general!.traits;
    assert.equal(traits.length, 2);
    assert.equal(new Set(traits).size, 2);
  });

  it("he dies with his bodyguard, and both sides hear of it", () => {
    const { state, attacker, target } = standoff([general(["fierce"], 10), regiment("militia", 30)], [regiment("spearmen"), regiment("spearmen"), regiment("spearmen")]);
    const result = applyAction(ctx, state, "rome", { type: "attack", armyId: attacker.id, regimentIds: attacker.regiments.map((r) => r.id), target });
    assert.ok(result.ok);
    assert.equal(generalCount(result.state, "rome"), 0);
    const entry = result.state.log.find((e) => e.text.startsWith("Testus fell"))!;
    assert.ok(entry.major);
    assert.deepEqual(entry.factions, ["rome", "carthage"]);
  });

  it("any general who fights may fall by chance, his bodyguard with him", () => {
    const { state } = standoff([general(["fierce"]), ...line()], [general(["wary"])]);
    const fought = [...state.armies.a.regiments, ...state.armies.d.regiments];
    assert.equal(strikeGenerals(state, dice(0.99), fought), state);
    const struck = strikeGenerals(state, dice(0), fought);
    assert.equal(struck.armies.a.regiments.length, 3);
    assert.ok(!struck.armies.a.regiments.some((r) => r.general));
    assert.equal(struck.armies.d, undefined, "a lone general's army goes with him");
    assert.deepEqual(brokenRules(struck), []);
  });

  it("a side that lost a general in the battle doesn't raise a new one from it", () => {
    const { state } = standoff([general(["fierce"]), ...line()], line());
    const fallen = state.armies.a.regiments;
    const without = { ...state, armies: { ...state.armies, a: { ...state.armies.a, regiments: line() } } };
    assert.equal(generalCount(rewardVictors(without, dice(0), "a", fallen, ""), "rome"), 0);
  });

  it("his bodyguard refills a little each turn, free, and costs his flat wages", () => {
    const { state } = standoff([general(["wary"], 50)], line());
    const once = replenishBodyguards(state, "rome");
    assert.equal(once.armies.a.regiments[0].soldiers, 50 + GENERALS.bodyguardRefill);
    assert.equal(replenishBodyguards(replenishBodyguards(once, "rome"), "rome").armies.a.regiments[0].soldiers, GENERALS.bodyguardSize);
    assert.equal(regimentUpkeep(state.armies.a.regiments[0]), GENERALS.wages);
  });
});

describe("several generals", () => {
  it("can share an army, moving onto one another, but only the leader's traits count", () => {
    const { state } = standoff([general(["wary"])], line());
    const tile = ctx.topology.neighbors(state.armies.a.tile).find((n) => n !== state.armies.d.tile && map.tiles[n].terrain === "plains")!;
    const other: Army = { id: "b", owner: "rome", tile, regiments: [general(["fierce", "wary"])], destination: null };
    const both: GameState = { ...state, armies: { ...state.armies, b: other } };
    const ids = both.armies.a.regiments.map((r) => r.id);
    assert.ok(canMove(ctx, both, "rome", "a", ids, tile).ok);
    // The one with more traits leads, wherever he stands.
    const lead = leadershipOf([...both.armies.a.regiments, ...other.regiments]);
    assert.equal(lead.meleeDealt, 1 + GENERALS.fierce);
    assert.equal(lead.routFactor, GENERALS.wary);
    // With as many traits, the more experienced leads; then the first.
    const veteran = { ...general(["fierce"]), experience: 3 };
    assert.equal(leadershipOf([general(["wary"]), veteran]).meleeDealt, 1 + GENERALS.fierce);
    assert.equal(leadershipOf([general(["wary"]), general(["fierce"])]).meleeDealt, 1);
  });

  it("his bodyguard can't be retrained in a city", () => {
    const state = newGame();
    const capital = Object.values(state.cities).find((c) => c.owner === "rome" && c.isCapital)!;
    const garrison = Object.values(state.armies).find((a) => a.tile === capital.tile)!;
    const guard = general(["wary"], 30);
    const led: GameState = { ...state, armies: { ...state.armies, [garrison.id]: { ...garrison, regiments: [...garrison.regiments, guard] } } };
    assert.ok(!canRetrain(led, "rome", capital.id, [guard.id]).ok);
  });
});
