import type { GameContext } from "@/core/context.js";
import {
  armyAt,
  citiesOf,
  type Army,
  type City,
  type CityId,
  type FactionId,
  type GameState,
} from "@/core/state.js";
import { AI } from "@/data/ai.js";
import { ARMY_RULES, LINE_UNITS, regimentSize, UNIT_TYPES, type UnitType, UNITS } from "@/data/units.js";
import { sideStrength, type Troops } from "@/systems/combat.js";
import { trainableUnits } from "@/systems/recruitment.js";
import { landmasses } from "@/systems/pathfinding.js";

/** What an AI faction makes of its situation right now. */
export interface Assessment {
  /** Regiments each of our cities should keep at home. */
  garrisonNeed: Map<CityId, number>;
  /** The enemy city we're campaigning against, if any. */
  target: City | null;
  /** Our city nearest the target, where field armies gather. */
  muster: City | null;
  /**
   * One of our cities under siege, if any: the one closest to surrendering.
   * Relieving it comes before any campaign of our own.
   */
  relief: Relief | null;
}

export interface Relief {
  city: City;
  /** Enemy armies next to it that we can see. */
  besiegers: Army[];
  /** Our nearest city that isn't besieged, where a relief force gathers. */
  muster: City | null;
}

export function assess(ctx: GameContext, state: GameState, factionId: FactionId): Assessment {
  const garrisonNeed = new Map<CityId, number>();
  for (const city of citiesOf(state, factionId)) {
    const threat = enemyRegimentsNear(ctx, state, factionId, city.tile);
    const base = city.isCapital ? AI.capitalGarrison : AI.baseGarrison;
    garrisonNeed.set(city.id, Math.min(ARMY_RULES.maxRegiments, Math.max(base, Math.ceil(threat * AI.garrisonPerThreat))));
  }
  const { target, muster } = chooseTarget(ctx, state, factionId);
  return { garrisonNeed, target, muster, relief: findRelief(ctx, state, factionId) };
}

/** Our besieged city closest to surrendering, the armies around it, and where to raise a relief force. */
function findRelief(ctx: GameContext, state: GameState, factionId: FactionId): Relief | null {
  const own = citiesOf(state, factionId);
  const city = own.filter((c) => c.besiegedBy).sort((a, b) => a.supplies - b.supplies)[0];
  if (!city) return null;

  const near = new Set(ctx.topology.neighbors(city.tile));
  const besiegers = Object.values(state.armies).filter((a) => a.owner !== factionId && near.has(a.tile));
  const land = landmasses(ctx, state.tiles);
  const muster = own
    .filter((c) => !c.besiegedBy && land.get(c.tile) === land.get(city.tile))
    .sort((a, b) => ctx.topology.distance(a.tile, city.tile) - ctx.topology.distance(b.tile, city.tile))[0] ?? null;
  return { city, besiegers, muster };
}

/**
 * Enemy field armies near a tile, in regiments' worth of soldiers. Enemy
 * garrisons sitting in their own cities don't count, so neighbors don't get
 * into an arms race over each other's defenses.
 */
export function enemyRegimentsNear(ctx: GameContext, state: GameState, factionId: FactionId, tile: string): number {
  let soldiers = 0;
  for (const army of Object.values(state.armies)) {
    if (army.owner === factionId) continue;
    if (cityOwnedBy(state, army.tile, army.owner)) continue;
    if (ctx.topology.distance(army.tile, tile) > AI.threatRadius) continue;
    for (const r of army.regiments) soldiers += r.soldiers;
  }
  // In regiments of an average size, since regiment sizes differ by unit type (militia's big regiments left out).
  return soldiers / (LINE_UNITS.reduce((sum, u) => sum + UNITS[u].regimentSize, 0) / LINE_UNITS.length);
}

/**
 * The enemy city that's cheapest to take: weak defenders count for less than
 * distance. Any city reachable over land from one of ours will do, since a
 * city too strong to storm can be besieged until it surrenders, except one
 * another faction is already besieging.
 *
 * Once committed, the AI sticks to it: a city it's besieging, or one its
 * field armies are already standing next to, comes before any other. Without
 * this, the garrison it sees on arrival (hidden by fog until then) made some
 * other city look cheaper, and its armies wandered off before laying siege.
 */
function chooseTarget(ctx: GameContext, state: GameState, factionId: FactionId): { target: City | null; muster: City | null } {
  const own = citiesOf(state, factionId);
  const land = landmasses(ctx, state.tiles);
  const committed = committedTargets(ctx, state, factionId);
  let best: { target: City; muster: City; score: number; committed: boolean } | null = null;

  for (const city of Object.values(state.cities)) {
    if (city.owner === factionId) continue;
    let muster: City | null = null;
    let distance = Infinity;
    for (const home of own) {
      if (land.get(home.tile) !== land.get(city.tile)) continue;
      const d = ctx.topology.distance(home.tile, city.tile);
      if (d < distance) {
        muster = home;
        distance = d;
      }
    }
    if (!muster) continue;
    if (city.besiegedBy && city.besiegedBy !== factionId) continue;

    const isCommitted = committed.has(city.id);
    const score = defenderStrength(state, city) + distance * AI.distanceWeight;
    const better = !best || (isCommitted && !best.committed) || (isCommitted === best.committed && score < best.score);
    if (better) best = { target: city, muster, score, committed: isCommitted };
  }
  return { target: best?.target ?? null, muster: best?.muster ?? null };
}

/** Enemy cities this faction has committed to: ones it's besieging, and ones its field armies stand next to. */
function committedTargets(ctx: GameContext, state: GameState, factionId: FactionId): Set<string> {
  const committed = new Set<string>();
  for (const city of Object.values(state.cities)) {
    if (city.owner === factionId) continue;
    if (city.besiegedBy === factionId) {
      committed.add(city.id);
      continue;
    }
    const near = new Set(ctx.topology.neighbors(city.tile));
    const camped = Object.values(state.armies).some(
      (a) => a.owner === factionId && near.has(a.tile) && !cityOwnedBy(state, a.tile, factionId),
    );
    if (camped) committed.add(city.id);
  }
  return committed;
}

/**
 * How hard a city is to take. Walls and terrain don't count: a city too
 * strong to storm can be besieged instead, and what a siege needs is an army
 * big enough to survive the garrison sallying out in the open.
 */
function defenderStrength(state: GameState, city: City): number {
  const army = armyAt(state, city.tile);
  if (!army) return 0;
  return army.regiments.reduce((sum, r) => sum + r.soldiers, 0);
}

function cityOwnedBy(state: GameState, tile: string, owner: FactionId): boolean {
  return Object.values(state.cities).some((c) => c.tile === tile && c.owner === owner);
}

/**
 * How much a regiment adds against an enemy army: its quick strength
 * (sideStrength) against the army's actual mix of troops. An army holds only
 * so many regiments, so this is per regiment, not per gold.
 */
export function regimentStrengthAgainst(regiment: Troops, enemy: Army): number {
  return sideStrength([regiment], enemy.regiments, true);
}

/**
 * The unit a city should train against an enemy army: whichever of those it
 * can train makes the strongest regiment against it (the dearer one on a
 * tie). Null with no enemy.
 */
export function trainAgainst(city: City, army: Army | undefined): UnitType | null {
  if (!army) return null;
  const value = (unit: UnitType) => regimentStrengthAgainst({ unit, soldiers: regimentSize(unit) }, army);
  return [...trainableUnits(city)].sort((a, b) => value(b) - value(a) || UNIT_TYPES.indexOf(b) - UNIT_TYPES.indexOf(a))[0];
}

/** What a city should train against the nearest enemy army, or a rotating choice of what it can train when none are near. */
export function counterToNearestEnemy(ctx: GameContext, state: GameState, city: City): UnitType {
  let nearest: Army | undefined;
  let nearestDistance = Infinity;
  for (const army of Object.values(state.armies)) {
    if (army.owner === city.owner) continue;
    const d = ctx.topology.distance(army.tile, city.tile);
    if (d < nearestDistance) {
      nearest = army;
      nearestDistance = d;
    }
  }
  const counter = trainAgainst(city, nearest);
  if (counter) return counter;
  const options = trainableUnits(city);
  const index = Number(city.id.replace(/\D/g, "")) || 0;
  return options[index % options.length];
}

/** Whether every regiment in the army can still move this turn (a stack moves at its slowest pace). */
export function stackCanMove(army: Army): boolean {
  return army.regiments.every((r) => r.movementLeft > 0);
}
