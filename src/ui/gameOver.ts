import { citiesOf, type GameState } from "@/core/state.js";
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

/** Fills in and shows the victory or defeat screen. */
export function showGameOver(el: GameOverElements, state: GameState, outcome: Outcome): void {
  const turns = `${state.turn} turn${state.turn === 1 ? "" : "s"}`;
  el.root.dataset.outcome = outcome.kind;

  if (outcome.kind === "victory") {
    const cities = citiesOf(state, outcome.faction.id).length;
    el.title.textContent = "Victory";
    el.text.innerHTML =
      `${escapeHtml(outcome.faction.name)} stands alone. Every rival has fallen, ` +
      `and after ${turns} you hold ${cities} cities and ${formatNumber(factionPopulation(state, outcome.faction.id))} people.`;
  } else {
    const leader = outcome.leader;
    el.title.textContent = "Defeat";
    el.text.innerHTML =
      `${escapeHtml(outcome.faction.name)} has fallen after ${turns}.` +
      (leader ? ` ${escapeHtml(leader.name)} holds ${citiesOf(state, leader.id).length} cities and fights on.` : "");
  }

  el.root.hidden = false;
  el.playAgain.focus();
}
