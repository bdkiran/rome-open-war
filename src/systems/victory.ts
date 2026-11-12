import {
  addLog,
  citiesOf,
  getFaction,
  type Faction,
  type FactionId,
  type GameState,
  type VictoryReason,
} from "@/core/state.js";
import { VICTORY } from "@/data/gameSetup.js";
import { factionPopulation } from "@/systems/cities.js";

/**
 * How a game ends. Being the last faction standing always wins. With the
 * key-cities or time-limit preset, a faction (any faction, the AI included)
 * also wins by holding VICTORY.keyCitiesNeeded of the scenario's key cities
 * at the end of VICTORY.holdTurns of its turns in a row; with the time limit,
 * the best score wins once round VICTORY.scoreTurn is over. Another faction's
 * win is everyone else's defeat.
 */

/** The only faction still alive, once every other has fallen. */
export function lastFactionStanding(state: GameState): Faction | null {
  const alive = state.factions.filter((f) => f.alive);
  return alive.length === 1 ? alive[0] : null;
}

/** Whether key cities can win this game: not with the conquest preset, nor in a scenario with none. */
export function keyCitiesCount(state: GameState): boolean {
  return state.victory.preset !== "conquest" && state.victory.keyCities.length > 0;
}

/** How many of the key cities a faction holds. */
export function keyCitiesHeld(state: GameState, factionId: FactionId): number {
  return state.victory.keyCities.filter((id) => state.cities[id]?.owner === factionId).length;
}

/** Whether a city is one of the key cities. */
export function isKeyCity(state: GameState, cityId: string): boolean {
  return state.victory.keyCities.includes(cityId);
}

/** The turn at whose end a faction that began holding enough key cities on `since` wins, if it still holds them. */
export function keyCityWinTurn(since: number): number {
  return since + VICTORY.holdTurns - 1;
}

/**
 * A faction's score, for the time limit: its cities, its people (in
 * thousands) and its key cities. Gold doesn't count, so hoarding doesn't pay.
 */
export function scoreFor(state: GameState, factionId: FactionId): number {
  if (!getFaction(state, factionId)?.alive) return 0;
  return Math.round(
    citiesOf(state, factionId).length * VICTORY.scorePerCity +
      (factionPopulation(state, factionId) / 1000) * VICTORY.scorePer1000People +
      keyCitiesHeld(state, factionId) * VICTORY.scorePerKeyCity,
  );
}

/**
 * At the end of a faction's turn: a holder that has lost key cities since its
 * count began starts again; this faction, holding enough, starts counting (and
 * everyone is warned) or, once it has held them long enough, wins.
 */
export function trackKeyCities(state: GameState, factionId: FactionId): GameState {
  if (!keyCitiesCount(state) || state.victory.winner) return state;
  let next = state;
  const needed = VICTORY.keyCitiesNeeded;
  const holding = next.victory.holding;

  if (holding && keyCitiesHeld(next, holding.factionId) < needed) {
    const name = getFaction(next, holding.factionId)?.name ?? "A faction";
    next = { ...next, victory: { ...next.victory, holding: null } };
    next = addLog(next, `${name} no longer holds ${needed} key cities.`, { kind: "war", factions: [holding.factionId], major: true });
  }

  if (keyCitiesHeld(next, factionId) < needed) return next;
  const since = next.victory.holding?.factionId === factionId ? next.victory.holding.since : next.turn;
  if (next.victory.holding?.factionId !== factionId) {
    next = { ...next, victory: { ...next.victory, holding: { factionId, since } } };
    if (VICTORY.holdTurns > 1) {
      const name = getFaction(next, factionId)?.name ?? factionId;
      next = addLog(next, `${name} holds ${needed} key cities: it wins if it still holds them after turn ${keyCityWinTurn(since)}.`, {
        kind: "war",
        factions: [factionId],
        major: true,
      });
    }
  }
  return next.turn >= keyCityWinTurn(since) ? declareWinner(next, factionId, "keyCities") : next;
}

/** With the time limit, once round VICTORY.scoreTurn is over: the best score wins (more cities breaks a tie, then turn order). */
export function checkScoreTurn(state: GameState, finishedRound: number): GameState {
  if (state.victory.preset !== "timeLimit" || state.victory.winner || finishedRound < VICTORY.scoreTurn) return state;
  const alive = state.factions.filter((f) => f.alive);
  if (alive.length === 0) return state;
  const rank = (f: Faction) => [scoreFor(state, f.id), citiesOf(state, f.id).length];
  const best = alive.reduce((a, b) => {
    const [sa, ca] = rank(a);
    const [sb, cb] = rank(b);
    return sb > sa || (sb === sa && cb > ca) ? b : a;
  });
  return declareWinner(state, best.id, "score");
}

function declareWinner(state: GameState, factionId: FactionId, reason: VictoryReason): GameState {
  const next: GameState = { ...state, victory: { ...state.victory, holding: null, winner: { factionId, reason, turn: state.turn } } };
  const name = getFaction(state, factionId)?.name ?? factionId;
  const how = reason === "keyCities" ? `holding ${VICTORY.keyCitiesNeeded} key cities` : "with the best score";
  return addLog(next, `${name} has won the game, ${how}.`, { kind: "war", factions: [factionId], major: true });
}

/** Who has won the game, and how, if anyone has. */
export function winner(state: GameState): { faction: Faction; reason: VictoryReason } | null {
  const declared = state.victory.winner;
  const faction = declared ? getFaction(state, declared.factionId) : undefined;
  if (declared && faction) return { faction, reason: declared.reason };
  const last = lastFactionStanding(state);
  return last ? { faction: last, reason: "conquest" } : null;
}

export type Outcome =
  | { kind: "victory"; faction: Faction; reason: VictoryReason }
  /** `winner` is whoever won the game, if it's over; null if this faction simply fell. */
  | { kind: "defeat"; faction: Faction; leader: Faction | null; winner: { faction: Faction; reason: VictoryReason } | null };

/**
 * How the game has ended for one faction, if it has: victory when it has
 * won, defeat when it has fallen or another faction has won.
 */
export function outcomeFor(state: GameState, factionId: FactionId): Outcome | null {
  const faction = getFaction(state, factionId);
  if (!faction) return null;
  const won = winner(state);
  if (won?.faction.id === factionId) return { kind: "victory", faction, reason: won.reason };
  if (won) return { kind: "defeat", faction, leader: won.faction, winner: won };
  if (!faction.alive) return { kind: "defeat", faction, leader: strongest(state), winner: null };
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
