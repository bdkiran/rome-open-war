import type { GameContext } from "@/core/context.js";
import {
  addLog,
  armiesOf,
  armySoldiers,
  armyAt,
  getFaction,
  type Army,
  type ArmyId,
  type Check,
  type City,
  type FactionId,
  type GameState,
} from "@/core/state.js";
import { SIEGE } from "@/data/siege.js";
import type { TileId } from "@/map/topology.js";
import { besiegedCity, SHUT_IN } from "@/systems/armies.js";
import { captureCity, eliminateIfDefeated } from "@/systems/cities.js";
import { applyLosses } from "@/systems/combat.js";


export function maxSupplies(city: { isCapital: boolean; buildings: { government: number } }): number {
  return SIEGE.supplyTurnsByLevel[city.buildings.government] + (city.isCapital ? SIEGE.capitalExtraTurns : 0);
}

/** Turns a besieged city has left before it surrenders (its remaining supplies). */
export function turnsUntilSurrender(city: City): number {
  return city.supplies;
}

/** Enemy cities next to an army, which it could besiege. */
export function besiegeTargets(ctx: GameContext, state: GameState, army: Army): City[] {
  const near = new Set(ctx.topology.neighbors(army.tile));
  return Object.values(state.cities).filter((c) => c.owner !== army.owner && near.has(c.tile));
}

export function canBesiege(ctx: GameContext, state: GameState, factionId: FactionId, armyId: ArmyId, cityTile: TileId): Check {
  const army = state.armies[armyId];
  if (!army || army.owner !== factionId) return { ok: false, reason: "That army isn't yours." };
  if (besiegedCity(state, army)) return { ok: false, reason: SHUT_IN };
  const city = besiegeTargets(ctx, state, army).find((c) => c.tile === cityTile);
  if (!city) return { ok: false, reason: "Armies can only besiege an enemy city next to them." };
  if (city.besiegedBy === factionId) return { ok: false, reason: `You're already besieging ${city.name}.` };
  if (city.besiegedBy) {
    const by = getFaction(state, city.besiegedBy)?.shortName ?? "another faction";
    return { ok: false, reason: `${city.name} is already besieged by ${by}.` };
  }
  return { ok: true };
}

/** Puts a city under siege. Call canBesiege first. Doesn't use the army's movement. */
export function besiege(state: GameState, factionId: FactionId, cityTile: TileId): GameState {
  const city = Object.values(state.cities).find((c) => c.tile === cityTile)!;
  const name = getFaction(state, factionId)?.shortName ?? "Unknown";
  const next = { ...state, cities: { ...state.cities, [city.id]: { ...city, besiegedBy: factionId } } };
  return addLog(next, `${name} laid siege to ${city.name}.`, { kind: "siege", factions: [factionId, city.owner] });
}

/** Whether a faction can call off its siege of a city. */
export function canLiftSiege(state: GameState, factionId: FactionId, cityId: string): Check {
  const city = state.cities[cityId];
  if (!city || city.besiegedBy !== factionId) return { ok: false, reason: "You aren't besieging that city." };
  return { ok: true };
}

/** Calls off a siege. The besieging armies stay where they are; the city starts restocking. */
export function liftSiege(state: GameState, factionId: FactionId, cityId: string): GameState {
  const city = state.cities[cityId];
  const name = getFaction(state, factionId)?.shortName ?? "Unknown";
  const next = setCity(state, { ...city, besiegedBy: null });
  return addLog(next, `${name} lifted the siege of ${city.name}.`, { kind: "siege", factions: [factionId, city.owner] });
}

/**
 * Runs at the end of the besieger's turn, for each city it's besieging. The
 * siege holds only if one of its armies is still next to the city. A held
 * siege wears the city down a little every turn (attrition) and uses up a
 * turn of supplies. When the supplies run out, the city surrenders.
 */
export function processSieges(ctx: GameContext, state: GameState, besiegerId: FactionId): GameState {
  let next = state;
  const name = getFaction(state, besiegerId)?.shortName ?? "Unknown";
  const besieged = Object.values(state.cities).filter((c) => c.besiegedBy === besiegerId);

  for (const original of besieged) {
    const city = next.cities[original.id];
    if (!city || city.besiegedBy !== besiegerId) continue;

    if (!besiegerStillThere(ctx, next, besiegerId, city)) {
      next = setCity(next, { ...city, besiegedBy: null });
      next = addLog(next, `${name} lifted the siege of ${city.name}.`, { kind: "siege", factions: [besiegerId, city.owner] });
      continue;
    }

    next = attrition(next, city);
    const worn = next.cities[city.id];
    const supplies = Math.max(0, worn.supplies - 1);
    next = setCity(next, { ...worn, supplies });
    if (supplies === 0) next = surrender(ctx, next, besiegerId, next.cities[city.id]);
  }
  return next;
}

/** A besieged city loses a little of its garrison and its people each turn. */
function attrition(state: GameState, city: City): GameState {
  let next = setCity(state, {
    ...city,
    population: Math.max(1, Math.round(city.population * (1 - SIEGE.populationAttrition))),
  });
  const garrison = armyAt(next, city.tile);
  if (!garrison || garrison.owner !== city.owner) return next;

  const soldiers = garrison.regiments.reduce((sum, r) => sum + r.soldiers, 0);
  const lost = Math.max(1, Math.round(soldiers * SIEGE.garrisonAttrition));
  const regiments = applyLosses(garrison.regiments, lost);
  const armies = { ...next.armies };
  if (regiments.length > 0) armies[garrison.id] = { ...garrison, regiments };
  else delete armies[garrison.id];
  return { ...next, armies };
}

/**
 * A city out of supplies surrenders: its garrison is destroyed, the city and
 * its land go to the besieger, and the besieger's strongest army next to it
 * marches in (if it can fit).
 */
function surrender(ctx: GameContext, state: GameState, besiegerId: FactionId, city: City): GameState {
  const previousOwner = city.owner;
  const name = getFaction(state, besiegerId)?.shortName ?? "Unknown";
  const armies = { ...state.armies };
  const garrison = armyAt(state, city.tile);
  if (garrison && garrison.owner !== besiegerId) delete armies[garrison.id];

  let next = captureCity({ ...state, armies }, city.id, besiegerId);

  const near = new Set(ctx.topology.neighbors(city.tile));
  const strongest = armiesOf(next, besiegerId)
    .filter((a) => near.has(a.tile))
    .sort((a, b) => armySoldiers(b) - armySoldiers(a))[0];
  if (strongest) {
    next = { ...next, armies: { ...next.armies, [strongest.id]: { ...strongest, tile: city.tile } } };
  }

  next = addLog(
    next,
    `${city.name} ran out of supplies and surrendered to ${name}.${garrison && garrison.owner !== besiegerId ? " Its garrison was destroyed." : ""}`,
    { kind: "siege", factions: [besiegerId, previousOwner], major: true },
  );
  return eliminateIfDefeated(next, previousOwner);
}

/** At the end of the owner's turn, cities that aren't besieged restock a little. */
export function restockSupplies(state: GameState, ownerId: FactionId): GameState {
  let next = state;
  for (const city of Object.values(state.cities)) {
    if (city.owner !== ownerId || city.besiegedBy) continue;
    const supplies = Math.min(maxSupplies(city), city.supplies + SIEGE.restockPerTurn);
    if (supplies !== city.supplies) next = setCity(next, { ...city, supplies });
  }
  return next;
}

function besiegerStillThere(ctx: GameContext, state: GameState, besiegerId: FactionId, city: City): boolean {
  const near = new Set(ctx.topology.neighbors(city.tile));
  return armiesOf(state, besiegerId).some((a) => near.has(a.tile));
}

function setCity(state: GameState, city: City): GameState {
  return { ...state, cities: { ...state.cities, [city.id]: city } };
}

