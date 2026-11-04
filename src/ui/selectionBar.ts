import { armyAt, cityAt, getFaction, type Army, type City, type Scout } from "@/core/state.js";
import { SCOUT } from "@/data/scouts.js";
import { VISION } from "@/data/vision.js";
import { scoutSvg } from "@/render/figures.js";
import { scoutAt } from "@/systems/scouts.js";
import { BUILDING_ORDER, BUILDINGS } from "@/data/buildings.js";
import { experienceLevel, MAX_EXPERIENCE_LEVEL } from "@/data/experience.js";
import { UNITS, regimentSize, unitName } from "@/data/units.js";
import type { TileId } from "@/map/topology.js";
import { describeAttackArmor, describeSpecials } from "@/render/format.js";
import { buildingSvg } from "@/ui/buildingArt.js";
import { canMerge } from "@/systems/armies.js";
import { levelPips, regimentBox } from "@/ui/boxes.js";
import { escapeHtml } from "@/ui/html.js";
import type { InfoPanelInput } from "@/ui/infoPanel.js";

/** Which tab of the selection bar is showing. */
export type BarTab = "army" | "town" | "scout";

/**
 * The tabs the selection bar offers for a tile: Army for an army (a field
 * army or a city's garrison), Town for a city's buildings, Scout for the
 * player's scout. Empty when there's nothing to show, and the bar is hidden.
 */
export function barTabs(input: InfoPanelInput, tile: TileId | null): BarTab[] {
  if (!tile) return [];
  const tabs: BarTab[] = [];
  if (armyAt(input.state, tile)) tabs.push("army");
  if (cityAt(input.state, tile)) tabs.push("town");
  if (input.humanId && scoutAt(input.state, tile, input.humanId)) tabs.push("scout");
  return tabs;
}

const TAB_NAMES: Record<BarTab, string> = { army: "Army", town: "Town", scout: "Scout" };

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
    `<button type="button" role="tab" class="bar-tab" data-bar-tab="${id}" aria-selected="${shown === id}">${TAB_NAMES[id]}</button>`;
  const scout = input.humanId ? scoutAt(input.state, input.tile, input.humanId) : undefined;
  const cards =
    shown === "scout" && scout ? scoutCard(input, scout) : shown === "army" && army ? armyCards(input, army) : city ? townCards(city) : "";
  // Merging damaged regiments of a type is an army order, so it lives with the regiments.
  const merge =
    shown === "army" && army && army.owner === input.humanId && input.playerTurn && canMerge(army)
      ? `<button type="button" class="bar-action" data-merge="${army.id}" title="Merge damaged regiments of the same type into fuller ones. Free, and takes no movement.">Merge</button>`
      : "";
  const dismiss =
    shown === "scout" && scout && input.playerTurn
      ? `<button type="button" class="bar-action" data-dismiss-scout="${scout.id}" title="Send this scout home for good, ending its upkeep. No refund.">Dismiss</button>`
      : "";
  return `
    <div class="bar-tabs" role="tablist">${tabs.map(tabButton).join("")}${merge}${dismiss}</div>
    <div class="bar-cards" role="tabpanel">${cards}</div>`;
}

/** The player's scout, as a box like a regiment's. */
function scoutCard(input: InfoPanelInput, scout: Scout): string {
  const color = getFaction(input.state, scout.owner)?.color ?? "#888888";
  const title = `Scout: sees ${VISION.scout} tiles, goes anywhere, never fights and can't be killed. Upkeep ${SCOUT.upkeep} a turn, ${scout.movementLeft} of ${SCOUT.movement} movement.`;
  return `
    <div class="reg-box${scout.movementLeft <= 0 ? " dim" : ""}" title="${escapeHtml(title)}">
      ${scoutSvg(color)}
      <span class="reg-count">Scout</span>
      <span class="reg-status">${scout.movementLeft}/${SCOUT.movement}</span>
    </div>`;
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
      const level = experienceLevel(r.experience);
      const veteran = level > 0 ? `, experience level ${level} of ${MAX_EXPERIENCE_LEVEL}` : "";
      const title = `${unitName(r.unit, r.tier)}: ${r.soldiers} of ${regimentSize(r.unit)} soldiers${veteran}, ${describeAttackArmor(r.unit, r.tier, level).toLowerCase()}${specials ? `, ${specials.toLowerCase()}` : ""}${mine ? `, ${r.movementLeft} of ${def.movement} movement` : ""}${canOrder ? ". Click to tick or untick it." : ""}`;
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
