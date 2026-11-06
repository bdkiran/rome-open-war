/** What the AI chooses: line units over militia, its best tier, and the fate of a city it takes. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GameContext } from "@/core/context.js";
import { createGame } from "@/core/setup.js";
import { armyAt, citiesOf, type Army, type City, type GameState } from "@/core/state.js";
import { nextAction } from "@/ai/ai.js";
import { bestTierUnits, trainAgainst } from "@/ai/assess.js";
import { ROMAN_WORLD } from "@/data/scenarios/romanWorld.js";
import { regimentSize, type UnitType } from "@/data/units.js";

const map = ROMAN_WORLD.mapEngine.createMap();
const ctx: GameContext = { topology: map.topology };

/** A city of Carthage's with these unit buildings. */
function cityWith(buildings: Partial<City["buildings"]>): City {
  const city = citiesOf(createGame(ctx, map, ROMAN_WORLD), "carthage")[0];
  return { ...city, buildings: { ...city.buildings, ...buildings } };
}

/** An enemy army of one full regiment. */
function enemy(unit: UnitType): Army {
  const regiment = { id: "r", unit, tier: 1 as const, soldiers: regimentSize(unit), experience: 0, movementLeft: 0, pinned: false };
  return { id: "a", owner: "rome", tile: "t", destination: null, regiments: [regiment] };
}

describe("the AI's choice of unit", () => {
  it("is militia in a city with no unit building", () => {
    assert.equal(trainAgainst(cityWith({}), enemy("militia")), "militia");
    assert.deepEqual(bestTierUnits(cityWith({})), ["militia"]);
  });

  it("is never militia with a unit building, however big their regiments", () => {
    const city = cityWith({ archeryRange: 1 });
    for (const unit of ["militia", "spearmen", "archers", "cavalry"] as const) {
      assert.equal(trainAgainst(city, enemy(unit)), "archers");
    }
  });

  it("counts the tier it could train at", () => {
    // Against militia, basic archers beat basic cavalry, but elite cavalry beat basic archers.
    const even = trainAgainst(cityWith({ archeryRange: 1, stables: 1 }), enemy("militia"));
    const elite = trainAgainst(cityWith({ archeryRange: 1, stables: 3 }), enemy("militia"));
    assert.equal(even, "archers");
    assert.equal(elite, "cavalry");
  });

  it("with no enemy in view, keeps to the units at the city's best tier", () => {
    assert.deepEqual(bestTierUnits(cityWith({ spearYard: 2, archeryRange: 1 })), ["spearmen"]);
    assert.deepEqual(bestTierUnits(cityWith({ spearYard: 1, stables: 1 })), ["spearmen", "cavalry"]);
  });
});

describe("the fate the AI gives a city it took", () => {
  /** Carthage to play with this much gold, holding a city whose fate it hasn't decided, perhaps with an enemy army beside it. */
  function taken(gold: number, enemyNear: boolean): { state: GameState; cityId: string } {
    const start = createGame(ctx, map, ROMAN_WORLD);
    const city = citiesOf(start, "carthage")[0];
    const armies = { ...start.armies };
    if (enemyNear) {
      const tile = ctx.topology.neighbors(city.tile).find((t) => map.tiles[t].terrain !== "water" && !armyAt(start, t))!;
      armies.raiders = { ...enemy("spearmen"), id: "raiders", tile };
    }
    const state: GameState = {
      ...start,
      armies,
      currentFactionIndex: start.factions.findIndex((f) => f.id === "carthage"),
      factions: start.factions.map((f) => (f.id === "carthage" ? { ...f, gold } : f)),
      cities: { ...start.cities, [city.id]: { ...city, unsettled: true } },
    };
    return { state, cityId: city.id };
  }
  const fate = (gold: number, enemyNear: boolean) => {
    const { state, cityId } = taken(gold, enemyNear);
    assert.deepEqual(nextAction(ctx, state, "carthage"), { type: "settleCity", cityId, choice: choiceFor(gold, enemyNear) });
  };
  const choiceFor = (gold: number, enemyNear: boolean) => (gold < 100 ? "exterminate" : enemyNear ? "enslave" : "occupy");

  it("is occupation when it looks safe", () => fate(500, false));
  it("is enslavement with enemies near", () => fate(500, true));
  it("is extermination only when nearly broke", () => fate(50, false));
});
