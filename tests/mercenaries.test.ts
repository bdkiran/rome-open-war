/** Mercenaries: basic regiments hired at once from the supply of the territory an army stands in. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAction, type Action } from "@/core/actions.js";
import type { GameContext } from "@/core/context.js";
import { createGame } from "@/core/setup.js";
import { armyAt, currentFaction, updateFaction, type Army, type City, type GameState, type Regiment } from "@/core/state.js";
import { ROMAN_WORLD } from "@/data/scenarios/romanWorld.js";
import { MERCENARIES, UNITS, regimentSize } from "@/data/units.js";
import { mercenaryCost, mergeRegiments, regimentCost, upkeepFor } from "@/systems/armies.js";
import { canHire, canTopUp, territoryOf } from "@/systems/mercenaries.js";
import { canRetrain } from "@/systems/recruitment.js";

const map = ROMAN_WORLD.mapEngine.createMap();
const ctx: GameContext = { topology: map.topology };
const newGame = (): GameState => createGame(ctx, map, ROMAN_WORLD);
const roma = (s: GameState) => Object.values(s.cities).find((c) => c.name === "Roma")!;
const withCity = (s: GameState, city: City): GameState => ({ ...s, cities: { ...s.cities, [city.id]: city } });
const withGold = (s: GameState, gold: number) => updateFaction(s, "rome", (f) => ({ ...f, gold }));
const withArmy = (s: GameState, army: Army): GameState => ({ ...s, armies: { ...s.armies, [army.id]: army } });
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
/** A tile in Roma's territory, off the city, with nobody on it. */
function fieldTile(s: GameState): string {
  return Object.keys(s.regions).find((t) => s.regions[t] === roma(s).id && t !== roma(s).tile && !armyAt(s, t))!;
}
/** Rome's starting garrison, moved out into the field (one regiment, so there's room). */
function fieldArmy(s: GameState): { s: GameState; army: Army } {
  const garrison = armyAt(s, roma(s).tile)!;
  const army: Army = { ...garrison, tile: fieldTile(s), regiments: garrison.regiments.slice(0, 1) };
  return { s: withArmy(s, army), army };
}

describe("hiring mercenaries", () => {
  it("hires a basic regiment of any unit into an army in the field, for twice the gold, no people", () => {
    const start = fieldArmy(withGold(newGame(), 5000));
    let s = start.s;
    const people = roma(s).population;
    // Rome has no Stables, but cavalry can be hired.
    s = apply(s, "rome", { type: "hireMercenaries", tile: start.army.tile, unit: "cavalry" });
    assert.equal(mercenaryCost("cavalry"), regimentCost("cavalry").gold * MERCENARIES.goldMultiplier);
    assert.equal(s.factions.find((f) => f.id === "rome")!.gold, 5000 - mercenaryCost("cavalry"));
    assert.equal(roma(s).population, people);
    assert.equal(roma(s).mercenarySupply, MERCENARIES.supply - regimentSize("cavalry"));
    const hired = armyAt(s, start.army.tile)!.regiments.at(-1)!;
    assert.deepEqual([hired.unit, hired.tier, hired.soldiers, hired.mercenary, hired.movementLeft], ["cavalry", 1, 120, true, 0]);
    assert.equal(upkeepFor("cavalry", 120, 1, true), upkeepFor("cavalry", 120) * MERCENARIES.upkeepMultiplier);
  });

  it("needs an army there, or your own city; a besieged city can't hire", () => {
    const s = withGold(newGame(), 5000);
    assert.match(reason(canHire(s, "rome", fieldTile(s), "militia")), /none here/);
    const empty = { ...s, armies: Object.fromEntries(Object.entries(s.armies).filter(([, a]) => a.tile !== roma(s).tile)) };
    const hired = apply(empty, "rome", { type: "hireMercenaries", tile: roma(s).tile, unit: "militia" });
    assert.equal(armyAt(hired, roma(s).tile)!.regiments.length, 1);
    assert.match(reason(canHire(withCity(s, { ...roma(s), besiegedBy: "carthage" }), "rome", roma(s).tile, "militia")), /besieged/);
    assert.match(reason(canHire(withGold(s, -10), "rome", roma(s).tile, "militia")), /Costs/);
  });

  it("can hire in another faction's territory, from its supply", () => {
    let s = withGold(newGame(), 5000);
    const foreign = Object.values(s.cities).find((c) => c.owner !== "rome")!;
    const tile = Object.keys(s.regions).find((t) => s.regions[t] === foreign.id && t !== foreign.tile && !armyAt(s, t))!;
    const army: Army = { ...armyAt(s, roma(s).tile)!, tile };
    s = apply(withArmy({ ...s, armies: {} }, army), "rome", { type: "hireMercenaries", tile, unit: "spearmen" });
    assert.equal(territoryOf(s, tile)!.id, foreign.id);
    assert.equal(s.cities[foreign.id].mercenarySupply, MERCENARIES.supply - regimentSize("spearmen"));
  });

  it("stops when the territory's supply runs short, and refills it every round", () => {
    let s = fieldArmy(withGold(newGame(), 50_000)).s;
    const tile = fieldTile(newGame());
    // 440 soldiers: two regiments of militia, then not a third.
    s = apply(s, "rome", { type: "hireMercenaries", tile, unit: "militia" });
    s = apply(s, "rome", { type: "hireMercenaries", tile, unit: "militia" });
    assert.equal(roma(s).mercenarySupply, MERCENARIES.supply - 2 * regimentSize("militia"));
    assert.match(reason(canHire(s, "rome", tile, "cavalry")), /Only 0 mercenaries/);
    s = nextRomanTurn(s);
    assert.equal(roma(s).mercenarySupply, MERCENARIES.refillPerTurn);
    // Their movement comes back with the new turn.
    assert.equal(armyAt(s, tile)?.regiments.filter((r) => r.mercenary).every((r) => r.movementLeft === UNITS.militia.movement), true);
  });
});

describe("keeping mercenaries", () => {
  const damaged = (s: GameState, soldiers: number): { s: GameState; army: Army } => {
    const { s: next, army } = fieldArmy(s);
    const hired: Regiment = { ...army.regiments[0], id: "h1", unit: "spearmen", tier: 1, experience: 0, soldiers, mercenary: true };
    const withHired = { ...army, regiments: [...army.regiments, hired] };
    return { s: withArmy(next, withHired), army: withHired };
  };

  it("tops them up from the territory's supply at the hire price, never in a city's queue", () => {
    const { s, army } = damaged(withGold(newGame(), 5000), 80);
    const city = { ...roma(s) };
    const inCity = withArmy(s, { ...army, tile: city.tile });
    assert.match(reason(canRetrain(inCity, "rome", city.id, ["h1"])), /topped up/);
    const after = apply(s, "rome", { type: "topUpMercenaries", armyId: army.id });
    assert.equal(after.armies[army.id].regiments.find((r) => r.id === "h1")!.soldiers, regimentSize("spearmen"));
    assert.equal(roma(after).mercenarySupply, MERCENARIES.supply - 100);
    assert.equal(after.factions.find((f) => f.id === "rome")!.gold, 5000 - mercenaryCost("spearmen", 100));
  });

  it("tops up only as far as the supply goes", () => {
    let { s, army } = damaged(withGold(newGame(), 5000), 20);
    s = withCity(s, { ...roma(s), mercenarySupply: 60 });
    s = apply(s, "rome", { type: "topUpMercenaries", armyId: army.id });
    assert.equal(s.armies[army.id].regiments.find((r) => r.id === "h1")!.soldiers, 80);
    assert.equal(roma(s).mercenarySupply, 0);
    assert.match(reason(canTopUp(s, "rome", army.id)), /No mercenaries left/);
  });

  it("merges them only with mercenaries, and never deserts in debt", () => {
    const s = newGame();
    const army = armyAt(s, roma(s).tile)!;
    const base = { ...army.regiments[0], unit: "militia" as const, tier: 1 as const, experience: 0 };
    const hiredA = { ...base, id: "h1", soldiers: 100, mercenary: true as const };
    const hiredB = { ...base, id: "h2", soldiers: 100, mercenary: true as const };
    const trained = { ...base, id: "t1", soldiers: 100 };
    const merged = mergeRegiments({ ...s, armies: { [army.id]: { ...army, regiments: [hiredA, trained, hiredB] } } }, army.id).armies[army.id].regiments;
    assert.deepEqual(
      merged.map((r) => [r.id, r.soldiers, r.mercenary === true]).sort(),
      [["h1", 200, true], ["t1", 100, false]],
    );
    // A faction deep in debt keeps its mercenaries.
    let poor = withGold(withArmy(s, { ...army, regiments: [...army.regiments, hiredA] }), -5000);
    poor = nextRomanTurn(poor);
    assert.ok(Object.values(poor.armies).some((a) => a.regiments.some((r) => r.id === "h1")));
  });
});
