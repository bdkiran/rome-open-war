import { getFaction, type GameState, type Regiment } from "@/core/state.js";
import { COMBAT } from "@/data/combat.js";
import { UNIT_TYPES, UNITS } from "@/data/units.js";
import { formatNumber } from "@/render/format.js";
import type { BattlePreview } from "@/systems/combat.js";
import { escapeHtml } from "@/ui/html.js";

export interface BattlePanelElements {
  root: HTMLElement;
  title: HTMLElement;
  body: HTMLElement;
  fight: HTMLButtonElement;
}

/** Fills in and shows the battle panel for a proposed attack: the odds, both sides, Fight or Withdraw. */
export function showBattlePanel(
  el: BattlePanelElements,
  state: GameState,
  preview: BattlePreview,
  options: { marchesFirst: boolean },
): void {
  const attacker = getFaction(state, ownerOfAttack(state, preview));
  const defender = getFaction(state, preview.defender.owner);
  const chance = Math.round(preview.winChance * 100);
  const verdict = chance >= 65 ? "good" : chance >= 35 ? "even" : "poor";

  el.title.textContent = preview.cityAtStake ? `Storming ${preview.cityAtStake}` : `Battle ${preview.place}`;

  const yourNotes = [
    preview.armies > 1 ? `${preview.armies} armies attacking together` : "",
    options.marchesFirst ? "Marches up to them first" : "",
  ].filter(Boolean);
  const theirNotes = [
    preview.defendingArmies > 1 ? `${preview.defendingArmies} armies defending together` : "",
    preview.terrainBonus > 0 ? `Terrain +${Math.round(preview.terrainBonus * 100)}%` : "",
    preview.cityBonus > 0 ? `City walls +${Math.round(preview.cityBonus * 100)}%` : "",
  ].filter(Boolean);

  const win = preview.cityAtStake
    ? `If you win, you'll likely lose about ${formatNumber(preview.lossesIfWin)} soldiers and take ${escapeHtml(preview.cityAtStake)}.`
    : `If you win, you'll likely lose about ${formatNumber(preview.lossesIfWin)} soldiers and destroy their army.`;
  const lose = `If you lose, all ${formatNumber(regimentTotal(preview.attackers))} of your attacking soldiers are lost, and they lose about ${formatNumber(preview.defenderLossesIfHold)}.`;

  el.body.innerHTML = `
    <div class="odds odds-${verdict}">
      <strong>${chance}%</strong>
      <span title="Estimated by fighting the battle out ${COMBAT.previewBattles} times">estimated chance of victory</span>
    </div>
    <div class="sides">
      ${forceSummary("Your forces", attacker?.name ?? "", attacker?.color ?? "#000", preview.attackers, preview.strength.attacker, yourNotes)}
      ${forceSummary(preview.cityAtStake ? "The garrison" : "Their forces", defender?.name ?? "", defender?.color ?? "#000", preview.defenders, preview.strength.defender, theirNotes)}
    </div>
    <p class="battle-outcome">${win} ${lose}</p>`;

  el.root.hidden = false;
  el.fight.focus();
}

export function hideBattlePanel(el: BattlePanelElements): void {
  el.root.hidden = true;
}

/** One side of a fight: its soldiers by unit type, strength if known, and any notes. */
export function forceSummary(
  heading: string,
  name: string,
  color: string,
  regiments: readonly Regiment[],
  strength: number | null,
  notes: string[],
): string {
  const rows = UNIT_TYPES.map((unit) => {
    const soldiers = regiments.filter((r) => r.unit === unit).reduce((sum, r) => sum + r.soldiers, 0);
    return soldiers > 0 ? `<dt>${UNITS[unit].name}</dt><dd>${formatNumber(soldiers)}</dd>` : "";
  }).join("");

  return `
    <section class="side">
      <h3>${heading}</h3>
      <p class="owner"><span class="swatch" style="background:${color}"></span>${escapeHtml(name)}</p>
      <dl>
        ${rows}
        <dt class="total">Soldiers</dt><dd class="total">${formatNumber(regimentTotal(regiments))}</dd>
        ${strength !== null ? `<dt>Strength</dt><dd>${formatNumber(Math.round(strength))}</dd>` : ""}
      </dl>
      ${notes.map((n) => `<p class="side-note">${escapeHtml(n)}</p>`).join("")}
    </section>`;
}

export function regimentTotal(regiments: readonly Regiment[]): number {
  return regiments.reduce((sum, r) => sum + r.soldiers, 0);
}

/** The attacking faction: whoever owns the army holding the first attacking regiment. */
function ownerOfAttack(state: GameState, preview: BattlePreview): string {
  const id = preview.attackers[0].id;
  return Object.values(state.armies).find((a) => a.regiments.some((r) => r.id === id))?.owner ?? "";
}
