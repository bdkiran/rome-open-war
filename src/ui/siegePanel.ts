import { armyAt, getFaction, type City, type GameState, type Regiment } from "@/core/state.js";
import { SIEGE } from "@/data/siege.js";
import type { BattlePreview } from "@/systems/combat.js";
import { maxSupplies } from "@/systems/siege.js";
import { forceSummary } from "@/ui/battlePanel.js";
import { escapeHtml } from "@/ui/html.js";

export interface SiegePanelElements {
  root: HTMLElement;
  title: HTMLElement;
  body: HTMLElement;
  continueSiege: HTMLButtonElement;
  storm: HTMLButtonElement;
  withdraw: HTMLButtonElement;
}

export interface SiegePanelInput {
  /** The game as the player sees it. */
  state: GameState;
  city: City;
  /** The player's regiments around the city. */
  besiegers: readonly Regiment[];
  /** Whether the player can see inside the city right now. */
  garrisonKnown: boolean;
  /** The odds if the player storms now, or null if they can't. */
  storm: BattlePreview | null;
  /** Why the player can't storm right now, when they can't. */
  stormBlocked: string | null;
}

/**
 * Shows the siege screen: how long the city can hold out, what's inside,
 * the player's forces around it, and the odds of storming it now. The player
 * can continue the siege, storm the city (opening the battle panel), or
 * withdraw, which lifts the siege.
 */
export function showSiegePanel(el: SiegePanelElements, input: SiegePanelInput): void {
  const { state, city, storm } = input;
  const owner = getFaction(state, city.owner);
  const besieger = city.besiegedBy ? getFaction(state, city.besiegedBy) : undefined;
  const garrison = armyAt(state, city.tile);

  el.title.textContent = `Siege of ${city.name}`;

  const turns = `${city.supplies} turn${city.supplies === 1 ? "" : "s"}`;
  const status = `Supplies: ${city.supplies} of ${maxSupplies(city)} turns, then it surrenders.`;
  const besiegedBy = besieger
    ? `Besieged by ${escapeHtml(besieger.name)}.`
    : "Not under siege.";

  const theirs = !input.garrisonKnown
    ? `<section class="side"><h3>The garrison</h3><p class="owner">${escapeHtml(owner?.name ?? "")}</p>
         <p class="side-note">Your scouts can't see inside the walls.</p></section>`
    : garrison
      ? forceSummary("The garrison", owner?.name ?? "", owner?.color ?? "#000", garrison.regiments, storm?.strength.defender ?? null,
          storm && storm.terrainBonus + storm.cityBonus > 0
            ? [`Walls and terrain +${Math.round((storm.terrainBonus + storm.cityBonus) * 100)}%`]
            : [])
      : `<section class="side"><h3>The garrison</h3><p class="owner">${escapeHtml(owner?.name ?? "")}</p>
           <p class="side-note">The city is undefended.</p></section>`;

  const you = getFaction(state, city.besiegedBy ?? "");
  const yours = forceSummary("Your besieging forces", you?.name ?? "", you?.color ?? "#000", input.besiegers,
    storm?.strength.attacker ?? null, []);

  const odds = storm
    ? `<div class="odds odds-${verdict(storm.winChance)}"><strong>${Math.round(storm.winChance * 100)}%</strong><span>chance to storm the walls now</span></div>`
    : "";

  el.body.innerHTML = `
    <p class="siege-plan">${besiegedBy} ${status}</p>
    ${odds}
    <div class="sides">${yours}${theirs}</div>
    ${input.stormBlocked ? `<p class="battle-outcome">${escapeHtml(input.stormBlocked)}</p>` : ""}`;

  el.storm.disabled = Boolean(input.stormBlocked);
  el.continueSiege.disabled = city.besiegedBy === null;
  el.root.hidden = false;
  el.continueSiege.focus();
}

export function hideSiegePanel(el: SiegePanelElements): void {
  el.root.hidden = true;
}

function verdict(chance: number): string {
  return chance >= 0.65 ? "good" : chance >= 0.35 ? "even" : "poor";
}
