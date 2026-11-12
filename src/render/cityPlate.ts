import type { City, GameState } from "@/core/state.js";
import { formatCompact } from "@/render/format.js";
import { cityStats } from "@/systems/cities.js";
import { escapeHtml } from "@/ui/html.js";
import { isKeyCity, keyCitiesCount } from "@/systems/victory.js";

/**
 * A city's name plate on the map, as HTML: its name and its people. On the
 * player's own cities a small figure beside the people shows how they're
 * moving (green rising fast, yellow slow or not at all, red falling), and a
 * hammer or crossed swords show that something is being built or trained.
 * A star before the name marks a key city, when they can win the game.
 * Icons only, no words: the city panel has the detail.
 */

/** Growth per turn, as a share of the people already there, that counts as rising fast. */
const RAPID_GROWTH = 0.015;

const ICONS = {
  people: '<circle cx="8" cy="4.5" r="3"/><path d="M2.5 15c0-3.6 2.5-6 5.5-6s5.5 2.4 5.5 6z"/>',
  build: '<path d="M3 13.5 9 7.5"/><path d="M7 4.5 10 1.5l4.5 4.5-3 3z"/>',
  train: '<path d="M3 3l10 10M13 3 3 13"/><path d="M4 10.5l1.5 1.5M12 10.5 10.5 12"/>',
};

function icon(name: keyof typeof ICONS): string {
  return `<svg viewBox="0 0 16 16" aria-hidden="true">${ICONS[name]}</svg>`;
}

/** How a city's people are moving: rising fast, slow or still, or falling. Besieged cities don't grow. */
export function growthTrend(state: GameState, city: City): "rising" | "steady" | "falling" {
  const growth = city.besiegedBy ? 0 : cityStats(state, city).growth;
  if (growth < 0) return "falling";
  return growth >= city.population * RAPID_GROWTH ? "rising" : "steady";
}

/**
 * A city's plate as HTML. `mine` is whether the player owns it: only then are
 * its growth and work shown, since a rival's aren't the player's to see.
 */
export function cityPlate(state: GameState, city: City, mine: boolean): string {
  const key = keyCitiesCount(state) && isKeyCity(state, city.id) ? `<span class="key" aria-label="Key city">★</span>` : "";
  const name = `<span class="name">${key}${escapeHtml(city.name)}</span>`;
  const people = formatCompact(city.population);
  if (!mine) return `${name}<span class="pop">${people}</span>`;

  const trend = growthTrend(state, city);
  const pop = `<span class="pop ${trend}">${icon("people")}${people}</span>`;
  const work = [
    city.constructionQueue.length > 0 ? icon("build") : "",
    city.recruitQueue.length > 0 ? icon("train") : "",
  ].join("");
  return name + pop + (work ? `<span class="work">${work}</span>` : "");
}
