import {
  addLog,
  armiesOf,
  armyAt,
  citiesOf,
  getFaction,
  type Check,
  type City,
  type CityId,
  type FactionId,
  type GameState,
  type Regiment,
} from "@/core/state.js";
import { ARMY_RULES, MERCENARIES, UNITS, regimentSize, type UnitType } from "@/data/units.js";
import { mercenaryCost, placeNewArmy, regimentUpkeep } from "@/systems/armies.js";
import { unitUnlocked, unlockReason } from "@/systems/recruitment.js";

/**
 * Mercenaries: gold turned into regiments at once. A city with a Market hires
 * up to its Market level of basic regiments a turn, of any unit it could
 * train. They take no people and skip the recruitment queue, but cost twice
 * as much to hire and keep, can't move on the turn they're hired, and desert
 * a faction that can't pay them.
 */

const fmt = (n: number) => n.toLocaleString("en-US");

/** Mercenary regiments a city may still hire this turn: its Market level's allowance, less what it has hired. */
export function hiresLeft(city: City): number {
  const allowance = MERCENARIES.hiresByMarketLevel[city.buildings.market] ?? 0;
  return Math.max(0, allowance - city.mercenariesHired);
}

/**
 * Whether a city can hire a regiment of mercenaries now: it's ours, has a
 * Market with a hire left this turn, isn't besieged, could train the unit
 * (basic tier), has room in its army, and we have the gold (so never in debt).
 */
export function canHire(state: GameState, factionId: FactionId, cityId: CityId, unit: UnitType): Check {
  const city = state.cities[cityId];
  const faction = getFaction(state, factionId);
  if (!city || !faction || city.owner !== factionId) return { ok: false, reason: "That city isn't yours." };
  if (city.buildings.market === 0) return { ok: false, reason: "Mercenaries are hired in a city with a Market." };
  if (city.besiegedBy) return { ok: false, reason: `${city.name} is besieged and can't hire.` };
  if (hiresLeft(city) === 0) {
    return { ok: false, reason: `${city.name} has hired all it can this turn (${MERCENARIES.hiresByMarketLevel[city.buildings.market]}).` };
  }
  if (!unitUnlocked(city, unit, 1)) return { ok: false, reason: unlockReason(unit, 1) };
  const stationed = armyAt(state, city.tile);
  const queuedTraining = city.recruitQueue.filter((o) => o.kind === "train").length;
  if ((stationed?.owner === factionId ? stationed.regiments.length : 0) + queuedTraining >= ARMY_RULES.maxRegiments) {
    return { ok: false, reason: `The army in ${city.name} would have more than ${ARMY_RULES.maxRegiments} regiments. Move some out first.` };
  }
  const gold = mercenaryCost(unit);
  if (faction.gold < gold) return { ok: false, reason: `Costs ${fmt(gold)} gold. You have ${fmt(faction.gold)}.` };
  return { ok: true };
}

/** Pays for a regiment of mercenaries, which joins the city's army at once with no movement left. Call canHire first. */
export function hire(state: GameState, factionId: FactionId, cityId: CityId, unit: UnitType): GameState {
  const city = state.cities[cityId];
  const gold = mercenaryCost(unit);
  const regiment: Regiment = {
    id: `reg${state.nextRegimentNumber}`,
    unit,
    tier: 1,
    soldiers: regimentSize(unit),
    experience: 0,
    movementLeft: 0,
    pinned: false,
    mercenary: true,
  };
  let next: GameState = {
    ...state,
    nextRegimentNumber: state.nextRegimentNumber + 1,
    factions: state.factions.map((f) => (f.id === factionId ? { ...f, gold: f.gold - gold } : f)),
    cities: { ...state.cities, [cityId]: { ...city, mercenariesHired: city.mercenariesHired + 1 } },
  };
  const army = armyAt(next, city.tile);
  next =
    army && army.owner === factionId
      ? { ...next, armies: { ...next.armies, [army.id]: { ...army, regiments: [...army.regiments, regiment] } } }
      : placeNewArmy(next, factionId, city.tile, [regiment]);
  return addLog(next, `${city.name} hired a regiment of ${UNITS[unit].name.toLowerCase()} mercenaries.`, {
    kind: "recruitment",
    factions: [factionId],
  });
}

/** A faction's cities start its turn with their full allowance of hires. */
export function resetHires(state: GameState, factionId: FactionId): GameState {
  const cities = citiesOf(state, factionId).filter((c) => c.mercenariesHired > 0);
  if (cities.length === 0) return state;
  return { ...state, cities: { ...state.cities, ...Object.fromEntries(cities.map((c) => [c.id, { ...c, mercenariesHired: 0 }])) } };
}

/**
 * After upkeep is paid, a faction still in debt loses one regiment of
 * mercenaries, the dearest to keep: unpaid, they walk off. One a turn, until
 * it's out of debt or has none left.
 */
export function mercenariesDesert(state: GameState, factionId: FactionId): GameState {
  if ((getFaction(state, factionId)?.gold ?? 0) >= 0) return state;
  let pick: { armyId: string; regiment: Regiment } | null = null;
  for (const army of armiesOf(state, factionId)) {
    for (const regiment of army.regiments) {
      if (regiment.mercenary && (!pick || regimentUpkeep(regiment) > regimentUpkeep(pick.regiment))) pick = { armyId: army.id, regiment };
    }
  }
  if (!pick) return state;
  const army = state.armies[pick.armyId];
  const regiments = army.regiments.filter((r) => r.id !== pick!.regiment.id);
  const armies = { ...state.armies };
  if (regiments.length === 0) delete armies[army.id];
  else armies[army.id] = { ...army, regiments };
  return addLog({ ...state, armies }, `Unpaid, a regiment of ${UNITS[pick.regiment.unit].name.toLowerCase()} mercenaries deserted.`, {
    kind: "recruitment",
    factions: [factionId],
  });
}

/** Mercenary regiments a faction has in the field. */
export function mercenaryRegiments(state: GameState, factionId: FactionId): number {
  return armiesOf(state, factionId).reduce((n, a) => n + a.regiments.filter((r) => r.mercenary).length, 0);
}
