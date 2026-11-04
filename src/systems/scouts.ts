import type { GameContext } from "@/core/context.js";
import { addLog, getFaction, type Check, type FactionId, type GameState, type Scout, type ScoutId } from "@/core/state.js";
import { TERRAIN } from "@/data/terrain.js";
import type { TileId } from "@/map/topology.js";
import { enterCost } from "@/systems/pathfinding.js";

/** A faction's scouts. */
export function scoutsOf(state: GameState, factionId: FactionId): Scout[] {
  return Object.values(state.scouts).filter((s) => s.owner === factionId);
}

/** A faction's scout on a tile, if any: it can have at most one on each. */
export function scoutAt(state: GameState, tile: TileId, factionId: FactionId): Scout | undefined {
  return Object.values(state.scouts).find((s) => s.tile === tile && s.owner === factionId);
}

/**
 * The tiles a scout can reach this turn, with the movement it would have left.
 * It ignores zones of control and walks through armies and cities, enemy ones
 * too; it only can't stop where another of its faction's scouts stands.
 */
export function reachableScoutTiles(ctx: GameContext, state: GameState, scout: Scout): Map<TileId, number> {
  const best = new Map<TileId, number>([[scout.tile, scout.movementLeft]]);
  const queue: TileId[] = [scout.tile];
  while (queue.length > 0) {
    // Expand the tile with the most movement left first (a small Dijkstra).
    queue.sort((a, b) => best.get(b)! - best.get(a)!);
    const tile = queue.shift()!;
    const left = best.get(tile)!;
    for (const n of ctx.topology.neighbors(tile)) {
      if (!TERRAIN[state.tiles[n].terrain].passable) continue;
      const after = left - enterCost(state, n);
      if (after >= 0 && after > (best.get(n) ?? -1)) {
        best.set(n, after);
        queue.push(n);
      }
    }
  }
  best.delete(scout.tile);
  for (const other of scoutsOf(state, scout.owner)) best.delete(other.tile);
  return best;
}

/** Whether a faction's scout can move to a tile now. */
export function canMoveScout(ctx: GameContext, state: GameState, factionId: FactionId, scoutId: ScoutId, to: TileId): Check {
  const scout = state.scouts[scoutId];
  if (!scout || scout.owner !== factionId) return { ok: false, reason: "That scout isn't yours." };
  if (!reachableScoutTiles(ctx, state, scout).has(to)) return { ok: false, reason: "The scout can't reach that tile this turn." };
  return { ok: true };
}

/** Moves a scout. Call canMoveScout first. */
export function moveScout(ctx: GameContext, state: GameState, scoutId: ScoutId, to: TileId): GameState {
  const scout = state.scouts[scoutId];
  const movementLeft = reachableScoutTiles(ctx, state, scout).get(to)!;
  return { ...state, scouts: { ...state.scouts, [scoutId]: { ...scout, tile: to, movementLeft } } };
}

/** Sends a scout home for good, ending its upkeep. There's no refund. */
export function dismissScout(state: GameState, scoutId: ScoutId): GameState {
  const { [scoutId]: gone, ...scouts } = state.scouts;
  return addLog({ ...state, scouts }, `${getFaction(state, gone.owner)?.shortName ?? "A faction"} dismissed a scout.`, {
    kind: "recruitment",
    factions: [gone.owner],
  });
}
