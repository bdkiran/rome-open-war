/** What the AI chooses to train: line units over militia, and its best tier. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GameContext } from "@/core/context.js";
import { createGame } from "@/core/setup.js";
import { citiesOf, type Army, type City } from "@/core/state.js";
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
