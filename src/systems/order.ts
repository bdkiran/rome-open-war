/**
 * Public order (numbers in data/order.ts). Each city's order moves a few
 * points a turn toward a target worked out from its situation: its taxes,
 * its garrison against its size, whether it's the capital, how recently it
 * was conquered, a siege, and its distance from the capital. Low order costs
 * gold and growth (systems/cities.ts) and stops training
 * (systems/recruitment.ts). A city still below ORDER.revoltBelow at the end
 * of its owner's turn revolts.
 */
import type { GameContext } from "@/core/context.js";
import { createRng } from "@/core/rng.js";
import { addLog, armyAt, citiesOf, getFaction, type City, type FactionId, type GameState } from "@/core/state.js";
import type { TaxRate } from "@/data/economy.js";
import { ORDER } from "@/data/order.js";
import { regimentSize } from "@/data/units.js";
import { captureCity, eliminateIfDefeated } from "@/systems/cities.js";
import { battlefieldAt, resolveBattle } from "@/systems/combat.js";
import { reportFallen } from "@/systems/generals.js";

/** What makes up a city's order target, cause by cause. */
export interface OrderTarget {
  base: number;
  taxes: number;
  capital: number;
  /** The conquest malus, fading since the city was taken. */
  conquered: number;
  siege: number;
  /** Tiles from its owner's capital. */
  tilesFromCapital: number;
  distance: number;
  /** Soldiers in the army standing in the city, and the points they're worth. */
  soldiers: number;
  garrison: number;
  /** Everything added up, kept within 0 to 100. */
  total: number;
}

/** What the target would be with another tax rate or garrison, for the AI and the UI to weigh. */
export interface OrderAssumptions {
  taxRate?: TaxRate;
  soldiers?: number;
}

/** Soldiers of the city's owner standing in the city. */
export function garrisonSoldiers(state: GameState, city: City): number {
  const army = armyAt(state, city.tile);
  return army && army.owner === city.owner ? army.regiments.reduce((sum, r) => sum + r.soldiers, 0) : 0;
}

/** Points of order a garrison of so many soldiers is worth in a city of so many people. */
export function garrisonOrder(soldiers: number, population: number): number {
  return population > 0 ? (ORDER.garrisonPerPercent * 100 * soldiers) / population : 0;
}

/** What's left of the conquest malus this turn: it fades evenly over ORDER.conquestFadeTurns. */
export function conquestMalus(state: GameState, city: City): number {
  if (city.conqueredOn === null) return 0;
  const left = Math.max(0, 1 - (state.turn - city.conqueredOn) / ORDER.conquestFadeTurns);
  return left > 0 ? ORDER.conquered * left : 0;
}

/** The malus for lying so many tiles from the capital. */
export function distanceMalus(tiles: number): number {
  const { free, tilesPerPoint, max } = ORDER.distance;
  const points = Math.floor(Math.max(0, tiles - free) / tilesPerPoint);
  return points > 0 ? Math.max(max, -points) : 0;
}

/** The order a city is heading toward, and why. */
export function orderTarget(ctx: GameContext, state: GameState, city: City, assume: OrderAssumptions = {}): OrderTarget {
  const capital = citiesOf(state, city.owner).find((c) => c.isCapital);
  const tilesFromCapital = capital ? ctx.topology.distance(city.tile, capital.tile) : 0;
  const soldiers = assume.soldiers ?? garrisonSoldiers(state, city);
  const parts = {
    base: ORDER.base,
    taxes: ORDER.taxes[assume.taxRate ?? city.taxRate],
    capital: city.isCapital ? ORDER.capital : 0,
    conquered: conquestMalus(state, city),
    siege: city.besiegedBy ? ORDER.siege : 0,
    distance: city.isCapital ? 0 : distanceMalus(tilesFromCapital),
    garrison: garrisonOrder(soldiers, city.population),
  };
  const sum = parts.base + parts.taxes + parts.capital + parts.conquered + parts.siege + parts.distance + parts.garrison;
  return { ...parts, tilesFromCapital, soldiers, total: Math.round(Math.max(0, Math.min(100, sum))) };
}

/**
 * Soldiers a city needs standing in it for its order target to reach
 * `wanted` (on `taxRate`, its own by default): 0 if it gets there without any.
 */
export function soldiersForOrder(ctx: GameContext, state: GameState, city: City, wanted: number, taxRate?: TaxRate): number {
  const without = orderTarget(ctx, state, city, { taxRate, soldiers: 0 });
  const short = wanted - without.total;
  if (short <= 0) return 0;
  return Math.ceil((short * city.population) / (ORDER.garrisonPerPercent * 100));
}

/** A city's order one turn on: ORDER.step points closer to its target. */
export function nextOrder(order: number, target: number): number {
  if (target > order) return Math.min(target, order + ORDER.step);
  return Math.max(target, order - ORDER.step);
}

/**
 * Moves the order of every settled city a faction holds one step toward its
 * target. `soldiers`, if given, stands in for each city's garrison (the
 * peacetime economy model has no armies).
 */
export function moveOrder(ctx: GameContext, state: GameState, factionId: FactionId, soldiers?: number): GameState {
  let cities = state.cities;
  for (const city of citiesOf(state, factionId)) {
    if (city.unsettled) continue;
    const order = nextOrder(city.order, orderTarget(ctx, state, city, { soldiers }).total);
    if (order !== city.order) cities = { ...cities, [city.id]: { ...city, order } };
  }
  return cities === state.cities ? state : { ...state, cities };
}

/**
 * End-of-turn order for one faction: each city's order moves toward its
 * target, a city that will revolt next turn unless something changes is
 * reported to its owner, and a city still below ORDER.revoltBelow revolts.
 */
export function processOrder(ctx: GameContext, state: GameState, factionId: FactionId): GameState {
  let next = moveOrder(ctx, state, factionId);
  for (const before of citiesOf(state, factionId)) {
    const city = next.cities[before.id];
    if (city.unsettled) continue;
    if (city.order < ORDER.revoltBelow) {
      next = revolt(next, city);
      continue;
    }
    // Warned once, the turn before: its order will drop below the line next turn unless something changes.
    const danger = ORDER.revoltBelow + ORDER.step;
    if (city.order < danger && before.order >= danger && orderTarget(ctx, next, city).total < ORDER.revoltBelow) {
      next = addLog(next, `${city.name} is close to revolt.`, { kind: "city", factions: [factionId] });
    }
  }
  return next;
}

/** Rebel militia regiments a city's people raise. */
export function rebelRegiments(population: number): number {
  const { peoplePerRegiment, maxRegiments } = ORDER.rebels;
  return Math.max(1, Math.min(maxRegiments, Math.floor(population / peoplePerRegiment)));
}

/**
 * The people rise. Rebel militia attack the garrison, which keeps the city's
 * defense bonus. If it holds, the rebels who fell are gone from the city and
 * order is restored to ORDER.afterRevolt. If it's beaten (or there's none),
 * it's destroyed, and the city goes back to its former owner if that faction
 * still stands; if not, the owner keeps an empty city. Either way the rebels
 * have won, so the conquest malus is gone.
 */
export function revolt(state: GameState, city: City): GameState {
  const owner = city.owner;
  const ownerName = getFaction(state, owner)?.shortName ?? "Unknown";
  const size = regimentSize("militia");
  const rebels = Array.from({ length: rebelRegiments(city.population) }, () => ({ unit: "militia" as const, soldiers: size }));
  const garrison = armyAt(state, city.tile);
  let next = state;

  if (garrison && garrison.owner === owner) {
    const rng = createRng(state.rngState);
    const result = resolveBattle(rebels, garrison.regiments, battlefieldAt(state, city.tile), rng);
    next = { ...next, rngState: rng.state };
    if (!result.attackerWins) {
      const kept = garrison.regiments.map((r, i) => ({ ...r, soldiers: result.defenderSoldiers[i] })).filter((r) => r.soldiers > 0);
      const armies = { ...next.armies };
      if (kept.length > 0) armies[garrison.id] = { ...garrison, regiments: kept };
      else delete armies[garrison.id];
      const fallen = Math.min(result.attackerLosses, city.population - 1);
      next = {
        ...next,
        armies,
        cities: { ...next.cities, [city.id]: { ...city, order: ORDER.afterRevolt, population: city.population - fallen } },
      };
      return addLog(next, `${city.name} revolted against ${ownerName}. The garrison put it down.`, {
        kind: "city",
        factions: [owner],
        major: true,
      });
    }
    // Beaten in its own city, the garrison fights to the death.
    const armies = { ...next.armies };
    delete armies[garrison.id];
    next = reportFallen({ ...next, armies }, garrison.regiments, `at ${city.name}`, [owner]);
  }

  const former = city.formerOwner ? getFaction(next, city.formerOwner) : undefined;
  if (former?.alive) {
    next = captureCity(next, city.id, former.id);
    const returned = next.cities[city.id];
    next = {
      ...next,
      cities: { ...next.cities, [city.id]: { ...returned, unsettled: false, order: ORDER.afterReturn, conqueredOn: null } },
    };
    next = addLog(next, `${city.name} revolted against ${ownerName} and returned to ${former.shortName}.`, {
      kind: "city",
      factions: [owner, former.id],
      major: true,
    });
    return eliminateIfDefeated(next, owner);
  }

  next = { ...next, cities: { ...next.cities, [city.id]: { ...next.cities[city.id], order: ORDER.afterRevolt, conqueredOn: null } } };
  return addLog(next, `${city.name} revolted against ${ownerName}. Its garrison is gone.`, { kind: "city", factions: [owner], major: true });
}
