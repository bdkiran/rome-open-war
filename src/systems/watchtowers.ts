import {
  addLog,
  armyAt,
  cityAt,
  getFaction,
  updateFaction,
  type Check,
  type FactionId,
  type GameState,
} from "@/core/state.js";
import { TERRAIN } from "@/data/terrain.js";
import { WATCHTOWER } from "@/data/watchtowers.js";
import type { TileId } from "@/map/topology.js";
import { regionOwner } from "@/systems/cities.js";

const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * Who owns a watchtower: whoever owns the city whose region it stands in.
 * It's never stored, so a tower changes hands with its city.
 */
export function towerOwner(state: GameState, tile: TileId): FactionId | undefined {
  return regionOwner(state, tile);
}

/**
 * The faction that sees from a watchtower right now, if any: its owner,
 * unless an enemy army stands on it, in which case that army's faction sees
 * through it instead and the owner is blinded until it leaves.
 */
export function towerSighter(state: GameState, tile: TileId): FactionId | undefined {
  if (!state.watchtowers[tile]) return undefined;
  const owner = towerOwner(state, tile);
  const occupier = armyAt(state, tile)?.owner;
  return occupier && occupier !== owner ? occupier : owner;
}

/** Tiles of a faction's watchtowers. */
export function towersOf(state: GameState, factionId: FactionId): TileId[] {
  return Object.keys(state.watchtowers).filter((tile) => towerOwner(state, tile) === factionId);
}

/**
 * Whether a faction can build a watchtower on a tile now: land in the region
 * of one of its cities, not the city itself, no tower there yet, no enemy
 * army standing on it, and the gold to pay.
 */
export function canBuildWatchtower(state: GameState, factionId: FactionId, tile: TileId): Check {
  const faction = getFaction(state, factionId);
  const data = state.tiles[tile];
  if (!faction || !data) return { ok: false, reason: "There's no such tile." };
  if (!TERRAIN[data.terrain].passable) return { ok: false, reason: "Watchtowers can't be built here." };
  if (towerOwner(state, tile) !== factionId) return { ok: false, reason: "Only on your own land." };
  if (cityAt(state, tile)) return { ok: false, reason: "Not on a city." };
  if (state.watchtowers[tile]) return { ok: false, reason: "There's already a watchtower here." };
  const army = armyAt(state, tile);
  if (army && army.owner !== factionId) return { ok: false, reason: "An enemy army stands here." };
  if (faction.gold < WATCHTOWER.cost) {
    return { ok: false, reason: `Costs ${fmt(WATCHTOWER.cost)} gold. You have ${fmt(faction.gold)}.` };
  }
  return { ok: true };
}

/** Pays for a watchtower and builds it at once. Check canBuildWatchtower first. */
export function buildWatchtower(state: GameState, factionId: FactionId, tile: TileId): GameState {
  let next = updateFaction(state, factionId, (f) => ({ ...f, gold: f.gold - WATCHTOWER.cost }));
  next = { ...next, watchtowers: { ...next.watchtowers, [tile]: true } };
  const city = state.cities[state.regions[tile]];
  return addLog(next, `${getFaction(state, factionId)?.shortName ?? "Someone"} built a watchtower near ${city?.name ?? "their land"}.`, {
    kind: "construction",
    factions: [factionId],
  });
}
