import { citiesOf, getFaction, type Faction, type FactionId, type GameState } from "@/core/state.js";

/** The only faction still alive, once every other has fallen. */
export function lastFactionStanding(state: GameState): Faction | null {
  const alive = state.factions.filter((f) => f.alive);
  return alive.length === 1 ? alive[0] : null;
}

export type Outcome =
  | { kind: "victory"; faction: Faction }
  | { kind: "defeat"; faction: Faction; leader: Faction | null };

/**
 * How the game has ended for one faction, if it has: victory when it's the
 * last faction standing, defeat when it has fallen.
 */
export function outcomeFor(state: GameState, factionId: FactionId): Outcome | null {
  const faction = getFaction(state, factionId);
  if (!faction) return null;
  if (!faction.alive) return { kind: "defeat", faction, leader: strongest(state) };
  if (lastFactionStanding(state)?.id === factionId) return { kind: "victory", faction };
  return null;
}

/** The living faction with the most cities. */
function strongest(state: GameState): Faction | null {
  let best: Faction | null = null;
  let bestCount = -1;
  for (const f of state.factions) {
    if (!f.alive) continue;
    const count = citiesOf(state, f.id).length;
    if (count > bestCount) {
      best = f;
      bestCount = count;
    }
  }
  return best;
}
