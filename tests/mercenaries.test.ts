/** Mercenaries: regiments hired at once for gold in a city with a Market. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAction, type Action } from "@/core/actions.js";
import type { GameContext } from "@/core/context.js";
import { createGame } from "@/core/setup.js";
import { armyAt, currentFaction, updateFaction, type City, type GameState } from "@/core/state.js";
import { ROMAN_WORLD } from "@/data/scenarios/romanWorld.js";
import { MERCENARIES, UNITS, regimentSize } from "@/data/units.js";
import { factionUpkeep, mercenaryCost, mergeRegiments, regimentCost, upkeepFor } from "@/systems/armies.js";
import { canHire, hiresLeft, mercenariesDesert } from "@/systems/mercenaries.js";
import { retrainCost } from "@/systems/recruitment.js";

const map = ROMAN_WORLD.mapEngine.createMap();
const ctx: GameContext = { topology: map.topology };
const newGame = (): GameState => createGame(ctx, map, ROMAN_WORLD);
const roma = (s: GameState) => Object.values(s.cities).find((c) => c.name === "Roma")!;
const withCity = (s: GameState, city: City): GameState => ({ ...s, cities: { ...s.cities, [city.id]: city } });
const withMarket = (s: GameState, level: number, extra: Partial<City["buildings"]> = {}) =>
  withCity(s, { ...roma(s), buildings: { ...roma(s).buildings, market: level, ...extra } });
const withGold = (s: GameState, gold: number) => updateFaction(s, "rome", (f) => ({ ...f, gold }));
const apply = (s: GameState, faction: string, action: Action) => {
  const r = applyAction(ctx, s, faction, action);
  assert.ok(r.ok, r.ok ? "" : r.reason);
  return r.state;
};
const reason = (c: { ok: boolean; reason?: string }) => (c.ok ? "" : c.reason ?? "");
/** Every faction ends its turn until it's Rome's again. */
function nextRomanTurn(s: GameState): GameState {
  let next = apply(s, "rome", { type: "endTurn" });
  while (currentFaction(next).id !== "rome") next = apply(next, currentFaction(next).id, { type: "endTurn" });
  return next;
}

describe("hiring mercenaries", () => {
  it("needs a Market", () => {
    const s = withGold(newGame(), 5000);
    assert.match(reason(canHire(s, "rome", roma(s).id, "militia")), /Market/);
  });

  it("costs twice the gold and upkeep of a basic regiment, and no people", () => {
    let s = withGold(withMarket(newGame(), 1, { spearYard: 1 }), 5000);
    const people = roma(s).population;
    const before = armyAt(s, roma(s).tile)!.regiments.length;
    s = apply(s, "rome", { type: "hireMercenaries", cityId: roma(s).id, unit: "spearmen" });
    assert.equal(mercenaryCost("spearmen"), regimentCost("spearmen").gold * MERCENARIES.goldMultiplier);
    assert.equal(s.factions.find((f) => f.id === "rome")!.gold, 5000 - mercenaryCost("spearmen"));
    assert.equal(roma(s).population, people);
    const army = armyAt(s, roma(s).tile)!;
    assert.equal(army.regiments.length, before + 1);
    const hired = army.regiments[army.regiments.length - 1];
    assert.deepEqual([hired.unit, hired.tier, hired.soldiers, hired.mercenary, hired.movementLeft], ["spearmen", 1, 180, true, 0]);
    assert.equal(
      upkeepFor("spearmen", 180, 1, true),
      upkeepFor("spearmen", 180) * MERCENARIES.upkeepMultiplier,
    );
  });

  it("hires only what the city could train, and only basic", () => {
    const s = withGold(withMarket(newGame(), 3), 5000);
    assert.equal(canHire(s, "rome", roma(s).id, "militia").ok, true);
    assert.match(reason(canHire(s, "rome", roma(s).id, "cavalry")), /Stables/);
  });

  it("allows as many hires a turn as the Market's level, and more next turn", () => {
    for (const level of [1, 2, 3]) {
      let s = withGold(withMarket(newGame(), level), 50_000);
      // Room in the army for them all.
      const army = armyAt(s, roma(s).tile)!;
      s = { ...s, armies: { ...s.armies, [army.id]: { ...army, regiments: army.regiments.slice(0, 1) } } };
      for (let i = 0; i < level; i++) s = apply(s, "rome", { type: "hireMercenaries", cityId: roma(s).id, unit: "militia" });
      assert.equal(hiresLeft(roma(s)), 0);
      assert.match(reason(canHire(s, "rome", roma(s).id, "militia")), /hired all it can/);
      s = nextRomanTurn(s);
      assert.equal(hiresLeft(roma(s)), level, `level ${level}`);
    }
  });

  it("is blocked while besieged or in debt", () => {
    const s = withMarket(newGame(), 1);
    assert.match(reason(canHire(withCity(s, { ...roma(s), besiegedBy: "carthage" }), "rome", roma(s).id, "militia")), /besieged/);
    assert.match(reason(canHire(withGold(s, -10), "rome", roma(s).id, "militia")), /Costs/);
  });

  it("can move them on the turn after they're hired", () => {
    let s = withGold(withMarket(newGame(), 1), 5000);
    s = apply(s, "rome", { type: "hireMercenaries", cityId: roma(s).id, unit: "militia" });
    s = nextRomanTurn(s);
    const hired = Object.values(s.armies).flatMap((a) => a.regiments).find((r) => r.mercenary)!;
    assert.equal(hired.movementLeft, UNITS.militia.movement);
  });
});

describe("keeping mercenaries", () => {
  it("retrains them at the hire price, and merges them only with mercenaries", () => {
    const s = newGame();
    const army = armyAt(s, roma(s).tile)!;
    const base = { ...army.regiments[0], unit: "militia" as const, tier: 1 as const, experience: 0 };
    const hiredA = { ...base, id: "h1", soldiers: 100, mercenary: true as const };
    const hiredB = { ...base, id: "h2", soldiers: 100, mercenary: true as const };
    const trained = { ...base, id: "t1", soldiers: 100 };
    assert.equal(retrainCost(hiredA), mercenaryCost("militia", regimentSize("militia") - 100));
    const merged = mergeRegiments({ ...s, armies: { [army.id]: { ...army, regiments: [hiredA, trained, hiredB] } } }, army.id).armies[army.id].regiments;
    assert.deepEqual(
      merged.map((r) => [r.id, r.soldiers, r.mercenary === true]).sort(),
      [["h1", 200, true], ["t1", 100, false]],
    );
  });

  it("loses the dearest mercenary regiment each turn the faction ends in debt", () => {
    const s = newGame();
    const army = armyAt(s, roma(s).tile)!;
    const base = { ...army.regiments[0], tier: 1 as const, experience: 0, mercenary: true as const };
    const regiments = [
      { ...base, id: "m1", unit: "militia" as const, soldiers: regimentSize("militia") },
      { ...base, id: "m2", unit: "cavalry" as const, soldiers: regimentSize("cavalry") },
      ...army.regiments,
    ];
    let next = { ...s, armies: { ...s.armies, [army.id]: { ...army, regiments } } };
    assert.ok(factionUpkeep(next, "rome") > factionUpkeep(s, "rome"));
    // Not in debt: nobody leaves.
    assert.equal(mercenariesDesert(next, "rome"), next);
    next = mercenariesDesert(withGold(next, -5), "rome");
    assert.deepEqual(armyAt(next, roma(next).tile)!.regiments.map((r) => r.id), ["m1", ...army.regiments.map((r) => r.id)]);
    next = mercenariesDesert(next, "rome");
    assert.deepEqual(armyAt(next, roma(next).tile)!.regiments.map((r) => r.id), army.regiments.map((r) => r.id));
    // No mercenaries left: trained regiments stay.
    assert.equal(mercenariesDesert(next, "rome"), next);
  });
});
