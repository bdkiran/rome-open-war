/** Regiment experience: levels, what they're worth, and how they're earned and diluted. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAction } from "@/core/actions.js";
import type { GameContext } from "@/core/context.js";
import { createGame } from "@/core/setup.js";
import type { Army, GameState, Regiment } from "@/core/state.js";
import { EXPERIENCE, experienceLevel, MAX_EXPERIENCE, MAX_EXPERIENCE_LEVEL } from "@/data/experience.js";
import { ROMAN_WORLD } from "@/data/scenarios/romanWorld.js";
import { regimentSize, unitStats, UNITS, type UnitType } from "@/data/units.js";
import { mergeRegiments } from "@/systems/armies.js";
import { resolveBattle } from "@/systems/combat.js";
import { processRecruitment } from "@/systems/recruitment.js";

const map = ROMAN_WORLD.mapEngine.createMap();
const ctx: GameContext = { topology: map.topology };
const newGame = (): GameState => createGame(ctx, map, ROMAN_WORLD);
let next = 0;
const regiment = (unit: UnitType, soldiers = regimentSize(unit), experience = 0): Regiment => ({
  id: `x${next++}`, unit, tier: 1, soldiers, experience, movementLeft: UNITS[unit].movement, pinned: false,
});

/** Two armies on neighbouring empty land, Rome's to attack. */
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

function fight(mine: Regiment[], theirs: Regiment[]): GameState {
  const { state, attacker, target } = standoff(mine, theirs);
  const result = applyAction(ctx, state, "rome", { type: "attack", armyId: attacker.id, regimentIds: mine.map((r) => r.id), target });
  assert.ok(result.ok, result.ok ? "" : result.reason);
  return result.state;
}
const found = (state: GameState, r: Regiment) => Object.values(state.armies).flatMap((a) => a.regiments).find((x) => x.id === r.id);

describe("experience levels", () => {
  it("rise at each threshold, up to the top level", () => {
    assert.equal(experienceLevel(0), 0);
    assert.equal(experienceLevel(EXPERIENCE.levels[0] - 1), 0);
    EXPERIENCE.levels.forEach((needed, i) => assert.equal(experienceLevel(needed), i + 1));
    assert.equal(experienceLevel(MAX_EXPERIENCE + 100), MAX_EXPERIENCE_LEVEL);
  });

  it("add +0.5 attack and armor each, on top of the tier", () => {
    const basic = unitStats("spearmen", 1);
    const veteran = unitStats("spearmen", 1, 6);
    assert.equal(veteran.attack, basic.attack + 3);
    assert.equal(veteran.armor, basic.armor + 3);
    assert.equal(veteran.ranged, basic.ranged);
    const elite = unitStats("spearmen", 3);
    assert.equal(unitStats("spearmen", 3, 2).attack, elite.attack + 1);
  });

  it("let a veteran regiment beat a raw one of the same size", () => {
    const field = { defenseBonus: 0, openGround: false };
    const raw = [{ unit: "spearmen" as const, soldiers: 180 }];
    assert.equal(resolveBattle([{ unit: "spearmen", soldiers: 180, experience: MAX_EXPERIENCE }], raw, field, null).attackerWins, true);
    // Attacking: a raw regiment doesn't beat the veteran.
    assert.equal(resolveBattle(raw, [{ unit: "spearmen", soldiers: 180, experience: MAX_EXPERIENCE }], field, null).attackerWins, false);
  });
});

describe("earning experience", () => {
  it("gives the winners more than the survivors who flee, and the dead nothing", () => {
    const mine = [regiment("spearmen"), regiment("spearmen"), regiment("spearmen")];
    const theirs = [regiment("spearmen"), regiment("spearmen")];
    const after = fight(mine, theirs);
    for (const r of mine) assert.equal(found(after, r)?.experience, EXPERIENCE.win);
    for (const r of theirs) {
      const left = found(after, r);
      if (left) assert.equal(left.experience, EXPERIENCE.loss);
    }
  });

  it("gives the bigger side nothing for beating a tiny enemy, though the tiny enemy learns", () => {
    const mine = [regiment("spearmen"), regiment("spearmen")];
    const theirs = [regiment("spearmen", 50)];
    const after = fight(mine, theirs);
    for (const r of mine) assert.equal(found(after, r)?.experience, 0);
  });

  it("stops at the cap", () => {
    const mine = [regiment("spearmen", 180, MAX_EXPERIENCE), regiment("spearmen", 180, MAX_EXPERIENCE)];
    const after = fight(mine, [regiment("spearmen", 180)]);
    for (const r of mine) assert.equal(found(after, r)?.experience, MAX_EXPERIENCE);
  });
});

describe("diluting experience", () => {
  it("averages it by soldiers when regiments merge", () => {
    const state = newGame();
    const old = regiment("spearmen", 60, 12);
    const fresh = regiment("spearmen", 60, 0);
    const army: Army = { id: "m", owner: "rome", tile: "0,0", regiments: [old, fresh], destination: null };
    const merged = mergeRegiments({ ...state, armies: { m: army } }, "m").armies.m.regiments;
    assert.equal(merged.length, 1);
    assert.equal(merged[0].experience, 6);
  });

  it("thins it when recruits fill a regiment back up", () => {
    const state = newGame();
    const city = Object.values(state.cities).find((c) => c.owner === "rome")!;
    const damaged = regiment("militia", regimentSize("militia") / 2, 10);
    const army: Army = { id: "g", owner: "rome", tile: city.tile, regiments: [damaged], destination: null };
    const queued: GameState = {
      ...state,
      armies: { g: army },
      cities: { ...state.cities, [city.id]: { ...city, recruitQueue: [{ kind: "retrain", unit: "militia", regimentId: damaged.id, soldiers: regimentSize("militia") / 2, cost: 1 }] } },
    };
    const after = processRecruitment(queued, "rome");
    const r = after.armies.g.regiments[0];
    assert.equal(r.soldiers, regimentSize("militia"));
    assert.equal(r.experience, 5);
  });
});
