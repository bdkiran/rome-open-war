import type { General, Regiment } from "@/core/state.js";
import type { Culture } from "@/data/cultures.js";
import { GENERALS, TRAIT_INFO } from "@/data/generals.js";
import { portraitSvg } from "@/render/portraits.js";
import { generalOf } from "@/systems/generals.js";
import { escapeHtml } from "@/ui/html.js";

/** "Fierce, Swift". */
export function traitNames(general: General): string {
  return general.traits.map((t) => TRAIT_INFO[t].name).join(", ");
}

/** Each trait and what it does, one per line: for tooltips. */
export function traitEffects(general: General): string {
  return general.traits.map((t) => `${TRAIT_INFO[t].name}: ${TRAIT_INFO[t].effect}`).join("\n");
}

/** A general's bodyguard, described for its box's tooltip. */
export function generalTitle(r: Regiment & { general: General }, leads: boolean): string {
  return (
    `${r.general.name}, general${leads ? ", leads this army" : ", not leading: only the leader's traits count"}. Bodyguard of ${r.soldiers} of ${GENERALS.bodyguardSize} riders, ` +
    `refilling ${GENERALS.bodyguardRefill} a turn; wages ${GENERALS.wages} gold a turn. He may fall in any battle, and dies if it's wiped out.\n` +
    traitEffects(r.general)
  );
}

/** "Led by Hanno (Fierce, Swift)" with his portrait, for a side with a general (its leader); nothing without one. */
export function generalLine(regiments: readonly Regiment[], culture: Culture, color: string): string {
  const general = generalOf(regiments)?.general;
  if (!general) return "";
  const traits = general.traits.length > 0 ? ` (${escapeHtml(traitNames(general))})` : "";
  return `<p class="side-note general-line" title="${escapeHtml(traitEffects(general))}"><span class="general-portrait" style="border-color:${color}">${portraitSvg(general.name, culture, color)}</span><span>Led by ${escapeHtml(general.name)}${traits}</span></p>`;
}
