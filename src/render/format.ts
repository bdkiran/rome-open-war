/** Formatting shared by the map and the UI. */
import { unitStats, type Tier, type UnitType } from "@/data/units.js";

/** 12345 -> "12,345" */
export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Short form for tight spaces: 950 -> "950", 5400 -> "5.4k", 12345 -> "12k", 1250000 -> "1.3M". */
export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${trim(n / 1000)}k`;
  return String(Math.round(n));
}

/** 0.0234 -> "2.3%" */
export function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function trim(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}

/** A stat as shown to the player: at most one decimal, e.g. 3, 3.9, 4.8. */
function stat(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** "Attack 3 · Armor 3" for a unit at a tier. */
export function describeAttackArmor(unit: UnitType, tier: Tier): string {
  const s = unitStats(unit, tier);
  return `Attack ${stat(s.attack)} · Armor ${stat(s.armor)}`;
}

/** A unit's special abilities at a tier, e.g. "Anti-cavalry +6", or "" if it has none. */
export function describeSpecials(unit: UnitType, tier: Tier): string {
  const s = unitStats(unit, tier);
  return [
    s.ranged > 0 ? `Ranged ${stat(s.ranged)}` : "",
    s.charge > 0 ? `Charge +${stat(s.charge)}` : "",
    s.antiCavalry > 0 ? `Anti-cavalry +${stat(s.antiCavalry)}` : "",
  ].filter(Boolean).join(" · ");
}

/** The same, short and in whole numbers, for a unit card: ["Atk 4 · Arm 4", "Anti-cav +8"]. */
export function describeStatsShort(unit: UnitType, tier: Tier): [string, string] {
  const s = unitStats(unit, tier);
  const n = (x: number) => Math.round(x);
  const special = s.ranged > 0 ? `Ranged ${n(s.ranged)}`
    : s.charge > 0 ? `Charge +${n(s.charge)}`
    : s.antiCavalry > 0 ? `Anti-cav +${n(s.antiCavalry)}`
    : "No specials";
  return [`Atk ${n(s.attack)} · Arm ${n(s.armor)}`, special];
}
