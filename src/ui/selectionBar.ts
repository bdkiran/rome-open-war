import { armyAt, cityAt, getFaction, type Army, type City } from "@/core/state.js";
import { BUILDING_ORDER, BUILDINGS } from "@/data/buildings.js";
import { UNITS, regimentSize, unitName } from "@/data/units.js";
import type { TileId } from "@/map/topology.js";
import { describeAttackArmor, describeSpecials } from "@/render/format.js";
import { buildingSvg } from "@/ui/buildingArt.js";
import { canMerge } from "@/systems/armies.js";
import { levelPips, regimentBox } from "@/ui/boxes.js";
import { escapeHtml } from "@/ui/html.js";
import type { InfoPanelInput } from "@/ui/infoPanel.js";

/** Which tab of the selection bar is showing. */
export type BarTab = "army" | "town";

/**
 * The tabs the selection bar offers for a tile: Army for an army (a field
 * army or a city's garrison), Town for a city's buildings. Empty when
 * there's nothing to show, and the bar is hidden.
 */
export function barTabs(input: InfoPanelInput, tile: TileId | null): BarTab[] {
  if (!tile) return [];
  const tabs: BarTab[] = [];
  if (armyAt(input.state, tile)) tabs.push("army");
  if (cityAt(input.state, tile)) tabs.push("town");
  return tabs;
}

/**
 * The bar along the bottom of the screen: cards for what's selected. The
 * Army tab shows an army's regiments, ticked to choose which ones take
 * orders; the Town tab shows the buildings a city has built. The side
 * panel keeps the facts and the city's construction and recruitment.
 */
export function renderSelectionBar(input: InfoPanelInput, tab: BarTab): string {
  const tabs = barTabs(input, input.tile);
  if (tabs.length === 0 || !input.tile) return "";
  const shown = tabs.includes(tab) ? tab : tabs[0];
  const army = armyAt(input.state, input.tile);
  const city = cityAt(input.state, input.tile);

  const tabButton = (id: BarTab) =>
    `<button type="button" role="tab" class="bar-tab" data-bar-tab="${id}" aria-selected="${shown === id}">${id === "army" ? "Army" : "Town"}</button>`;
  const cards = shown === "army" && army ? armyCards(input, army) : city ? townCards(city) : "";
  // Merging damaged regiments of a type is an army order, so it lives with the regiments.
  const merge =
    shown === "army" && army && army.owner === input.humanId && input.playerTurn && canMerge(army)
      ? `<button type="button" class="bar-action" data-merge="${army.id}" title="Merge damaged regiments of the same type into fuller ones. Free, and takes no movement.">Merge</button>`
      : "";
  return `
    <div class="bar-tabs" role="tablist">${tabs.map(tabButton).join("")}${merge}</div>
    <div class="bar-cards" role="tabpanel">${cards}</div>`;
}

/** The army's regiments. Your own can be clicked to tick or untick them for orders. */
function armyCards(input: InfoPanelInput, army: Army): string {
  const { state, humanId, playerTurn, chosenRegiments } = input;
  const mine = army.owner === humanId;
  const canOrder = mine && playerTurn;
  const color = getFaction(state, army.owner)?.color ?? "#888888";
  return army.regiments
    .map((r) => {
      const def = UNITS[r.unit];
      const status = !mine ? "" : r.pinned ? "Held" : `${r.movementLeft}/${def.movement}`;
      const specials = describeSpecials(r.unit, r.tier);
      const title = `${unitName(r.unit, r.tier)}: ${r.soldiers} of ${regimentSize(r.unit)} soldiers, ${describeAttackArmor(r.unit, r.tier).toLowerCase()}${specials ? `, ${specials.toLowerCase()}` : ""}${mine ? `, ${r.movementLeft} of ${def.movement} movement` : ""}${canOrder ? ". Click to tick or untick it." : ""}`;
      return regimentBox(r, color, {
        status,
        title,
        attr: canOrder ? `data-regiment="${r.id}"` : "",
        pressed: canOrder ? chosenRegiments.has(r.id) : null,
        dim: mine && r.movementLeft <= 0,
      });
    })
    .join("");
}

/** A card for each building the city has built, at its current level. */
function townCards(city: City): string {
  return BUILDING_ORDER.filter((b) => city.buildings[b] > 0)
    .map((building) => {
      const def = BUILDINGS[building];
      const built = city.buildings[building];
      const level = def.levels[built - 1];
      return `
        <div class="town-card" title="${escapeHtml(`${level.name}: ${def.purpose}`)}">
          ${buildingSvg(building)}
          <span class="town-card-name">${escapeHtml(level.name)}</span>
          ${levelPips(built)}
        </div>`;
    })
    .join("");
}
