import { getFaction, type BattleReport, type Forces, type GameState } from "@/core/state.js";
import { UNIT_TYPES, UNITS } from "@/data/units.js";
import { formatNumber } from "@/render/format.js";
import { escapeHtml } from "@/ui/html.js";

export interface BattleResultElements {
  root: HTMLElement;
  title: HTMLElement;
  body: HTMLElement;
  close: HTMLButtonElement;
}

/**
 * Shows how a battle the player took part in turned out: who won, both sides'
 * forces, what each lost, and whether a city changed hands.
 */
export function showBattleResult(el: BattleResultElements, state: GameState, report: BattleReport, playerId: string): void {
  const attacker = getFaction(state, report.attacker);
  const defender = getFaction(state, report.defender);
  const playerAttacked = report.attacker === playerId;
  const playerWon = playerAttacked === report.attackerWon;

  el.root.dataset.outcome = playerWon ? "victory" : "defeat";
  el.title.textContent = `${playerWon ? "Victory" : "Defeat"} ${report.place}`;

  const enemy = escapeHtml((playerAttacked ? defender : attacker)?.name ?? "the enemy");
  const fled = report.loserFled;
  const headline = playerAttacked
    ? playerWon
      ? report.cityCaptured
        ? `Your troops broke the defenders and took ${escapeHtml(report.cityCaptured)}.`
        : fled
          ? `Your troops broke the army of ${enemy}, and it fled.`
          : `Your troops destroyed the army of ${enemy}: it had nowhere to flee.`
      : fled
        ? `Your attack was thrown back, and your troops fled.`
        : `Your attack was thrown back, and with nowhere to flee your troops fought to the last.`
    : playerWon
      ? fled
        ? `${enemy} attacked, and your troops held and drove them off.`
        : `${enemy} attacked, and your troops held and destroyed them.`
      : report.cityCaptured
        ? `${enemy} broke your defenders and took ${escapeHtml(report.cityCaptured)}.`
        : fled
          ? `${enemy} broke your army, and it fled.`
          : `${enemy} destroyed your army: it had nowhere to flee.`;

  const bonus = report.defenseBonus > 0 ? `Defending with +${Math.round(report.defenseBonus * 100)}% from terrain and walls` : "";

  el.body.innerHTML = `
    <p class="battle-headline">${headline} ${report.rounds === 1 ? "One round" : `${report.rounds} rounds`} of fighting.</p>
    <div class="sides">
      ${side(playerAttacked ? "Your forces" : "The attackers", attacker?.name ?? "", attacker?.color ?? "#000",
        report.attackerForces, report.attackerLosses, report.attackerWon,
        report.attackingArmies > 1 ? `${report.attackingArmies} armies attacking together` : "")}
      ${side(playerAttacked ? "The defenders" : "Your forces", defender?.name ?? "", defender?.color ?? "#000",
        report.defenderForces, report.defenderLosses, !report.attackerWon,
        [report.defendingArmies > 1 ? `${report.defendingArmies} armies defending together` : "", bonus].filter(Boolean).join(". "))}
    </div>`;

  el.root.hidden = false;
  el.close.focus();
}

export function hideBattleResult(el: BattleResultElements): void {
  el.root.hidden = true;
}

function side(heading: string, name: string, color: string, forces: Forces, losses: number, won: boolean, note: string): string {
  const total = Object.values(forces).reduce((sum, n) => sum + (n ?? 0), 0);
  const rows = UNIT_TYPES.filter((u) => forces[u]).map((u) => `<dt>${UNITS[u].name}</dt><dd>${formatNumber(forces[u]!)}</dd>`).join("");
  return `
    <section class="side ${won ? "side-won" : "side-lost"}">
      <h3>${heading}</h3>
      <p class="owner"><span class="swatch" style="background:${color}"></span>${escapeHtml(name)}</p>
      <dl>
        ${rows}
        <dt class="total">Fought</dt><dd class="total">${formatNumber(total)}</dd>
        <dt>Lost</dt><dd class="loss">${formatNumber(losses)}</dd>
        <dt>Survived</dt><dd>${formatNumber(total - losses)}</dd>
      </dl>
      <p class="side-verdict">${won ? "Won the field" : total - losses > 0 ? "Fled" : "Destroyed"}</p>
      ${note ? `<p class="side-note">${escapeHtml(note)}</p>` : ""}
    </section>`;
}
