import {
  armiesOf,
  armySoldiers,
  cityAt,
  citiesOf,
  currentFaction,
  getFaction,
  type FactionId,
  type GameState,
} from "@/core/state.js";
import { formatCompact, formatNumber } from "@/render/format.js";
import { factionUpkeep, upkeepFor } from "@/systems/armies.js";
import { cityStats, factionIncome, factionPopulation } from "@/systems/cities.js";
import { placeName } from "@/systems/combat.js";
import { TAX_RATES } from "@/data/economy.js";
import { escapeHtml, signed } from "@/ui/html.js";
import { outcomeFor } from "@/systems/victory.js";

export interface TurnPanelElements {
  turnNumber: HTMLElement;
  turnStatus: HTMLElement;
  treasury: HTMLElement;
  factionList: HTMLOListElement;
  endTurnButton: HTMLButtonElement;
  prevCityButton: HTMLButtonElement;
  nextCityButton: HTMLButtonElement;
  breakdown: HTMLElement;
}

/** Turn number, treasury, turn order and the End turn button. */
export function updateTurnPanel(el: TurnPanelElements, state: GameState, humanId: FactionId | null): void {
  const current = currentFaction(state);
  const human = humanId ? getFaction(state, humanId) : undefined;
  const outcome = humanId ? outcomeFor(state, humanId) : null;
  const playerTurn = current.id === humanId && !outcome;

  el.turnNumber.textContent = `Turn ${state.turn}`;
  if (outcome?.kind === "defeat") el.turnStatus.textContent = `${outcome.faction.name} has fallen.`;
  else if (outcome?.kind === "victory") el.turnStatus.textContent = "Victory. Every rival has fallen.";
  else el.turnStatus.textContent = playerTurn ? "Your turn." : `${current.name} is taking its turn.`;
  el.endTurnButton.disabled = !playerTurn;
  const hasCities = humanId !== null && citiesOf(state, humanId).length > 0;
  el.prevCityButton.disabled = !hasCities;
  el.nextCityButton.disabled = !hasCities;

  el.treasury.hidden = !human;
  if (human) {
    const income = factionIncome(state, human.id);
    const upkeep = factionUpkeep(state, human.id);
    el.treasury.innerHTML = `
      <strong class="${human.gold < 0 ? "negative" : ""}">${human.gold.toLocaleString("en-US")}</strong> gold${human.gold < 0 ? " (in debt)" : ""}
      <span class="income ${income - upkeep < 0 ? "negative" : ""}">${signed(income - upkeep)} per turn</span>
      <button type="button" class="breakdown" data-toggle-breakdown aria-expanded="${!el.breakdown.hidden}"
        title="Where your money comes from and goes">Income +${income}, upkeep −${formatNumber(Math.round(upkeep))} ${el.breakdown.hidden ? "&#9662;" : "&#9652;"}</button>`;
    if (!el.breakdown.hidden) el.breakdown.innerHTML = moneyBreakdown(state, human.id);
  }

  el.factionList.replaceChildren(
    ...state.factions.map((faction) => {
      const item = document.createElement("li");
      item.classList.toggle("current", faction.id === current.id);
      item.classList.toggle("defeated", !faction.alive);
      if (faction.id === current.id) item.setAttribute("aria-current", "true");

      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = faction.color;

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = faction.id === humanId ? `${faction.shortName} (you)` : faction.shortName;
      name.title = faction.name;

      const count = document.createElement("span");
      count.className = "count";
      count.textContent = faction.alive ? formatCompact(factionPopulation(state, faction.id)) : "";
      count.title = "Total population";

      const soldiers = document.createElement("span");
      soldiers.className = "count soldiers";
      soldiers.textContent = faction.alive
        ? formatCompact(armiesOf(state, faction.id).reduce((sum, a) => sum + armySoldiers(a), 0))
        : "";
      soldiers.title = "Soldiers under arms";

      const gold = document.createElement("span");
      gold.className = "gold";
      gold.textContent = faction.alive ? formatCompact(faction.gold) : "";
      gold.title = "Treasury (gold)";

      item.append(swatch, name, count, soldiers, gold);
      return item;
    }),
  );
}

/**
 * Where the player's money comes from and goes, turn by turn: each city's
 * gold (its base, people and mine, times its taxes and market), each army's
 * upkeep, and what's left.
 */
function moneyBreakdown(state: GameState, factionId: FactionId): string {
  const x = (n: number) => `×${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, "")}`;
  const cities = citiesOf(state, factionId).map((city) => {
    const { income } = cityStats(state, city);
    const parts = [`${income.base} base`, `${income.people} people`, ...(income.mine ? [`${income.mine} mine`] : [])].join(" + ");
    const multipliers = [
      ...(income.taxes !== 1 ? [`${x(income.taxes)} ${TAX_RATES[city.taxRate].name.toLowerCase()} taxes`] : []),
      ...(income.market !== 1 ? [`${x(income.market)} market`] : []),
    ].join(", ");
    return `
      <tr${city.besiegedBy ? ' class="lost"' : ""}>
        <th scope="row">${escapeHtml(city.name)}</th>
        <td class="how">${city.besiegedBy ? "Besieged: nothing this turn" : `${parts}${multipliers ? `, ${multipliers}` : ""}`}</td>
        <td class="amount">${city.besiegedBy ? "0" : `+${income.total}`}</td>
      </tr>`;
  }).join("");

  const armies = armiesOf(state, factionId).map((army) => {
    const where = cityAt(state, army.tile)?.name ?? placeName(state, army.tile).replace(/^(at|near|in) /, "");
    const cost = army.regiments.reduce((sum, r) => sum + upkeepFor(r.unit, r.soldiers, r.tier), 0);
    return `
      <tr>
        <th scope="row">${escapeHtml(where)}</th>
        <td class="how">${formatNumber(armySoldiers(army))} soldiers, ${army.regiments.length} regiment${army.regiments.length === 1 ? "" : "s"}</td>
        <td class="amount negative">−${formatNumber(Math.round(cost * 10) / 10)}</td>
      </tr>`;
  }).join("");

  const income = factionIncome(state, factionId);
  const upkeep = factionUpkeep(state, factionId);
  return `
    <table>
      <caption>Income</caption>
      ${cities || `<tr><td colspan="3">No cities.</td></tr>`}
      <tr class="sum"><th scope="row">Total</th><td></td><td class="amount">+${income}</td></tr>
    </table>
    <table>
      <caption>Upkeep</caption>
      ${armies || `<tr><td colspan="3">No armies.</td></tr>`}
      <tr class="sum"><th scope="row">Total</th><td></td><td class="amount negative">−${formatNumber(Math.round(upkeep))}</td></tr>
    </table>
    <p class="net">Each turn: ${signed(Math.round(income - upkeep))} gold</p>`;
}
