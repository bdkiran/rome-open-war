/**
 * Every city trains militia. Spearmen, archers and cavalry each need their
 * own building, whose level is the best tier the city can train: basic,
 * advanced, then elite.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GameContext } from "@/core/context.js";
import { createGame } from "@/core/setup.js";
import { armyAt, type City, type GameState } from "@/core/state.js";
import { ROMAN_WORLD } from "@/data/scenarios/romanWorld.js";
import { regimentSize, TIERS, UNITS } from "@/data/units.js";
import { mergeRegiments, regimentCost, upkeepFor } from "@/systems/armies.js";
import { buildingAvailable } from "@/systems/buildings.js";
import { canRetrain, canTrain, retrainCost, trainableOptions, trainableUnits } from "@/systems/recruitment.js";

function newGame(): GameState {
  const map = ROMAN_WORLD.mapEngine.createMap();
  const ctx: GameContext = { topology: map.topology };
  return createGame(ctx, map, ROMAN_WORLD);
}

const cityNamed = (state: GameState, name: string) => Object.values(state.cities).find((c) => c.name === name)!;
const withCity = (state: GameState, city: City): GameState => ({ ...state, cities: { ...state.cities, [city.id]: city } });
const withBuildings = (city: City, levels: Partial<City["buildings"]>): City => ({ ...city, buildings: { ...city.buildings, ...levels } });

describe("recruitment", () => {
  it("lets a new city train only militia", () => {
    const state = newGame();
    for (const city of Object.values(state.cities)) assert.deepEqual(trainableUnits(city), ["militia"], city.name);
    const ariminum = cityNamed(state, "Ariminum");
    assert.equal(canTrain(state, "rome", ariminum.id, "militia").ok, true);
    const spearmen = canTrain(state, "rome", ariminum.id, "spearmen");
    assert.equal(spearmen.ok, false);
    assert.match(spearmen.ok ? "" : spearmen.reason, /Spear yard/);
  });

  it("trains basic spearmen with a Spear yard, even in a level-1 city", () => {
    const ariminum = cityNamed(newGame(), "Ariminum");
    assert.equal(ariminum.buildings.government, 1);
    const withYard = withBuildings(ariminum, { spearYard: 1 });
    assert.deepEqual(trainableOptions(withYard), [
      { unit: "militia", tier: 1 },
      { unit: "spearmen", tier: 1 },
    ]);
  });

  it("gives each building its own unit, and each level the next tier", () => {
    const roma = cityNamed(newGame(), "Roma");
    const built = withBuildings(roma, { spearYard: 3, archeryRange: 2, stables: 1 });
    assert.deepEqual(trainableOptions(built), [
      { unit: "militia", tier: 1 },
      { unit: "spearmen", tier: 1 },
      { unit: "spearmen", tier: 2 },
      { unit: "spearmen", tier: 3 },
      { unit: "archers", tier: 1 },
      { unit: "archers", tier: 2 },
      { unit: "cavalry", tier: 1 },
    ]);
  });

  it("charges each tier its gold and upkeep, and the same people", () => {
    for (const tier of [1, 2, 3] as const) {
      const cost = regimentCost("spearmen", tier);
      assert.equal(cost.gold, Math.ceil(regimentSize("spearmen") * UNITS.spearmen.goldPerSoldier * TIERS[tier].cost));
      assert.equal(cost.population, regimentSize("spearmen"));
      assert.equal(upkeepFor("spearmen", 180, tier), 180 * UNITS.spearmen.upkeep * TIERS[tier].cost);
    }
    assert.equal(regimentCost("spearmen", 3).gold, 378);
  });

  it("retrains a regiment at its own tier, only where its building is at that level", () => {
    let state = newGame();
    const ariminum = cityNamed(state, "Ariminum");
    const garrison = armyAt(state, ariminum.tile)!;
    const elite = { ...garrison.regiments[0], unit: "spearmen" as const, tier: 3 as const, soldiers: 90 };
    const militia = { ...garrison.regiments[0], id: "m", unit: "militia" as const, tier: 1 as const, soldiers: 100 };
    state = { ...state, armies: { ...state.armies, [garrison.id]: { ...garrison, regiments: [elite, militia] } } };
    const refused = canRetrain(state, "rome", ariminum.id, [elite.id]);
    assert.equal(refused.ok, false);
    assert.match(refused.ok ? "" : refused.reason, /Veterans' hall/);
    assert.equal(canRetrain(state, "rome", ariminum.id, [militia.id]).ok, true, "militia retrain anywhere");
    state = withCity(state, withBuildings(state.cities[ariminum.id], { government: 3, spearYard: 3 }));
    assert.equal(canRetrain(state, "rome", ariminum.id, [elite.id]).ok, true);
    assert.equal(retrainCost(elite), Math.ceil(90 * UNITS.spearmen.goldPerSoldier * TIERS[3].cost));
  });

  it("merges only regiments of the same unit and tier", () => {
    let state = newGame();
    const roma = cityNamed(state, "Roma");
    const army = armyAt(state, roma.tile)!;
    const base = army.regiments[0];
    const regiments = [
      { ...base, id: "a", unit: "spearmen" as const, tier: 1 as const, soldiers: 100 },
      { ...base, id: "b", unit: "spearmen" as const, tier: 2 as const, soldiers: 100 },
      { ...base, id: "c", unit: "spearmen" as const, tier: 2 as const, soldiers: 100 },
    ];
    state = { ...state, armies: { ...state.armies, [army.id]: { ...army, regiments } } };
    const merged = mergeRegiments(state, army.id).armies[army.id].regiments;
    assert.deepEqual(
      merged.map((r) => `${r.tier}:${r.soldiers}`).sort(),
      ["1:100", "2:180", "2:20"],
    );
  });
});

describe("unit buildings", () => {
  it("build their first level in any city, and later levels only as the city grows", () => {
    let state = newGame();
    const ariminum = cityNamed(state, "Ariminum"); // level 1
    for (const b of ["spearYard", "archeryRange", "stables"] as const) assert.equal(buildingAvailable(state, ariminum.id, b), true, b);
    state = withCity(state, withBuildings(ariminum, { spearYard: 1 }));
    assert.equal(buildingAvailable(state, ariminum.id, "spearYard"), false, "level 2 needs a level-2 city");
    state = withCity(state, withBuildings(state.cities[ariminum.id], { government: 2 }));
    assert.equal(buildingAvailable(state, ariminum.id, "spearYard"), true);
  });
});
