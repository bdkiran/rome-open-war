import {
  addLog,
  citiesOf,
  getFaction,
  updateFaction,
  type Check,
  type City,
  type CityId,
  type Construction,
  type FactionId,
  type GameState,
} from "@/core/state.js";
import {
  BUILDINGS,
  CONSTRUCTION_QUEUE_SIZE,
  LEVEL_POPULATION,
  MAX_CITY_LEVEL,
  type BuildingLevel,
  type BuildingType,
} from "@/data/buildings.js";
import { mineableTiles } from "@/systems/cities.js";

const fmt = (n: number) => n.toLocaleString("en-US");

/** A city's level: the level of its government building. */
export function cityLevel(city: City): number {
  return city.buildings.government;
}

/**
 * The level a building will have once everything already queued is built:
 * what the next queued item for it would build on.
 */
export function plannedLevel(city: City, building: BuildingType): number {
  return city.buildings[building] + city.constructionQueue.filter((c) => c.building === building).length;
}

/**
 * The next level of a building that could be queued in a city (after
 * whatever is already queued for it), if there is one.
 */
export function nextLevel(city: City, building: BuildingType): { level: number; def: BuildingLevel } | null {
  const level = plannedLevel(city, building) + 1;
  if (level > MAX_CITY_LEVEL) return null;
  return { level, def: BUILDINGS[building].levels[level - 1] };
}

/**
 * Why a building's next level isn't open to a city at all, or null if it is.
 * Buildings go up to the city's level, which only a finished government
 * raises; the government building itself needs enough people first; a mine
 * needs hills or mountains. Gold, a full queue and a siege only hold a
 * building up for now, so they don't count here.
 */
function unavailableReason(state: GameState, city: City, building: BuildingType): string | null {
  const next = nextLevel(city, building);
  if (!next) {
    return `${BUILDINGS[building].name} ${plannedLevel(city, building) > city.buildings[building] ? "will be" : "are"} at their highest level.`;
  }
  if (building === "mine" && mineableTiles(state, city.id) === 0) {
    return `${city.name}'s land has no hills or mountains to mine.`;
  }
  if (building === "government") {
    const needed = LEVEL_POPULATION[next.level];
    if (city.population < needed) {
      return `Needs ${fmt(needed)} people to become a level ${next.level} city (it has ${fmt(city.population)}).`;
    }
  } else {
    // Only a finished government unlocks the next level; one still being built doesn't.
    const needed = next.def.cityLevel ?? next.level;
    if (needed > cityLevel(city)) return `Needs a level ${needed} city. Finish raising its government first.`;
  }
  return null;
}

/**
 * Whether a building's next level is open to a city: everything but gold, a
 * full queue and a siege allows it. The Construction tab lists only these.
 */
export function buildingAvailable(state: GameState, cityId: CityId, building: BuildingType): boolean {
  const city = state.cities[cityId];
  return Boolean(city) && unavailableReason(state, city, building) === null;
}

/**
 * Whether a building's next level can be queued in a city now: it's open to
 * the city (see buildingAvailable), the queue has room (up to
 * CONSTRUCTION_QUEUE_SIZE buildings), the city isn't besieged, and the
 * faction can pay for it.
 */
export function canBuild(state: GameState, factionId: FactionId, cityId: CityId, building: BuildingType): Check {
  const city = state.cities[cityId];
  const faction = getFaction(state, factionId);
  if (!city || !faction || city.owner !== factionId) return { ok: false, reason: "That city isn't yours." };

  const unavailable = unavailableReason(state, city, building);
  if (unavailable) return { ok: false, reason: unavailable };
  if (city.constructionQueue.length >= CONSTRUCTION_QUEUE_SIZE) {
    return { ok: false, reason: `${city.name}'s construction queue is full (${CONSTRUCTION_QUEUE_SIZE} buildings).` };
  }
  if (city.besiegedBy) return { ok: false, reason: `${city.name} can't build while it's besieged.` };

  const cost = nextLevel(city, building)!.def.cost;
  if (faction.gold < cost) {
    return { ok: false, reason: `Costs ${fmt(cost)} gold. You have ${fmt(faction.gold)}.` };
  }
  return { ok: true };
}

/** Pays for a building's next level and adds it to the construction queue. Call canBuild first. */
export function queueConstruction(state: GameState, factionId: FactionId, cityId: CityId, building: BuildingType): GameState {
  const city = state.cities[cityId];
  const next = nextLevel(city, building)!;
  const paid = updateFaction(state, factionId, (f) => ({ ...f, gold: f.gold - next.def.cost }));
  return setCity(paid, {
    ...city,
    constructionQueue: [...city.constructionQueue, { building, level: next.level, turnsLeft: next.def.turns, cost: next.def.cost }],
  });
}

/**
 * Removes a building from the queue and refunds it. Anything queued after it
 * that it made possible (a later level of the same building) goes too,
 * refunded.
 */
export function cancelConstruction(state: GameState, factionId: FactionId, cityId: CityId, index: number): GameState {
  const city = state.cities[cityId];
  const kept: Construction[] = [];
  let refund = 0;
  city.constructionQueue.forEach((item, i) => {
    const planned = (b: BuildingType) => city.buildings[b] + kept.filter((c) => c.building === b).length;
    const valid = i !== index && item.level === planned(item.building) + 1;
    if (valid) kept.push(item);
    else refund += item.cost;
  });
  const next = updateFaction(state, factionId, (f) => ({ ...f, gold: f.gold + refund }));
  return setCity(next, { ...city, constructionQueue: kept });
}

/**
 * At the end of a faction's turn, work goes on in each of its cities that
 * isn't besieged: the first building in the queue gets a turn's work, and
 * goes up a level when it's done. The next one starts the following turn.
 */
export function progressConstruction(state: GameState, factionId: FactionId): GameState {
  let next = state;
  for (const city of citiesOf(state, factionId)) {
    const [work, ...rest] = city.constructionQueue;
    if (!work || city.besiegedBy) continue;
    if (work.turnsLeft > 1) {
      next = setCity(next, { ...city, constructionQueue: [{ ...work, turnsLeft: work.turnsLeft - 1 }, ...rest] });
      continue;
    }
    next = setCity(next, { ...city, constructionQueue: rest, buildings: { ...city.buildings, [work.building]: work.level } });
    const name = BUILDINGS[work.building].levels[work.level - 1].name;
    const message = work.building === "government"
      ? `${city.name} completed its ${name} and is now a level ${work.level} city.`
      : `${city.name} completed its ${name}.`;
    next = addLog(next, message, { kind: "construction", factions: [city.owner] });
  }
  return next;
}

function setCity(state: GameState, city: City): GameState {
  return { ...state, cities: { ...state.cities, [city.id]: city } };
}
