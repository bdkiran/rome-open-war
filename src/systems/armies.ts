import type { GameContext } from "@/core/context.js";
import {
  armiesOf,
  armyAt,
  armySoldiers,
  cityAt,
  getFaction,
  updateFaction,
  type Army,
  type City,
  type ArmyId,
  type Check,
  type CityId,
  type FactionId,
  type GameState,
  type Regiment,
  type RegimentId,
} from "@/core/state.js";
import { TERRAIN } from "@/data/terrain.js";
import { ARMY_RULES, UNITS, regimentSize, type UnitType } from "@/data/units.js";
import type { TileId } from "@/map/topology.js";
import { costToTarget } from "@/systems/pathfinding.js";

const fmt = (n: number) => n.toLocaleString("en-US");

// ---- Costs --------------------------------------------------------------

export interface TrainingCost {
  gold: number;
  population: number;
}

/** Gold and people to train this many soldiers of a type. Gold is rounded up to a whole coin (militia cost half a gold each). */
export function trainingCost(unit: UnitType, soldiers: number): TrainingCost {
  return {
    gold: Math.ceil(soldiers * UNITS[unit].goldPerSoldier),
    population: soldiers * ARMY_RULES.populationPerSoldier,
  };
}

/** Gold per turn to keep this many soldiers of a type. Not rounded. */
export function upkeepFor(unit: UnitType, soldiers: number): number {
  return soldiers * UNITS[unit].upkeep;
}

/** Total gold per turn a faction pays for all its regiments, rounded. */
export function factionUpkeep(state: GameState, factionId: FactionId): number {
  let total = 0;
  for (const army of armiesOf(state, factionId)) {
    for (const r of army.regiments) total += upkeepFor(r.unit, r.soldiers);
  }
  return Math.round(total);
}

/**
 * Pays a faction's upkeep. If the treasury can't cover it, the faction goes
 * into debt: gold can go below zero. A faction in debt can't train until it
 * earns its way back.
 */
export function payUpkeep(state: GameState, factionId: FactionId): GameState {
  const upkeep = factionUpkeep(state, factionId);
  if (upkeep === 0) return state;
  return updateFaction(state, factionId, (f) => ({ ...f, gold: f.gold - upkeep }));
}

// ---- Training -----------------------------------------------------------

/** Cost of training one full regiment. */
export function regimentCost(unit: UnitType): TrainingCost {
  return trainingCost(unit, regimentSize(unit));
}

/** Adds a new army with the given regiments. */
export function placeNewArmy(state: GameState, owner: FactionId, tile: TileId, regiments: Regiment[]): GameState {
  const army: Army = { id: `army${state.nextArmyNumber}`, owner, tile, regiments, destination: null };
  return { ...state, armies: { ...state.armies, [army.id]: army }, nextArmyNumber: state.nextArmyNumber + 1 };
}

// ---- Merging and replenishing ------------------------------------------

/** Whether merging would do anything: some unit type in the army has two or more under-strength regiments. */
export function canMerge(army: Army): boolean {
  const damaged = new Map<UnitType, number>();
  for (const r of army.regiments) {
    if (r.soldiers < regimentSize(r.unit)) damaged.set(r.unit, (damaged.get(r.unit) ?? 0) + 1);
  }
  return [...damaged.values()].some((n) => n >= 2);
}

/**
 * Combines under-strength regiments of the same type into as few as
 * possible: full regiments, plus one holding any remainder (so 120 and 140
 * Spearmen become 200 and 60). Full regiments are left alone. Free, and takes no
 * movement, but a merged regiment moves at the pace of the slowest regiment
 * that went into it.
 */
export function mergeRegiments(state: GameState, armyId: ArmyId): GameState {
  const army = state.armies[armyId];
  const damaged = (r: Regiment) => r.soldiers < regimentSize(r.unit);
  const regiments: Regiment[] = army.regiments.filter((r) => !damaged(r));

  for (const unit of [...new Set(army.regiments.map((r) => r.unit))]) {
    const group = army.regiments.filter((r) => r.unit === unit && damaged(r));
    if (group.length === 0) continue;
    let soldiers = group.reduce((sum, r) => sum + r.soldiers, 0);
    const movementLeft = Math.min(...group.map((r) => r.movementLeft));
    const pinned = group.some((r) => r.pinned);
    // Keep the ids of the first regiments in the group; the rest are folded in.
    for (const original of group) {
      if (soldiers <= 0) break;
      const size = Math.min(regimentSize(unit), soldiers);
      regiments.push({ ...original, soldiers: size, movementLeft, pinned });
      soldiers -= size;
    }
  }
  return { ...state, armies: { ...state.armies, [armyId]: { ...army, regiments } } };
}

// ---- Choosing regiments -------------------------------------------------

/** The chosen regiments of an army, or null if any id isn't in it or none were chosen. */
export function pickRegiments(army: Army, regimentIds: readonly RegimentId[]): Regiment[] | null {
  if (regimentIds.length === 0) return null;
  const picked = army.regiments.filter((r) => regimentIds.includes(r.id));
  return picked.length === new Set(regimentIds).size ? picked : null;
}

// ---- Movement -----------------------------------------------------------

/**
 * Every tile the chosen regiments can reach this turn, moving together,
 * mapped to the movement they'd have left. The slowest regiment sets the pace.
 *
 * They can take one step at the start of the turn however costly the terrain,
 * pass through friendly armies, and stop on one if the combined stack stays
 * within the regiment limit. They can't pass enemy armies or enemy cities,
 * and can't go on past any tile next to an enemy army (its zone of control):
 * they can step into one, but must stop there. Regiments already stopped
 * that way this turn can't move at all, and nor can a besieged garrison: it
 * can't leave its walls.
 */
export function reachableTiles(
  ctx: GameContext,
  state: GameState,
  army: Army,
  regimentIds: readonly RegimentId[],
): Map<TileId, number> {
  const moving = pickRegiments(army, regimentIds);
  if (!moving || moving.some((r) => r.pinned) || besiegedCity(state, army)) return new Map();

  const budget = Math.min(...moving.map((r) => r.movementLeft));
  const freshTurn = moving.every((r) => r.movementLeft === UNITS[r.unit].movement);
  const zoc = zoneOfControl(ctx, state, army.owner);

  const enemyTiles = new Set<TileId>();
  const friendlyRoom = new Map<TileId, number>();
  for (const other of Object.values(state.armies)) {
    if (other.owner !== army.owner) enemyTiles.add(other.tile);
    else if (other.id !== army.id) friendlyRoom.set(other.tile, ARMY_RULES.maxRegiments - other.regiments.length);
  }
  for (const city of Object.values(state.cities)) {
    if (city.owner !== army.owner) enemyTiles.add(city.tile);
  }

  const best = new Map<TileId, number>([[army.tile, budget]]);
  const queue: TileId[] = [army.tile];
  while (queue.length > 0) {
    // Expand the tile with the most movement left first (a small Dijkstra).
    queue.sort((a, b) => best.get(b)! - best.get(a)!);
    const tile = queue.shift()!;
    const left = best.get(tile)!;
    if (left <= 0) continue;
    // Entering an enemy's zone of control ends the move: no going on from there.
    if (tile !== army.tile && zoc.has(tile)) continue;

    for (const n of ctx.topology.neighbors(tile)) {
      const terrain = TERRAIN[state.tiles[n].terrain];
      if (!terrain.passable || enemyTiles.has(n)) continue;

      let after: number;
      if (terrain.moveCost <= left) after = left - terrain.moveCost;
      else if (tile === army.tile && freshTurn) after = 0;
      else continue;

      if (after > (best.get(n) ?? -1)) {
        best.set(n, after);
        queue.push(n);
      }
    }
  }

  best.delete(army.tile);
  for (const [tile, room] of friendlyRoom) {
    if (room < moving.length) best.delete(tile);
  }
  return best;
}

export function canMove(
  ctx: GameContext,
  state: GameState,
  factionId: FactionId,
  armyId: ArmyId,
  regimentIds: readonly RegimentId[],
  to: TileId,
): Check {
  const army = state.armies[armyId];
  if (!army || army.owner !== factionId) return { ok: false, reason: "That army isn't yours." };
  const moving = pickRegiments(army, regimentIds);
  if (!moving) return { ok: false, reason: "Choose which regiments to move." };
  if (besiegedCity(state, army)) return { ok: false, reason: SHUT_IN };
  if (moving.some((r) => r.movementLeft <= 0)) return { ok: false, reason: "Some chosen regiments have no movement left." };
  if (!reachableTiles(ctx, state, army, regimentIds).has(to)) {
    return { ok: false, reason: "Those regiments can't reach that tile this turn." };
  }
  return { ok: true };
}

/**
 * Moves the chosen regiments. Call canMove first. Moving only some regiments
 * splits the army; stopping on a friendly army merges into it. A move given
 * by hand cancels any march order the army was following.
 */
export function moveRegiments(
  ctx: GameContext,
  state: GameState,
  armyId: ArmyId,
  regimentIds: readonly RegimentId[],
  to: TileId,
): GameState {
  const army = state.armies[armyId];
  const moving = pickRegiments(army, regimentIds)!;
  const budget = Math.min(...moving.map((r) => r.movementLeft));
  const spent = budget - (reachableTiles(ctx, state, army, regimentIds).get(to) ?? 0);
  const pinned = zoneOfControl(ctx, state, army.owner).has(to);
  const moved = moving.map((r) => ({ ...r, movementLeft: Math.max(0, r.movementLeft - spent), pinned: r.pinned || pinned }));

  const next = relocate(state, army, moved, to);
  const holder = armyHolding(next, moved[0].id);
  return holder && holder.destination !== null
    ? { ...next, armies: { ...next.armies, [holder.id]: { ...holder, destination: null } } }
    : next;
}

/**
 * Takes regiments out of an army and puts them on another tile, merging into
 * a friendly army there or forming a new one. Removes the original army if
 * it's left empty.
 */
export function relocate(state: GameState, from: Army, moved: Regiment[], to: TileId): GameState {
  const movedIds = new Set(moved.map((r) => r.id));
  const staying = from.regiments.filter((r) => !movedIds.has(r.id));
  const armies = { ...state.armies };
  let next: GameState = state;

  if (staying.length > 0) armies[from.id] = { ...from, regiments: staying };
  else delete armies[from.id];

  const host = Object.values(armies).find((a) => a.tile === to && a.owner === from.owner);
  if (host) {
    armies[host.id] = { ...host, regiments: [...host.regiments, ...moved] };
    return { ...next, armies };
  }
  if (staying.length === 0) {
    armies[from.id] = { ...from, tile: to, regiments: moved };
    return { ...next, armies };
  }
  next = { ...next, armies };
  return placeNewArmy(next, from.owner, to, moved);
}

/**
 * Tiles next to any enemy army of `owner`: its enemies' zones of control.
 * An army that moves into one has to stop there.
 */
export function zoneOfControl(ctx: GameContext, state: GameState, owner: FactionId): Set<TileId> {
  const zone = new Set<TileId>();
  for (const enemy of Object.values(state.armies)) {
    if (enemy.owner === owner) continue;
    for (const t of ctx.topology.neighbors(enemy.tile)) zone.add(t);
  }
  return zone;
}

/** Refills movement for every regiment a faction owns, including last turn's recruits. Runs at the start of its turn. */
export function refreshMovement(state: GameState, factionId: FactionId): GameState {
  const armies = { ...state.armies };
  for (const army of armiesOf(state, factionId)) {
    armies[army.id] = {
      ...army,
      regiments: army.regiments.map((r) => ({ ...r, movementLeft: UNITS[r.unit].movement, pinned: false })),
    };
  }
  return { ...state, armies };
}

// ---- March orders -------------------------------------------------------

/**
 * Whether the chosen regiments can be sent to march to `destination` over
 * several turns. They need a land route that avoids enemy armies and cities.
 */
export function canMarch(
  ctx: GameContext,
  state: GameState,
  factionId: FactionId,
  armyId: ArmyId,
  regimentIds: readonly RegimentId[],
  destination: TileId,
): Check {
  const army = state.armies[armyId];
  if (!army || army.owner !== factionId) return { ok: false, reason: "That army isn't yours." };
  if (!pickRegiments(army, regimentIds)) return { ok: false, reason: "Choose which regiments to send." };
  if (besiegedCity(state, army)) return { ok: false, reason: SHUT_IN };
  if (destination === army.tile) return { ok: false, reason: "The army is already there." };
  if (!costToTarget(ctx, state, destination, factionId).has(army.tile)) {
    return { ok: false, reason: "There's no route there over land." };
  }
  return { ok: true };
}

/**
 * Sends the chosen regiments marching to `destination`. They move as far as
 * they can right away, and keep going at the start of each of the owner's
 * turns until they arrive. Call canMarch first.
 */
export function march(
  ctx: GameContext,
  state: GameState,
  armyId: ArmyId,
  regimentIds: readonly RegimentId[],
  destination: TileId,
): GameState {
  let next = state;
  const army = state.armies[armyId];
  const step = marchStep(ctx, state, army, regimentIds, destination);
  if (step) next = moveRegiments(ctx, state, armyId, regimentIds, step);

  const holder = armyHolding(next, regimentIds[0])!;
  if (holder.tile === destination) return next;
  return { ...next, armies: { ...next.armies, [holder.id]: { ...holder, destination } } };
}

/**
 * For each tile of a march route, the turn the army gets there: 0 for this
 * turn (with the movement it has left), 1 for the next, and so on. Each turn
 * it spends its movement tile by tile, and it can always take one step on a
 * turn it starts fresh, however rough the ground.
 */
export function marchSchedule(state: GameState, army: Army, route: readonly TileId[]): number[] {
  const full = Math.min(...army.regiments.map((r) => UNITS[r.unit].movement));
  let left = Math.min(...army.regiments.map((r) => r.movementLeft));
  let turn = 0;
  let fresh = army.regiments.every((r) => r.movementLeft === UNITS[r.unit].movement);
  return route.map((tile) => {
    const cost = TERRAIN[state.tiles[tile].terrain].moveCost;
    if (cost > left && !fresh) {
      turn++;
      left = full;
      fresh = true;
    }
    left = Math.max(0, left - cost);
    fresh = false;
    return turn;
  });
}

/** Stops an army's march. */
export function cancelMarch(state: GameState, armyId: ArmyId): GameState {
  const army = state.armies[armyId];
  if (!army || army.destination === null) return state;
  return { ...state, armies: { ...state.armies, [armyId]: { ...army, destination: null } } };
}

/**
 * At the end of a faction's turn, each army with a march order takes a step
 * toward its destination with whatever movement it has left (all of it, if
 * it hasn't moved this turn). An army stops, and its order is cleared, when
 * it arrives, when its way is blocked, or when an enemy army is next to it.
 */
export function continueMarches(ctx: GameContext, state: GameState, factionId: FactionId): GameState {
  let next = state;
  for (const original of armiesOf(state, factionId)) {
    const army = next.armies[original.id];
    if (!army || army.destination === null) continue;
    const destination = army.destination;

    const enemyNear = ctx.topology.neighbors(army.tile).some((t) => {
      const other = armyAt(next, t);
      return other !== undefined && other.owner !== factionId;
    });
    const ids = army.regiments.map((r) => r.id);
    const step = enemyNear ? null : marchStep(ctx, next, army, ids, destination);
    if (!step) {
      // Too little movement left this turn to take a step: it waits for the next.
      // Only if it couldn't step even with full movement is the way truly blocked.
      const rested = { ...army, regiments: army.regiments.map((r) => ({ ...r, movementLeft: UNITS[r.unit].movement })) };
      const blocked = enemyNear || !marchStep(ctx, next, rested, ids, destination);
      if (blocked) next = cancelMarch(next, army.id);
      continue;
    }

    next = moveRegiments(ctx, next, army.id, ids, step);
    const holder = armyHolding(next, ids[0])!;
    if (holder.tile !== destination) {
      next = { ...next, armies: { ...next.armies, [holder.id]: { ...holder, destination } } };
    }
  }
  return next;
}

/** The reachable tile that gets the regiments closest to `destination` this turn, if any gets them closer. */
function marchStep(
  ctx: GameContext,
  state: GameState,
  army: Army,
  regimentIds: readonly RegimentId[],
  destination: TileId,
): TileId | null {
  const cost = costToTarget(ctx, state, destination, army.owner);
  let best: TileId | null = null;
  let bestCost = cost.get(army.tile) ?? Infinity;
  for (const tile of reachableTiles(ctx, state, army, regimentIds).keys()) {
    const c = cost.get(tile) ?? Infinity;
    if (c < bestCost) {
      best = tile;
      bestCost = c;
    }
  }
  return best;
}

/**
 * The route an army would take to `destination`, as a list of tiles from
 * the one after its own to the destination, following the cheapest path.
 * Empty if there's no route.
 */
export function marchRoute(ctx: GameContext, state: GameState, army: Army, destination: TileId): TileId[] {
  const cost = costToTarget(ctx, state, destination, army.owner);
  const route: TileId[] = [];
  let here = army.tile;
  if (!cost.has(here)) return route;
  while (here !== destination && route.length < 500) {
    let best: TileId | null = null;
    let bestCost = cost.get(here)!;
    for (const n of ctx.topology.neighbors(here)) {
      const c = cost.get(n);
      if (c !== undefined && c < bestCost) {
        best = n;
        bestCost = c;
      }
    }
    if (!best) break;
    route.push(best);
    here = best;
  }
  return route;
}

/** Whether every regiment in the army has used up its movement. */
export function isSpent(army: Army): boolean {
  return army.regiments.every((r) => r.movementLeft <= 0);
}

// ---- Targets ------------------------------------------------------------

/** Adjacent tiles an army of `owner` standing on `tile` could attack: enemy armies, or enemy cities with no army in them. */
function attackableFrom(ctx: GameContext, state: GameState, owner: FactionId, tile: TileId): TileId[] {
  return ctx.topology.neighbors(tile).filter((n) => {
    const other = armyAt(state, n);
    if (other) return other.owner !== owner;
    const city = cityAt(state, n);
    return city !== undefined && city.owner !== owner;
  });
}

/**
 * Tiles the chosen regiments can attack without moving: adjacent enemy
 * armies, or adjacent enemy cities with no army in them (attacking one
 * captures it). Every chosen regiment needs movement left.
 */
export function attackTargets(
  ctx: GameContext,
  state: GameState,
  army: Army,
  regimentIds: readonly RegimentId[],
): TileId[] {
  const attackers = pickRegiments(army, regimentIds);
  if (!attackers || attackers.some((r) => r.movementLeft <= 0)) return [];
  return attackableFrom(ctx, state, army.owner, army.tile).filter((t) => mayFightAt(state, army, t));
}

/** Why a besieged garrison can't be ordered out. */
export const SHUT_IN = "A besieged garrison can't leave its walls. It can only attack the besiegers.";

/** The city an army is shut up in, if it's the garrison of one of its own cities under siege. */
export function besiegedCity(state: GameState, army: Army): City | null {
  const city = cityAt(state, army.tile);
  return city && city.owner === army.owner && city.besiegedBy ? city : null;
}

/**
 * Whether an army may take part in a battle at `target`. A besieged garrison
 * can only fight the besiegers' armies outside its walls; any other army can
 * fight anywhere.
 */
export function mayFightAt(state: GameState, army: Army, target: TileId): boolean {
  const city = besiegedCity(state, army);
  if (!city) return true;
  const enemy = armyAt(state, target);
  return enemy !== undefined && enemy.owner === city.besiegedBy;
}

/**
 * Everything the chosen regiments can attack this turn, including enemies
 * they'd have to march up to first. Each target maps to the tile they'd
 * attack from: where they stand if it's adjacent, otherwise the reachable
 * tile next to it that leaves them the most movement (they need some left to
 * attack).
 */
export function attackOptions(
  ctx: GameContext,
  state: GameState,
  army: Army,
  regimentIds: readonly RegimentId[],
): Map<TileId, TileId> {
  const attackers = pickRegiments(army, regimentIds);
  if (!attackers || attackers.some((r) => r.movementLeft <= 0)) return new Map();

  const best = new Map<TileId, { via: TileId; left: number }>();
  const consider = (via: TileId, left: number) => {
    for (const target of attackableFrom(ctx, state, army.owner, via)) {
      const current = best.get(target);
      if (!current || left > current.left) best.set(target, { via, left });
    }
  };

  consider(army.tile, Math.min(...attackers.map((r) => r.movementLeft)));
  // A besieged garrison fights only from its walls, and only the besiegers.
  if (besiegedCity(state, army)) {
    return new Map([...best].filter(([target]) => mayFightAt(state, army, target)).map(([target, { via }]) => [target, via]));
  }
  for (const [tile, left] of reachableTiles(ctx, state, army, regimentIds)) {
    if (left > 0) consider(tile, left);
  }
  return new Map([...best].map(([target, { via }]) => [target, via]));
}

/** The army that currently holds a regiment, wherever it has moved or merged to. */
export function armyHolding(state: GameState, regimentId: RegimentId): Army | undefined {
  return Object.values(state.armies).find((a) => a.regiments.some((r) => r.id === regimentId));
}

/** The unit type with the most soldiers in an army. */
export function mainUnit(army: Army): UnitType {
  const totals = new Map<UnitType, number>();
  for (const r of army.regiments) totals.set(r.unit, (totals.get(r.unit) ?? 0) + r.soldiers);
  return [...totals].sort((a, b) => b[1] - a[1])[0][0];
}

/** "400 Spearmen", or "300 Spearmen and 200 Cavalry" for a mix. */
export function describeRegiments(regiments: readonly Regiment[]): string {
  const totals = new Map<UnitType, number>();
  for (const r of regiments) totals.set(r.unit, (totals.get(r.unit) ?? 0) + r.soldiers);
  const parts = [...totals].map(([unit, soldiers]) => `${fmt(soldiers)} ${UNITS[unit].name}`);
  if (parts.length <= 1) return parts[0] ?? "no soldiers";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

