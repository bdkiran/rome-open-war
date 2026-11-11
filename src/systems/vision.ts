import type { GameContext } from "@/core/context.js";
import { armiesOf, citiesOf, type FactionId, type GameState } from "@/core/state.js";
import { VISION } from "@/data/vision.js";
import type { TileId } from "@/map/topology.js";
import { tilesWithin } from "@/systems/cities.js";
import { towerSighter } from "@/systems/watchtowers.js";

/**
 * Every tile a faction can currently see: around its cities, armies and
 * scouts and watchtowers (or an enemy's tower one of its armies stands on), and all of
 * its own territory. Everywhere else, enemy armies are hidden from it.
 * The map itself and the cities on it are always known.
 *
 * Sight spreads over land only, but the two shores of a sea crossing see
 * each other: an army can step or attack across one, so whoever sees one
 * end must see what stands on the other.
 */
export function visibleTiles(ctx: GameContext, state: GameState, factionId: FactionId): Set<TileId> {
  const visible = new Set<TileId>();
  const add = (tiles: TileId[]) => {
    for (const t of tiles) visible.add(t);
  };

  for (const [tile, claim] of Object.entries(state.territory)) {
    if (claim.owner === factionId) visible.add(tile);
  }
  for (const city of citiesOf(state, factionId)) {
    add(tilesWithin(ctx.topology, city.tile, VISION.city));
  }
  for (const army of armiesOf(state, factionId)) {
    const range = army.regiments.some((r) => r.unit === "cavalry") ? VISION.armyWithCavalry : VISION.army;
    add(tilesWithin(ctx.topology, army.tile, range));
  }
  for (const scout of Object.values(state.scouts)) {
    if (scout.owner === factionId) add(tilesWithin(ctx.topology, scout.tile, VISION.scout));
  }
  for (const tile of Object.keys(state.watchtowers)) {
    if (towerSighter(state, tile) === factionId) add(tilesWithin(ctx.topology, tile, VISION.watchtower));
  }
  for (const [a, b] of ctx.topology.links?.() ?? []) {
    if (visible.has(a)) visible.add(b);
    else if (visible.has(b)) visible.add(a);
  }
  return visible;
}

/**
 * The game as a faction sees it: the same, except that enemy armies and
 * scouts it can't see are left out. Use it for decisions and display only. Actions are always
 * checked against the real state, so they can run into armies hidden here.
 */
export function fogged(state: GameState, factionId: FactionId, visible: ReadonlySet<TileId>): GameState {
  const armies: GameState["armies"] = {};
  for (const [id, army] of Object.entries(state.armies)) {
    if (army.owner === factionId || visible.has(army.tile)) armies[id] = army;
  }
  const scouts = Object.fromEntries(
    Object.entries(state.scouts).filter(([, s]) => s.owner === factionId || visible.has(s.tile)),
  );
  return { ...state, armies, scouts };
}
