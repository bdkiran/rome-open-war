/** Militia sit outside the rock-paper-scissors triangle: every other type beats them. */
import assert from "node:assert/strict";
import { it } from "node:test";
import { LINE_UNITS, regimentSize, UNIT_TYPES } from "@/data/units.js";
import { matchup, sideStrength } from "@/systems/combat.js";

const regiment = (unit: (typeof UNIT_TYPES)[number]) => [{ unit, soldiers: regimentSize(unit) }];

it("gives every other type the advantage over militia, and militia none", () => {
  for (const unit of LINE_UNITS) {
    assert.equal(matchup(unit, "militia"), 1.5, `${unit} against militia`);
    assert.equal(matchup("militia", unit), 1, `militia against ${unit}`);
  }
  assert.equal(matchup("militia", "militia"), 1);
});

it("keeps the triangle: spearmen beat cavalry, archers beat spearmen, cavalry beat archers", () => {
  assert.equal(matchup("spearmen", "cavalry"), 1.5);
  assert.equal(matchup("archers", "spearmen"), 1.5);
  assert.equal(matchup("cavalry", "archers"), 1.5);
});

it("lets a regiment of militia lose to spearmen but beat cavalry", () => {
  const vsSpearmen = [sideStrength(regiment("militia"), regiment("spearmen")), sideStrength(regiment("spearmen"), regiment("militia"))];
  assert.deepEqual(vsSpearmen, [220, 270]);
  const vsCavalry = [sideStrength(regiment("militia"), regiment("cavalry")), sideStrength(regiment("cavalry"), regiment("militia"))];
  assert.deepEqual(vsCavalry, [220, 180]);
});

it("counts each soldier by the regiment's tier: an elite regiment fights like 1.6 basic ones", () => {
  const basic = [{ unit: "spearmen" as const, soldiers: 180 }];
  assert.equal(sideStrength([{ unit: "spearmen", soldiers: 180, tier: 3 }], basic), 288);
  assert.equal(sideStrength([{ unit: "spearmen", soldiers: 180, tier: 2 }], basic), 234);
  // An elite regiment of spearmen against basic cavalry: tier and matchup multiply.
  assert.equal(sideStrength([{ unit: "spearmen", soldiers: 180, tier: 3 }], [{ unit: "cavalry", soldiers: 120 }]), 180 * 1.6 * 1.5);
});
