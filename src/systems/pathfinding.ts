import type { GameContext } from "@/core/context.js";
import type { FactionId, GameState } from "@/core/state.js";
import { ROAD_MOVE_COST, TERRAIN } from "@/data/terrain.js";
import type { TileDataMap } from "@/map/tiles.js";
import type { TileId } from "@/map/topology.js";

/** The tiles of every road, remembered for as long as the road list lasts (it never changes after setup). */
const roadTileCache = new WeakMap<GameState["roads"], Set<TileId>>();

/** Whether a road runs through a tile. */
export function isRoadTile(state: GameState, tile: TileId): boolean {
  let tiles = roadTileCache.get(state.roads);
  if (!tiles) {
    tiles = new Set(state.roads.flatMap((road) => road.tiles));
    roadTileCache.set(state.roads, tiles);
  }
  return tiles.has(tile);
}

/**
 * Movement points to enter a tile: its terrain's cost, or less on a road in
 * the land of a city that has built its roads. Roads serve every army,
 * whoever owns them.
 */
export function enterCost(state: GameState, tile: TileId): number {
  const terrain = TERRAIN[state.tiles[tile].terrain].moveCost;
  if (!isRoadTile(state, tile)) return terrain;
  const claim = state.territory[tile];
  const roads = claim ? (state.cities[claim.cityId]?.buildings.roads ?? 0) : 0;
  return Math.min(terrain, ROAD_MOVE_COST[roads] ?? Infinity);
}

/**
 * The cheapest walk from one tile to another by terrain cost alone, over
 * adjacent tiles that `allowed` accepts (both ends included), or null if
 * there's none. Ties go the same way every time. Used to lay out roads.
 */
export function cheapestPath(
  ctx: GameContext,
  state: GameState,
  from: TileId,
  to: TileId,
  allowed: (tile: TileId) => boolean,
): TileId[] | null {
  const dist = new Map<TileId, number>([[from, 0]]);
  const previous = new Map<TileId, TileId>();
  const heap = new MinHeap<TileId>();
  heap.push(from, 0);
  while (heap.size > 0) {
    const { key, value: tile } = heap.pop()!;
    if (key > dist.get(tile)!) continue;
    if (tile === to) break;
    for (const n of ctx.topology.neighbors(tile)) {
      if (ctx.topology.distance(tile, n) !== 1 || !allowed(n)) continue;
      const cost = key + TERRAIN[state.tiles[n].terrain].moveCost;
      if (cost < (dist.get(n) ?? Infinity)) {
        dist.set(n, cost);
        previous.set(n, tile);
        heap.push(n, cost);
      }
    }
  }
  if (!dist.has(to)) return null;
  const path = [to];
  while (path[path.length - 1] !== from) path.push(previous.get(path[path.length - 1])!);
  return path.reverse();
}

/** A small binary min-heap for Dijkstra. */
class MinHeap<T> {
  private items: { key: number; value: T }[] = [];

  get size(): number {
    return this.items.length;
  }

  push(value: T, key: number): void {
    const items = this.items;
    items.push({ key, value });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].key <= items[i].key) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }

  pop(): { key: number; value: T } | undefined {
    const items = this.items;
    if (items.length === 0) return undefined;
    const top = items[0];
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let smallest = i;
        if (l < items.length && items[l].key < items[smallest].key) smallest = l;
        if (r < items.length && items[r].key < items[smallest].key) smallest = r;
        if (smallest === i) break;
        [items[smallest], items[i]] = [items[i], items[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

/**
 * Movement cost from every tile to `target` for a faction's armies, walking
 * around enemy armies and enemy cities (the target itself excepted) and over
 * friendly ones. Tiles with no route are missing from the result.
 *
 * Built by searching outward from the target, so one call answers "which way
 * is closer?" for every army heading there.
 */
export function costToTarget(ctx: GameContext, state: GameState, target: TileId, owner: FactionId): Map<TileId, number> {
  const blocked = new Set<TileId>();
  for (const army of Object.values(state.armies)) if (army.owner !== owner) blocked.add(army.tile);
  for (const city of Object.values(state.cities)) if (city.owner !== owner) blocked.add(city.tile);
  blocked.delete(target);

  const dist = new Map<TileId, number>([[target, 0]]);
  const heap = new MinHeap<TileId>();
  heap.push(target, 0);

  while (heap.size > 0) {
    const { key, value: tile } = heap.pop()!;
    if (key > dist.get(tile)!) continue;
    // Stepping from a neighbor into `tile` costs what it takes to enter it; the target itself counts as 1.
    const stepCost = tile === target ? 1 : enterCost(state, tile);
    for (const n of ctx.topology.neighbors(tile)) {
      if (blocked.has(n) || !TERRAIN[state.tiles[n].terrain].passable) continue;
      const cost = key + stepCost;
      if (cost < (dist.get(n) ?? Infinity)) {
        dist.set(n, cost);
        heap.push(n, cost);
      }
    }
  }
  return dist;
}

const landmassCache = new WeakMap<TileDataMap, Map<TileId, number>>();

/**
 * Labels each passable tile with the id of the landmass it's on. Tiles on the
 * same landmass can reach each other over land. Cached per map.
 */
export function landmasses(ctx: GameContext, tiles: TileDataMap): Map<TileId, number> {
  const cached = landmassCache.get(tiles);
  if (cached) return cached;

  const label = new Map<TileId, number>();
  let next = 0;
  for (const start of ctx.topology.allTiles()) {
    if (label.has(start) || !TERRAIN[tiles[start].terrain].passable) continue;
    const id = next++;
    const stack = [start];
    label.set(start, id);
    while (stack.length > 0) {
      const tile = stack.pop()!;
      for (const n of ctx.topology.neighbors(tile)) {
        if (!label.has(n) && TERRAIN[tiles[n].terrain].passable) {
          label.set(n, id);
          stack.push(n);
        }
      }
    }
  }
  landmassCache.set(tiles, label);
  return label;
}
