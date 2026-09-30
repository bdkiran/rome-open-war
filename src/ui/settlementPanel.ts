import type { City, GameState } from "@/core/state.js";
import { SETTLEMENT, SETTLEMENT_ORDER } from "@/data/conquest.js";
import { formatNumber } from "@/render/format.js";
import { cityLevel } from "@/systems/buildings.js";
import { settlementOutcome } from "@/systems/conquest.js";
import { escapeHtml } from "@/ui/html.js";

export interface SettlementElements {
  root: HTMLElement;
  title: HTMLElement;
  body: HTMLElement;
}

/**
 * Asks the player what becomes of a city they've taken: occupy, enslave or
 * exterminate, each with what it would bring for this city. It can't be
 * dismissed without choosing.
 */
export function showSettlement(el: SettlementElements, state: GameState, city: City): void {
  el.title.textContent = `${city.name} has fallen`;

  const cards = SETTLEMENT_ORDER.map((choice) => {
    const def = SETTLEMENT[choice];
    const outcome = settlementOutcome(state, city, choice);
    const people =
      choice === "occupy"
        ? `Keeps all ${formatNumber(city.population)} people`
        : choice === "enslave"
          ? outcome.moved > 0
            ? `${formatNumber(outcome.moved)} people sent to your other cities, ${formatNumber(outcome.lost)} lost`
            : `${formatNumber(outcome.lost)} people lost (you have no other city to send them to)`
          : `${formatNumber(outcome.lost)} people killed`;
    return `
      <button type="button" class="settle-card settle-${choice}" data-settle="${choice}">
        <strong class="settle-name">${def.name}</strong>
        <span class="settle-gold">+${formatNumber(outcome.gold)} gold</span>
        <span class="settle-people">${people}</span>
        <span class="settle-text">${escapeHtml(def.description)}</span>
      </button>`;
  }).join("");

  el.body.innerHTML = `
    <p class="settle-intro">Your troops hold ${escapeHtml(city.name)}, a level ${cityLevel(city)} city of
      ${formatNumber(city.population)} people. What becomes of it?</p>
    <div class="settle-cards">${cards}</div>
    <p class="hint">Plunder depends on the city's size and level, so a city that's already been sacked yields much less.</p>`;
  el.root.hidden = false;
  (el.body.querySelector("[data-settle='occupy']") as HTMLButtonElement | null)?.focus();
}

export function hideSettlement(el: SettlementElements): void {
  el.root.hidden = true;
}
