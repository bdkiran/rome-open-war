/**
 * Battles fought in rounds from each unit's stats. Most checks fight with no
 * dice, so they test the stats, not luck.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRng } from "@/core/rng.js";
import { LINE_UNITS, regimentSize, type Tier, type UnitType } from "@/data/units.js";
import { battleStrength, estimateBattle, resolveBattle, type Battlefield, type Troops } from "@/systems/combat.js";

const OPEN: Battlefield = { defenseBonus: 0, openGround: true };
const ROUGH: Battlefield = { defenseBonus: 0, openGround: false };

const regiment = (unit: UnitType, tier: Tier = 1): Troops[] => [{ unit, soldiers: regimentSize(unit), tier }];
const wins = (attackers: Troops[], defenders: Troops[], field = OPEN) => resolveBattle(attackers, defenders, field, null).attackerWins;

/** How many soldiers of `unit` it takes to beat `defenders`, attacking: found by halving. */
function soldiersToBeat(unit: UnitType, defenders: Troops[], field = OPEN, tier: Tier = 1): number {
  let lo = 1;
  let hi = 5000;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (wins([{ unit, soldiers: mid, tier }], defenders, field)) hi = mid;
    else lo = mid;
  }
  return hi;
}

describe("the triangle, regiment against regiment", () => {
  const counters: [UnitType, UnitType][] = [
    ["spearmen", "cavalry"],
    ["archers", "spearmen"],
    ["cavalry", "archers"],
  ];
  for (const [counter, victim] of counters) {
    it(`${counter} beat ${victim}, attacking or defending, on open or rough ground`, () => {
      for (const field of [OPEN, ROUGH]) {
        assert.equal(wins(regiment(counter), regiment(victim), field), true, "attacking");
        assert.equal(wins(regiment(victim), regiment(counter), field), false, "defending");
      }
    });
  }

  it("lets spearmen and archers beat a militia regiment, which beats neither", () => {
    for (const unit of ["spearmen", "archers"] as const) {
      assert.equal(wins(regiment(unit), regiment("militia")), true, `${unit} attacking`);
      assert.equal(wins(regiment("militia"), regiment(unit)), false, `militia attacking ${unit}`);
    }
  });
});

describe("stats", () => {
  it("makes an advanced or elite regiment fight like 1.3 or 1.6 times as many basic soldiers", () => {
    for (const [tier, times] of [[2, 1.3], [3, 1.6]] as const) {
      for (const unit of ["spearmen", "cavalry"] as const) {
        const vsDrilled = soldiersToBeat(unit, regiment(unit, tier));
        const vsMore = soldiersToBeat(unit, [{ unit, soldiers: Math.round(regimentSize(unit) * times) }]);
        assert.ok(Math.abs(vsDrilled / vsMore - 1) < 0.03, `${unit} tier ${tier}: ${vsDrilled} against ${vsMore}`);
      }
    }
  });

  it("makes a +50% defense bonus worth 1.5 times the defenders", () => {
    const needed = soldiersToBeat("spearmen", regiment("spearmen"), { defenseBonus: 0.5, openGround: false });
    assert.ok(Math.abs(needed / 180 / 1.5 - 1) < 0.03, `${needed}`);
  });

  it("lets cavalry charge only when attacking on open ground", () => {
    const open = soldiersToBeat("cavalry", regiment("militia"), OPEN);
    const rough = soldiersToBeat("cavalry", regiment("militia"), ROUGH);
    assert.ok(open < rough, `${open} on open ground, ${rough} on rough`);
    // Defending cavalry never charge: the ground doesn't matter to them.
    assert.equal(soldiersToBeat("militia", regiment("cavalry"), OPEN), soldiersToBeat("militia", regiment("cavalry"), ROUGH));
  });

  it("gives spearmen their anti-cavalry only against horsemen", () => {
    // Against militia, spearmen do a little better than militia would; against cavalry, far better.
    const vsMilitia = soldiersToBeat("spearmen", regiment("militia")) / soldiersToBeat("militia", regiment("militia"));
    const vsCavalry = soldiersToBeat("spearmen", regiment("cavalry")) / soldiersToBeat("militia", regiment("cavalry"));
    assert.ok(vsCavalry < vsMilitia * 0.6, `${vsCavalry.toFixed(2)} against cavalry, ${vsMilitia.toFixed(2)} against militia`);
  });
});

describe("a battle", () => {
  const armyA: Troops[] = [
    { unit: "spearmen", soldiers: 180, tier: 1 },
    { unit: "spearmen", soldiers: 90, tier: 1 },
    { unit: "archers", soldiers: 160, tier: 2 },
    { unit: "cavalry", soldiers: 120, tier: 1 },
  ];
  const armyB: Troops[] = [
    { unit: "militia", soldiers: 220, tier: 1 },
    { unit: "spearmen", soldiers: 180, tier: 3 },
    { unit: "archers", soldiers: 160, tier: 1 },
  ];

  it("destroys the loser and leaves the winner whole soldiers, at least one, never more than it had", () => {
    const rng = createRng(7);
    for (let i = 0; i < 300; i++) {
      const r = resolveBattle(armyA, armyB, { defenseBonus: (i % 4) * 0.2, openGround: i % 2 === 0 }, rng);
      const [winner, loser, winnerStart] = r.attackerWins
        ? [r.attackerSoldiers, r.defenderSoldiers, armyA]
        : [r.defenderSoldiers, r.attackerSoldiers, armyB];
      assert.ok(loser.every((n) => n === 0));
      assert.ok(winner.every((n, j) => Number.isInteger(n) && n >= 0 && n <= winnerStart[j].soldiers));
      assert.ok(winner.some((n) => n > 0));
      assert.ok(r.rounds >= 1);
    }
  });

  it("plays out the same way from the same seed", () => {
    const once = resolveBattle(armyA, armyB, OPEN, createRng(42));
    const again = resolveBattle(armyA, armyB, OPEN, createRng(42));
    assert.deepEqual(again, once);
  });

  it("has a quick strength that names the winner of a battle fought without luck", () => {
    const units: UnitType[] = ["militia", ...LINE_UNITS];
    for (const a of units) {
      for (const d of units) {
        for (const field of [OPEN, ROUGH, { defenseBonus: 0.35, openGround: false }]) {
          const s = battleStrength(regiment(a), regiment(d), field);
          // Too close to call either way is fine.
          if (Math.abs(Math.log(s.attacker / s.defender)) < 0.1) continue;
          assert.equal(wins(regiment(a), regiment(d), field), s.attacker > s.defender, `${a} attacking ${d}`);
        }
      }
    }
  });

  it("estimates the same odds every time, close to the real ones", () => {
    const field = { defenseBonus: 0.1, openGround: false };
    const odds = estimateBattle(armyA, armyB, field, 1234);
    assert.deepEqual(estimateBattle(armyA, armyB, field, 1234), odds);
    const rng = createRng(99);
    let won = 0;
    for (let i = 0; i < 1000; i++) if (resolveBattle(armyA, armyB, field, rng).attackerWins) won++;
    assert.ok(Math.abs(odds.winChance - won / 1000) < 0.07, `${odds.winChance} estimated, ${won / 1000} fought`);
  });
});
