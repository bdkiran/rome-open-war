import type { Regiment } from "@/core/state.js";
import { MAX_CITY_LEVEL } from "@/data/buildings.js";
import { experienceLevel, MAX_EXPERIENCE_LEVEL } from "@/data/experience.js";
import { regimentSize, TIERS, type Tier } from "@/data/units.js";
import { formatNumber } from "@/render/format.js";
import { figureSvg } from "@/render/figures.js";
import { escapeHtml } from "@/ui/html.js";

/** A regiment as a box: its figure, soldiers, a strength bar, and a status line. */
export function regimentBox(
  r: Regiment,
  color: string,
  opts: { status: string; title: string; attr: string; pressed: boolean | null; dim: boolean },
): string {
  const strength = Math.round((r.soldiers / regimentSize(r.unit)) * 100);
  const tag = opts.attr ? "button" : "div";
  const pressed = opts.pressed === null ? "" : `aria-pressed="${opts.pressed}"`;
  return `
    <${tag} ${tag === "button" ? 'type="button"' : ""} class="reg-box${opts.dim ? " dim" : ""}" ${opts.attr} ${pressed} title="${escapeHtml(opts.title)}">
      ${tierMark(r.tier)}
      ${r.mercenary ? mercenaryMark() : ""}
      ${experiencePips(r.experience)}
      ${figureSvg(r.unit, color, r.tier)}
      <span class="reg-count">${formatNumber(r.soldiers)}</span>
      <span class="strength"><span style="width:${strength}%"></span></span>
      ${opts.status ? `<span class="reg-status">${escapeHtml(opts.status)}</span>` : ""}
    </${tag}>`;
}

/** A regiment's experience level as a row of pips, filled up to it; nothing for raw troops. */
export function experiencePips(points: number): string {
  const level = experienceLevel(points);
  if (level === 0) return "";
  const pips = Array.from({ length: MAX_EXPERIENCE_LEVEL }, (_, i) => `<span class="xp-pip${i < level ? " on" : ""}"></span>`).join("");
  return `<span class="xp-pips" aria-label="Experience level ${level} of ${MAX_EXPERIENCE_LEVEL}">${pips}</span>`;
}

/** A small II or III in a box's corner for advanced or elite troops; nothing for basic ones. */
export function tierMark(tier: Tier): string {
  return tier > 1 ? `<span class="tier-mark tier-${tier}" title="${TIERS[tier].name}">${tier === 2 ? "II" : "III"}</span>` : "";
}

/** A small coin in a box's corner for a regiment of mercenaries. */
export function mercenaryMark(): string {
  return `<span class="merc-mark" title="Mercenaries: double upkeep, desert in debt">&#9679;</span>`;
}

/** A building's level as a row of pips, filled up to `built`. */
export function levelPips(built: number): string {
  const pips = Array.from({ length: MAX_CITY_LEVEL }, (_, i) => `<span class="pip${i < built ? " on" : ""}"></span>`).join("");
  return `<span class="level-pips" aria-label="Level ${built} of ${MAX_CITY_LEVEL}">${pips}</span>`;
}
