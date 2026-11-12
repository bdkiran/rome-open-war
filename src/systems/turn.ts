import type { GameContext } from "@/core/context.js";
import { currentFaction, type FactionId, type GameState } from "@/core/state.js";
import { continueMarches, payUpkeep, refreshMovement } from "@/systems/armies.js";
import { progressConstruction } from "@/systems/buildings.js";
import { processRecruitment } from "@/systems/recruitment.js";
import { processCities } from "@/systems/cities.js";
import { processSieges } from "@/systems/siege.js";
import { checkScoreTurn, trackKeyCities } from "@/systems/victory.js";

/**
 * Ends the current faction's turn: runs its end-of-turn processing, then
 * passes play to the next living faction. When play wraps back to the first
 * faction, the turn number goes up, and with a time limit, the last round
 * may decide the game on score.
 */
export function endTurn(ctx: GameContext, state: GameState): GameState {
  const finished = endFactionTurn(ctx, state, currentFaction(state).id);

  const count = finished.factions.length;
  let index = finished.currentFactionIndex;
  let turn = finished.turn;
  for (let step = 0; step < count; step++) {
    index = (index + 1) % count;
    if (index === 0) turn += 1;
    if (finished.factions[index].alive) break;
  }

  const scored = turn > finished.turn ? checkScoreTurn(finished, finished.turn) : finished;
  const next: GameState = { ...scored, currentFactionIndex: index, turn };
  return startFactionTurn(ctx, next, next.factions[index].id);
}

/**
 * Runs as a faction ends its turn: its marching armies move, and its cities pay income, grow, build and recruit,
 * its sieges tighten (or lift, if it has walked away), its army is paid, and
 * its hold on the key cities is counted.
 * Doing it here gives every faction exactly one tick per round, whatever its
 * turn order.
 */
function endFactionTurn(ctx: GameContext, state: GameState, factionId: FactionId): GameState {
  // Marching armies take their step first, with whatever movement they have left.
  let next = continueMarches(ctx, state, factionId);
  next = processCities(ctx, next, factionId);
  next = progressConstruction(next, factionId);
  next = processRecruitment(next, factionId);
  next = processSieges(ctx, next, factionId);
  return trackKeyCities(payUpkeep(next, factionId), factionId);
}

/** Runs at the start of each faction's turn: its armies get their movement back. */
function startFactionTurn(_ctx: GameContext, state: GameState, factionId: FactionId): GameState {
  return refreshMovement(state, factionId);
}
