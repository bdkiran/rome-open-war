/** Public order: its target and what makes it up, its bands' effects, revolts, and a fallen capital passing on. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GameContext } from "@/core/context.js";
import { createGame } from "@/core/setup.js";
import { armyAt, citiesOf, type City, type GameState } from "@/core/state.js";
import { ORDER } from "@/data/order.js";
import { REBELS } from "@/data/rebels.js";
import { ROMAN_WORLD } from "@/data/scenarios/romanWorld.js";
import { regimentSize } from "@/data/units.js";
import { captureCity, cityStats } from "@/systems/cities.js";
import { canTrain } from "@/systems/recruitment.js";
import { rebelRegiments } from "@/systems/rebels.js";
import { brokenRules } from "./invariants.js";
import { conquestMalus, distanceMalus, garrisonOrder, orderTarget, processOrder, revolt, soldiersForOrder } from "@/systems/order.js";

function newGame(): { ctx: GameContext; state: GameState } {
  const map = ROMAN_WORLD.mapEngine.createMap();
  const ctx: GameContext = { topology: map.topology };
  return { ctx, state: createGame(ctx, map, ROMAN_WORLD) };
}

const byName = (state: GameState, name: string): City => Object.values(state.cities).find((c) => c.name === name)!;

function withCity(state: GameState, city: City, change: Partial<City>): GameState {
  return { ...state, cities: { ...state.cities, [city.id]: { ...state.cities[city.id], ...change } } };
}

/** The state with no army in a city. */
function emptied(state: GameState, city: City): GameState {
  const army = armyAt(state, city.tile);
  if (!army) return state;
  const armies = { ...state.armies };
  delete armies[army.id];
  return { ...state, armies };
}

/** The state with a garrison of so many militia regiments in a city, for its owner. */
function garrisoned(state: GameState, city: City, regiments: number): GameState {
  const cleared = emptied(state, city);
  const regs = Array.from({ length: regiments }, (_, i) => ({
    id: `test-${city.id}-${i}`,
    unit: "militia" as const,
    tier: 1 as const,
    soldiers: regimentSize("militia"),
    experience: 0,
    movementLeft: 0,
    pinned: false,
  }));
  const army = { id: `test-${city.id}`, owner: city.owner, tile: city.tile, destination: null, regiments: regs };
  return { ...cleared, armies: { ...cleared.armies, [army.id]: army } };
}

describe("the order target", () => {
  it("adds up its causes, and every city starts at the base", () => {
    const { ctx, state } = newGame();
    for (const city of Object.values(state.cities)) assert.equal(city.order, ORDER.base);
    const roma = byName(state, "Roma");
    const t = orderTarget(ctx, state, roma, { soldiers: 0 });
    assert.equal(t.capital, ORDER.capital);
    assert.equal(t.distance, 0, "the capital pays no distance");
    assert.equal(t.conquered, 0);
    assert.equal(t.total, Math.round(Math.min(100, t.base + t.taxes + t.capital + t.garrison)));
    const high = orderTarget(ctx, state, roma, { taxRate: "high", soldiers: 0 });
    assert.equal(t.total - high.total, -ORDER.taxes.high, "high taxes lower it");
  });

  it("counts a garrison against the city's size", () => {
    assert.equal(garrisonOrder(100, 10_000), ORDER.garrisonPerPercent, "1% under arms");
    assert.equal(garrisonOrder(100, 20_000), ORDER.garrisonPerPercent / 2, "the same soldiers count half in a city twice the size");
    assert.equal(garrisonOrder(0, 10_000), 0);
  });

  it("works out the soldiers a city needs for an order", () => {
    const { ctx, state: start } = newGame();
    const capua = byName(start, "Capua");
    const state = withCity(start, capua, { population: 10_000, conqueredOn: start.turn, formerOwner: "samnites" });
    const city = state.cities[capua.id];
    const soldiers = soldiersForOrder(ctx, state, city, ORDER.bands.content);
    assert.ok(soldiers > 0);
    assert.ok(orderTarget(ctx, state, city, { soldiers }).total >= ORDER.bands.content);
    assert.ok(orderTarget(ctx, state, city, { soldiers: soldiers - 40 }).total < ORDER.bands.content);
  });

  it("charges for distance from the capital beyond the free radius", () => {
    const { free, tilesPerPoint, max } = ORDER.distance;
    assert.equal(distanceMalus(free), 0);
    assert.equal(distanceMalus(free + tilesPerPoint), -1);
    assert.equal(distanceMalus(free + 100 * tilesPerPoint), max);
  });

  it("fades a conquest's malus evenly, whatever the fate", () => {
    const { state } = newGame();
    const city = { ...byName(state, "Capua"), conqueredOn: 10, formerOwner: "samnites" };
    const fade = ORDER.conquestFadeTurns;
    assert.equal(conquestMalus({ ...state, turn: 10 }, city), ORDER.conquered);
    assert.equal(conquestMalus({ ...state, turn: 10 + fade / 2 }, city), ORDER.conquered / 2);
    assert.equal(conquestMalus({ ...state, turn: 10 + fade }, city), 0);
    assert.equal(conquestMalus({ ...state, turn: 10 + 3 * fade }, city), 0);
  });

  it("moves order a step at a time toward the target", () => {
    const { ctx, state: start } = newGame();
    const capua = byName(start, "Capua");
    const state = withCity(start, capua, { taxRate: "high", order: 60 });
    const target = orderTarget(ctx, state, state.cities[capua.id]).total;
    const next = processOrder(ctx, state, "rome").cities[capua.id].order;
    assert.equal(next, target < 60 ? Math.max(target, 60 - ORDER.step) : Math.min(target, 60 + ORDER.step));
  });
});

describe("what low order costs", () => {
  it("cuts a restless city's gold and growth, and stops training in unrest", () => {
    const { state } = newGame();
    const capua = byName(state, "Capua");
    const content = cityStats(state, capua);
    const restless = cityStats(state, { ...capua, order: 40 });
    const unrest = cityStats(state, { ...capua, order: 20 });
    assert.equal(restless.income.order, ORDER.effects.restless.gold);
    assert.ok(restless.gold < content.gold);
    assert.ok(restless.growthRate < content.growthRate);
    assert.equal(unrest.growthRate, 0, "no growth in unrest");
    assert.ok(unrest.gold < restless.gold);

    const rich = { ...state, factions: state.factions.map((f) => (f.id === "rome" ? { ...f, gold: 10_000 } : f)) };
    assert.ok(canTrain(withCity(rich, capua, { order: 40 }), "rome", capua.id, "militia").ok, "a restless city still trains");
    assert.ok(!canTrain(withCity(rich, capua, { order: 20 }), "rome", capua.id, "militia").ok, "a city in unrest doesn't");
  });
});

describe("a revolt", () => {
  it("breaks out at the end of the turn in a city whose order stays below the line", () => {
    const { ctx, state: start } = newGame();
    const capua = byName(start, "Capua");
    // High taxes, just conquered and besieged, with no garrison: the target is 0.
    const change = { order: 5, taxRate: "high" as const, conqueredOn: start.turn, formerOwner: "samnites", besiegedBy: "samnites" };
    const state = withCity(emptied(start, capua), capua, change);
    assert.ok(orderTarget(ctx, state, state.cities[capua.id]).total < ORDER.revoltBelow);
    assert.equal(processOrder(ctx, state, "rome").cities[capua.id].owner, REBELS.id);
  });

  it("in an empty city hands it to the rebels, even with a former owner standing", () => {
    const { state: start } = newGame();
    const capua = byName(start, "Capua");
    const state = withCity(emptied(start, capua), capua, { order: 5, population: 9_000, conqueredOn: start.turn, formerOwner: "samnites" });
    const after = revolt(state, state.cities[capua.id]);
    const city = after.cities[capua.id];
    assert.equal(city.owner, REBELS.id);
    assert.equal(city.unsettled, false, "no fate to choose");
    assert.equal(city.formerOwner, "rome", "it remembers whom it revolted from");
    assert.equal(city.conqueredOn, start.turn, "the revolt turn, for raising militia");
    const garrison = armyAt(after, capua.tile);
    assert.equal(garrison?.owner, REBELS.id);
    assert.equal(garrison?.regiments.length, rebelRegiments(9_000), "every rebel holds the city");
    assert.deepEqual(brokenRules(after), []);
  });

  it("is put down by a strong garrison, and the rebels who fell are gone", () => {
    const { state: start } = newGame();
    const capua = byName(start, "Capua");
    const state = withCity(garrisoned(start, capua, 8), capua, { order: 5, population: 20_000, conqueredOn: start.turn, formerOwner: "samnites" });
    const after = revolt(state, state.cities[capua.id]);
    const city = after.cities[capua.id];
    assert.equal(city.owner, "rome");
    assert.equal(city.order, ORDER.afterRevolt);
    assert.ok(city.population < 20_000, "the fallen rebels came out of the people");
    assert.equal(armyAt(after, capua.tile)?.owner, "rome");
  });

  it("by a garrison that loses destroys it, and the surviving rebels hold the city", () => {
    const { state: start } = newGame();
    const capua = byName(start, "Capua");
    const state = withCity(garrisoned(start, capua, 1), capua, { order: 5, population: 20_000, conqueredOn: start.turn, formerOwner: "samnites" });
    const after = revolt(state, state.cities[capua.id]);
    assert.equal(after.cities[capua.id].owner, REBELS.id);
    const garrison = armyAt(after, capua.tile);
    assert.equal(garrison?.owner, REBELS.id, "one regiment can't hold against five");
    const soldiers = garrison!.regiments.reduce((n, r) => n + r.soldiers, 0);
    assert.ok(soldiers < 5 * regimentSize("militia"), "the rebels' losses stay lost");
    assert.deepEqual(brokenRules(after), []);
  });
});

describe("a fallen capital", () => {
  it("passes to the faction's largest remaining city", () => {
    const { state: start } = newGame();
    const roma = byName(start, "Roma");
    const others = citiesOf(start, "rome").filter((c) => c.id !== roma.id);
    const biggest = others[others.length - 1];
    const state = withCity(start, biggest, { population: 9_000 });
    const after = captureCity(state, roma.id, "carthage");
    assert.equal(after.cities[roma.id].isCapital, false);
    assert.equal(after.cities[roma.id].order, ORDER.afterCapture);
    assert.equal(after.cities[roma.id].formerOwner, "rome");
    assert.deepEqual(
      citiesOf(after, "rome").filter((c) => c.isCapital).map((c) => c.id),
      [biggest.id],
    );
  });
});
