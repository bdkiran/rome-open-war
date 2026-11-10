/** Population growth: slows only near the city's limit, stops there, and shrinks a city over it. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ECONOMY } from "@/data/economy.js";
import { populationGrowth } from "@/systems/cities.js";

describe("Population growth", () => {
  const rate = 0.04;

  it("keeps more of its rate near the limit than an even slowdown would", () => {
    const evenly = Math.round(rate * 6000 * (1 - 6000 / 8000));
    assert.ok(ECONOMY.growthCurve > 1);
    assert.ok(populationGrowth(6000, 8000, rate) > evenly);
  });

  it("is fastest for a small city and slows as it fills up", () => {
    const at = (people: number) => populationGrowth(people, 8000, rate) / people;
    assert.ok(at(2000) > at(4000));
    assert.ok(at(4000) > at(7000));
  });

  it("fills up to the limit and never passes it", () => {
    let people = 3000;
    for (let turn = 0; turn < 300; turn++) {
      people += populationGrowth(people, 8000, rate);
      assert.ok(people <= 8000);
    }
    assert.ok(people > 7900);
    assert.equal(populationGrowth(8000, 8000, rate), 0);
  });

  it("shrinks a city over its limit", () => {
    assert.ok(populationGrowth(10000, 8000, rate) < 0);
  });
});
