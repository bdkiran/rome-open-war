import { citiesOf, type GameState } from "@/core/state.js";
import { VICTORY } from "@/data/gameSetup.js";
import { formatNumber } from "@/render/format.js";
import { factionPopulation } from "@/systems/cities.js";
import type { Outcome } from "@/systems/victory.js";
import { escapeHtml } from "@/ui/html.js";

export interface GameOverElements {
  root: HTMLElement;
  title: HTMLElement;
  text: HTMLElement;
  playAgain: HTMLButtonElement;
}

/** Fills in and shows the victory or defeat screen, with one line on how the game was won or lost. */
export function showGameOver(el: GameOverElements, state: GameState, outcome: Outcome): void {
  const turns = `${state.turn} turn${state.turn === 1 ? "" : "s"}`;
  el.root.dataset.outcome = outcome.kind;
  const keyCities = state.victory.keyCities.length;

  if (outcome.kind === "victory") {
    const name = escapeHtml(outcome.faction.name);
    const cities = citiesOf(state, outcome.faction.id).length;
    const how =
      outcome.reason === "keyCities"
        ? `${name} has held ${VICTORY.keyCitiesNeeded} of the ${keyCities} key cities for ${VICTORY.holdTurns} turns.`
        : `${name} stands alone. Every rival has fallen.`;
    el.title.textContent = "Victory";
    el.text.innerHTML = `${how} After ${turns} you hold ${cities} cities and ${formatNumber(factionPopulation(state, outcome.faction.id))} people.`;
  } else {
    const leader = outcome.leader;
    const won = outcome.winner;
    el.title.textContent = "Defeat";
    if (won && won.reason !== "conquest") {
      const rival = escapeHtml(won.faction.name);
      el.text.innerHTML = `${rival} has held ${VICTORY.keyCitiesNeeded} of the ${keyCities} key cities for ${VICTORY.holdTurns} turns and wins the game.`;
    } else {
      el.text.innerHTML =
        `${escapeHtml(outcome.faction.name)} has fallen after ${turns}.` +
        (leader ? ` ${escapeHtml(leader.name)} holds ${citiesOf(state, leader.id).length} cities and fights on.` : "");
    }
  }

  el.root.hidden = false;
  el.playAgain.focus();
}
