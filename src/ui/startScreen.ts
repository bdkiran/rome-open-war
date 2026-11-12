import { VICTORY, VICTORY_PRESETS, type VictoryPreset } from "@/data/gameSetup.js";
import { escapeHtml } from "@/ui/html.js";

export interface StartScreenElements {
  root: HTMLElement;
  options: HTMLElement;
}

/**
 * Shows the start screen, a button per way to win, and resolves with the
 * one the player picks. The default is focused, so Enter starts it.
 */
export function chooseVictoryPreset(el: StartScreenElements, keyCities: readonly string[]): Promise<VictoryPreset> {
  const presets = Object.keys(VICTORY_PRESETS) as VictoryPreset[];
  el.options.innerHTML = presets
    .map((preset) => {
      const { name, summary } = VICTORY_PRESETS[preset];
      const title = preset === "conquest" ? summary : `${summary} Key cities: ${keyCities.join(", ")}.`;
      return `
        <button type="button" class="start-option${preset === VICTORY.defaultPreset ? "" : " secondary"}" data-preset="${preset}" title="${escapeHtml(title)}">
          <span class="start-option-name">${escapeHtml(name)}</span>
          <span class="start-option-summary">${escapeHtml(summary)}</span>
        </button>`;
    })
    .join("");
  el.root.hidden = false;
  el.options.querySelector<HTMLButtonElement>(`[data-preset="${VICTORY.defaultPreset}"]`)?.focus();
  return new Promise((resolve) => {
    el.options.addEventListener("click", function pick(e) {
      const button = e.target instanceof Element ? e.target.closest<HTMLButtonElement>("button[data-preset]") : null;
      if (!button) return;
      el.options.removeEventListener("click", pick);
      el.root.hidden = true;
      resolve(button.dataset.preset as VictoryPreset);
    });
  });
}
