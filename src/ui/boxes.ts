import type { Regiment } from "@/core/state.js";
import { MAX_CITY_LEVEL } from "@/data/buildings.js";
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
      ${figureSvg(r.unit, color)}
      <span class="reg-count">${formatNumber(r.soldiers)}</span>
      <span class="strength"><span style="width:${strength}%"></span></span>
      ${opts.status ? `<span class="reg-status">${escapeHtml(opts.status)}</span>` : ""}
    </${tag}>`;
}

/** A small II or III in a box's corner for advanced or elite troops; nothing for basic ones. */
export function tierMark(tier: Tier): string {
  return tier > 1 ? `<span class="tier-mark tier-${tier}" title="${TIERS[tier].name}">${tier === 2 ? "II" : "III"}</span>` : "";
}

/** A building's level as a row of pips, filled up to `built`. */
export function levelPips(built: number): string {
  const pips = Array.from({ length: MAX_CITY_LEVEL }, (_, i) => `<span class="pip${i < built ? " on" : ""}"></span>`).join("");
  return `<span class="level-pips" aria-label="Level ${built} of ${MAX_CITY_LEVEL}">${pips}</span>`;
}
