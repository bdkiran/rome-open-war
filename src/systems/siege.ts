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
import { besiegedCity, SHUT_IN, siegeWorksPerTurn } from "@/systems/armies.js";
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
  const next = { ...state, cities: { ...state.cities, [city.id]: { ...city, besiegedBy: factionId, besiegedSince: state.turn } } };
  return addLog(next, `${name} laid siege to ${city.name}.`, { kind: "siege", factions: [factionId, city.owner] });
}

/** Whether a faction can call off its siege of a city. */
export function canLiftSiege(state: GameState, factionId: FactionId, cityId: string): Check {
  const city = state.cities[cityId];
  if (!city || city.besiegedBy !== factionId) return { ok: false, reason: "You aren't besieging that city." };
  return { ok: true };
}

/** Calls off a siege. The besieging armies stay where they are; the city's supplies are refilled. */
export function liftSiege(state: GameState, factionId: FactionId, cityId: string): GameState {
  const name = getFaction(state, factionId)?.shortName ?? "Unknown";
  return endSiege(state, cityId, `${name} lifted the siege of ${state.cities[cityId].name}.`);
}

/**
 * Ends a siege, however it ends short of surrender: the city is free and
 * its supplies are refilled at once, so another siege starts from full
 * stores rather than where the last one left off.
 */
function endSiege(state: GameState, cityId: string, text: string): GameState {
  const city = state.cities[cityId];
  const besieger = city.besiegedBy;
  const next = setCity(state, { ...city, besiegedBy: null, besiegedSince: null, siegeWorks: 0, supplies: maxSupplies(city) });
  return addLog(next, text, { kind: "siege", factions: besieger ? [besieger, city.owner] : [city.owner] });
}

/**
 * After a battle `besiegerId` lost at `tile`: any siege it holds on a city
 * there or next to it is broken at once. A failed storm, a garrison's
 * successful sally and a relief force beating the besiegers all end the
 * siege, rather than leaving the city to surrender at the end of the turn.
 */
export function breakSieges(ctx: GameContext, state: GameState, besiegerId: FactionId, tile: TileId): GameState {
  let next = state;
  for (const city of Object.values(state.cities)) {
    if (city.besiegedBy !== besiegerId) continue;
    if (city.tile !== tile && ctx.topology.distance(city.tile, tile) !== 1) continue;
    next = endSiege(next, city.id, `The siege of ${city.name} was broken.`);
  }
  return next;
}

/**
 * Runs at the end of the besieger's turn, for each city it's besieging. The
 * siege holds only if one of its armies is still next to the city. The turn
 * it's laid costs the city nothing. From the first full turn, each held turn
 * wears the city down a little (attrition) and uses up a turn of supplies, so
 * a city with 3 turns of supplies holds out for 3 full turns. When the
 * supplies run out, the city surrenders. If attrition kills the last of the
 * garrison, the besieger marches in at once.
 */
export function processSieges(ctx: GameContext, state: GameState, besiegerId: FactionId): GameState {
  let next = state;
  const name = getFaction(state, besiegerId)?.shortName ?? "Unknown";
  const besieged = Object.values(state.cities).filter((c) => c.besiegedBy === besiegerId);

  for (const original of besieged) {
    const city = next.cities[original.id];
    if (!city || city.besiegedBy !== besiegerId) continue;

    if (!besiegerStillThere(ctx, next, besiegerId, city)) {
      next = endSiege(next, city.id, `${name} lifted the siege of ${city.name}.`);
      continue;
    }

    // The works go up from the turn the siege is laid, which costs the city nothing else.
    if (city.buildings.walls > 0) {
      const works = Math.min(SIEGE.maxWorks, city.siegeWorks + siegeWorksPerTurn(ctx, next, besiegerId, city));
      next = setCity(next, { ...city, siegeWorks: works });
    }

    if (city.besiegedSince === next.turn) continue;

    const held = armyAt(next, city.tile) !== undefined;
    next = attrition(next, next.cities[city.id]);
    if (held && !armyAt(next, city.tile)) {
      next = garrisonFell(ctx, next, besiegerId, next.cities[city.id]);
      continue;
    }
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

  const next = addLog(
    marchIn(ctx, { ...state, armies }, besiegerId, city),
    `${city.name} ran out of supplies and surrendered to ${name}.${garrison && garrison.owner !== besiegerId ? " Its garrison was destroyed." : ""}`,
    { kind: "siege", factions: [besiegerId, previousOwner], major: true },
  );
  return eliminateIfDefeated(next, previousOwner);
}

/** The city goes to the besieger, and its strongest army next to the city moves in. */
function marchIn(ctx: GameContext, state: GameState, besiegerId: FactionId, city: City): GameState {
  const next = captureCity(state, city.id, besiegerId);
  const near = new Set(ctx.topology.neighbors(city.tile));
  const strongest = armiesOf(next, besiegerId)
    .filter((a) => near.has(a.tile))
    .sort((a, b) => armySoldiers(b) - armySoldiers(a))[0];
  if (!strongest) return next;
  const regiments = strongest.regiments.map((r) => ({ ...r, movementLeft: 0 })); // Taking a city ends its move.
  return { ...next, armies: { ...next.armies, [strongest.id]: { ...strongest, tile: city.tile, regiments } } };
}

/** A besieged city's garrison is dead: the besieger takes the city at once, before anyone else can walk in. */
function garrisonFell(ctx: GameContext, state: GameState, besiegerId: FactionId, city: City): GameState {
  const name = getFaction(state, besiegerId)?.shortName ?? "Unknown";
  const next = addLog(marchIn(ctx, state, besiegerId, city), `${city.name}'s garrison fell, and ${name} marched in.`, {
    kind: "siege",
    factions: [besiegerId, city.owner],
    major: true,
  });
  return eliminateIfDefeated(next, city.owner);
}

/**
 * After a battle: any besieged city whose garrison died in it goes to its
 * besieger straight away, whoever's turn it is, and the battle's report says
 * so. `before` is the state before the battle; a city that was already empty
 * isn't affected.
 */
export function takeCitiesWithFallenGarrisons(ctx: GameContext, before: GameState, after: GameState): GameState {
  let next = after;
  for (const city of Object.values(after.cities)) {
    const besieger = city.besiegedBy;
    if (!besieger || !armyAt(before, city.tile) || armyAt(after, city.tile)) continue;
    if (!besiegerStillThere(ctx, after, besieger, city)) continue;
    next = garrisonFell(ctx, next, besieger, city);
    const battles = [...next.battles];
    battles[battles.length - 1] = { ...battles[battles.length - 1], cityCaptured: city.name };
    next = { ...next, battles };
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

