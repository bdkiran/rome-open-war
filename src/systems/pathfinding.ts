import type { GameContext } from "@/core/context.js";
import type { FactionId, GameState } from "@/core/state.js";
import { TERRAIN } from "@/data/terrain.js";
import type { TileDataMap } from "@/map/tiles.js";
import type { TileId } from "@/map/topology.js";

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
    // Stepping from a neighbor into `tile` costs tile's terrain; the target itself counts as 1.
    const enterCost = tile === target ? 1 : TERRAIN[state.tiles[tile].terrain].moveCost;
    for (const n of ctx.topology.neighbors(tile)) {
      if (blocked.has(n) || !TERRAIN[state.tiles[n].terrain].passable) continue;
      const cost = key + enterCost;
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
