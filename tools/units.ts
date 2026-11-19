/**
 * Units report: how the trained units measure up against each other, fought
 * out with the real battle rules (systems/combat.ts). Use it before and after
 * changing unit stats or prices (src/data/units.ts, src/data/combat.ts), and
 * compare. It fights battles only, so it runs in seconds; whole games
 * (npm run compare) show what the AI then trains.
 *
 *   npm run units                         # basic regiments, 2,000 battles each
 *   npm run units -- --tier 3 --battles 500
 *
 * 1. Regiment against regiment: the attacker's chance to win.
 * 2. Equal gold: the same budget spent on each unit, the attacker's chance.
 * 3. Value in an army: how much of each unit an army of 2 spearmen and
 *    2 militia needs to make an even fight against a set enemy, in gold,
 *    soldiers (people) and regiments (room in the 10-regiment stack).
 * 4. What battles don't show: upkeep, speed and the chase.
 */
import { createRng } from "@/core/rng.js";
import { COMBAT } from "@/data/combat.js";
import { TERRAIN } from "@/data/terrain.js";
import { TIERS, UNIT_TYPES, UNITS, type Tier, type UnitType } from "@/data/units.js";
import { resolveBattle, routLosses, type Battlefield, type Troops } from "@/systems/combat.js";

const args = process.argv.slice(2);
const option = (name: string, fallback: number) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? Number(args[at + 1]) : fallback;
};
const BATTLES = option("battles", 2000);
const TIER = option("tier", 1) as Tier;
/** The budget each side spends in the equal-gold table. */
const BUDGET = 1000;

/** The trained units at the chosen tier; militia only come basic. */
const tierOf = (unit: UnitType): Tier => (UNITS[unit].building === null ? 1 : TIER);
const goldPerSoldier = (unit: UnitType) => UNITS[unit].goldPerSoldier * TIERS[tierOf(unit)].cost;

const FIELDS: [string, Battlefield][] = [
  ["Plains", { defenseBonus: TERRAIN.plains.defenseBonus, openGround: TERRAIN.plains.openGround }],
  ["Forest", { defenseBonus: TERRAIN.forest.defenseBonus, openGround: TERRAIN.forest.openGround }],
  ["City, no walls", { defenseBonus: COMBAT.cityDefenseBonus, openGround: false }],
];

/** Full regiments: [unit, how many]. */
function army(spec: [UnitType, number][]): Troops[] {
  return spec.flatMap(([unit, n]) => Array.from({ length: n }, () => ({ unit, soldiers: UNITS[unit].regimentSize, tier: tierOf(unit) })));
}

/** As many soldiers of a unit as `gold` buys, in one body. */
const bought = (unit: UnitType, gold: number): Troops => ({ unit, soldiers: Math.round(gold / goldPerSoldier(unit)), tier: tierOf(unit) });

/** The attacker's share of wins over BATTLES battles, with the same dice for every matchup. */
function winChance(attackers: readonly Troops[], defenders: readonly Troops[], field: Battlefield): number {
  const rng = createRng(1);
  let wins = 0;
  for (let i = 0; i < BATTLES; i++) if (resolveBattle(attackers, defenders, field, rng).attackerWins) wins++;
  return wins / BATTLES;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const row = (label: string, cells: (string | number)[], width = 34) => console.log(`  ${label.padEnd(width)}${cells.map((c) => String(c).padStart(10)).join("")}`);
const header = (label: string, width = 34) => row(label, UNIT_TYPES.map((u) => UNITS[u].name), width);

console.log(`Units report: ${TIERS[TIER].name.toLowerCase()} regiments (militia always basic), ${BATTLES} battles each\n`);

console.log("1) Regiment against regiment: attacker's win chance (rows attack, columns defend)");
for (const [name, field] of FIELDS) {
  header(name);
  for (const a of UNIT_TYPES) row(UNITS[a].name, UNIT_TYPES.map((d) => pct(winChance(army([[a, 1]]), army([[d, 1]]), field))));
}

console.log(`\n2) Equal gold (${BUDGET} gold a side): attacker's win chance`);
for (const [name, field] of FIELDS) {
  header(name);
  for (const a of UNIT_TYPES) row(UNITS[a].name, UNIT_TYPES.map((d) => pct(winChance([bought(a, BUDGET)], [bought(d, BUDGET)], field))));
}

const BASE = army([["spearmen", 2], ["militia", 2]]);
const ENEMIES: [string, Troops[]][] = [
  ["Typical (3 mil, 3 spear, 1 arch)", army([["militia", 3], ["spearmen", 3], ["archers", 1]])],
  ["Spear-heavy (2 mil, 5 spear)", army([["militia", 2], ["spearmen", 5]])],
  ["Militia (7 mil)", army([["militia", 7]])],
  ["Archer-heavy (2 spear, 4 arch)", army([["spearmen", 2], ["archers", 4]])],
];
const SITUATIONS: [string, Battlefield, boolean][] = [
  ["attack", FIELDS[0][1], true],
  ["defend", FIELDS[0][1], false],
  ["storm city", FIELDS[2][1], true],
];

/** Gold of `unit` the base army needs added for an even fight, by halving the range. */
function goldToEven(unit: UnitType, enemy: readonly Troops[], field: Battlefield, attacking: boolean): number {
  let lo = 0;
  let hi = 20000;
  for (let step = 0; step < 20; step++) {
    const gold = (lo + hi) / 2;
    const side = [...BASE, bought(unit, gold)];
    const chance = attacking ? winChance(side, enemy, field) : 1 - winChance(enemy, side, field);
    if (chance >= 0.5) hi = gold;
    else lo = gold;
  }
  return hi;
}

console.log("\n3) Added to 2 spearmen + 2 militia for an even fight (lower is better; plains, city has no walls)");
const values = ENEMIES.flatMap(([enemyName, enemy]) =>
  SITUATIONS.map(([situation, field, attacking]) => ({
    label: `${enemyName}, ${situation}`,
    gold: UNIT_TYPES.map((u) => goldToEven(u, enemy, field, attacking)),
  })),
);
const table = (title: string, cell: (gold: number, unit: UnitType) => string | number) => {
  header(title, 48);
  for (const v of values) row(v.label, v.gold.map((g, i) => cell(g, UNIT_TYPES[i])), 48);
};
table("Gold", (g) => Math.round(g));
table("Soldiers (people)", (g, u) => Math.round(g / goldPerSoldier(u)));
table("Regiments (stack room)", (g, u) => (g / goldPerSoldier(u) / UNITS[u].regimentSize).toFixed(2));

console.log("\n4) What battles don't show");
header("", 34);
row("Gold a regiment", UNIT_TYPES.map((u) => Math.ceil(goldPerSoldier(u) * UNITS[u].regimentSize)));
row(`Upkeep a turn per ${BUDGET} gold`, UNIT_TYPES.map((u) => ((UNITS[u].upkeep * TIERS[tierOf(u)].cost * BUDGET) / goldPerSoldier(u)).toFixed(1)));
row("Movement", UNIT_TYPES.map((u) => UNITS[u].movement));
const fleeing = 600;
row(`Rout of ${fleeing}, ${BUDGET} gold chasing`, UNIT_TYPES.map((u) => routLosses(fleeing, [bought(u, BUDGET)])));
