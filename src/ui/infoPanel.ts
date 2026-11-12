import type { GameContext } from "@/core/context.js";
import {
  armyAt,
  cityAt,
  getFaction,
  type Army,
  type City,
  type FactionId,
  type GameState,
  type Regiment,
  type RegimentId,
} from "@/core/state.js";
import { TERRAIN } from "@/data/terrain.js";
import { ARMY_RULES, LINE_UNITS, MERCENARIES, TIERS, UNIT_TYPES, UNITS, type UnitType, regimentSize, unitName } from "@/data/units.js";
import { TAX_ORDER, TAX_RATES } from "@/data/economy.js";
import {
  BUILDING_EFFECTS,
  BUILDING_ORDER,
  BUILDINGS,
  CONSTRUCTION_QUEUE_SIZE,
  LEVEL_POPULATION,
  LEVEL_POPULATION_LIMIT,
  type BuildingType,
} from "@/data/buildings.js";
import { buildingAvailable, canBuild, cityLevel, nextLevel, plannedLevel } from "@/systems/buildings.js";
import { cityDefense, defenseBonusAt } from "@/systems/combat.js";
import { enterCost, isRoadTile } from "@/systems/pathfinding.js";
import { buildingSvg } from "@/ui/buildingArt.js";
import type { TileId } from "@/map/topology.js";
import { describeAttackArmor, describeSpecials, formatMultiplier, describeStatsShort, formatNumber, formatPercent } from "@/render/format.js";
import { figureSvg, scoutSvg } from "@/render/figures.js";
import { besiegedCity, mercenaryCost, regimentCost, upkeepFor } from "@/systems/armies.js";
import { canHire, canTopUp, territoryOf, topUpPlan } from "@/systems/mercenaries.js";
import { canRetrain, canTrain, canTrainScout, retrainCost, trainableOptions, unitUnlocked } from "@/systems/recruitment.js";
import { besiegeTargets, maxSupplies } from "@/systems/siege.js";
import { SIEGE } from "@/data/siege.js";
import { cityStats, mineableTiles, plainsTiles, tradeRoutes, type CityStats, type TradeRoute } from "@/systems/cities.js";
import { canBuildWatchtower, towerOwner, towerSighter } from "@/systems/watchtowers.js";
import { SCOUT } from "@/data/scouts.js";
import { VISION } from "@/data/vision.js";
import { WATCHTOWER } from "@/data/watchtowers.js";
import { levelPips, regimentBox, tierMark } from "@/ui/boxes.js";
import { escapeHtml, ownerLine, signed } from "@/ui/html.js";

/** Which tab of the city panel is showing. Kept between redraws. */
export type CityTab = "construction" | "recruitment" | "retraining";

export interface InfoPanelInput {
  ctx: GameContext;
  /** The game as the player sees it: enemy armies out of sight are left out. */
  state: GameState;
  /** Tiles the player can see, or null to show everything. */
  visible: ReadonlySet<TileId> | null;
  tile: TileId | null;
  humanId: FactionId | null;
  playerTurn: boolean;
  cityTab: CityTab;
  /** Regiments queued for retraining in the selected city. */
  retrainQueue: ReadonlySet<RegimentId>;
  /** Regiments of the selected army that will move or attack together. */
  chosenRegiments: ReadonlySet<RegimentId>;
}

/**
 * HTML for the selected tile: its army, its city (with the training form if
 * it's yours), and its terrain.
 */
export function renderInfoPanel(input: InfoPanelInput): string {
  const { state, tile } = input;
  if (!tile) return `<p class="hint">Select a tile, city or army.</p>`;

  const army = armyAt(state, tile);
  const city = cityAt(state, tile);
  const sections: string[] = [];
  const orders = army ? armySection(input, army) : "";
  if (orders) sections.push(orders);
  if (city) sections.push(citySection(input, city));
  const mercenaries = mercenarySection(input, tile);
  if (mercenaries) sections.push(mercenaries);
  sections.push(terrainSection(state, tile, Boolean(army || city)));
  const tower = watchtowerSection(input, tile);
  if (tower) sections.push(tower);
  const strangers = Object.values(state.scouts).filter((s) => s.tile === tile && s.owner !== input.humanId);
  if (strangers.length > 0) {
    sections.push(`<p class="terrain-line">${strangers.map((s) => `Scout (${escapeHtml(getFaction(state, s.owner)?.shortName ?? "enemy")})`).join(", ")}.</p>`);
  }
  if (input.ctx.topology.links?.().some(([a, b]) => a === tile || b === tile)) {
    sections.push(`<p class="terrain-line">Sea crossing.</p>`);
  }
  return sections.join(`<hr>`);
}

/**
 * The army's orders: its march (with Cancel march), what's stopping it from
 * moving, and Besiege buttons. Empty when there's nothing to say. Its size
 * and regiments are in the selection bar.
 */
function armySection(input: InfoPanelInput, army: Army): string {
  const { state, humanId, playerTurn, chosenRegiments } = input;
  const mine = army.owner === humanId;
  const canOrder = mine && playerTurn;

  let html = "";
  if (mine && army.destination) {
    html += `
      <p class="siege-note">Marching to ${escapeHtml(placeLabel(input.state, army.destination))}.</p>
      ${canOrder ? `<button type="button" class="action secondary" data-cancel-march="${army.id}">Cancel march</button>` : ""}`;
  }
  if (canOrder) {
    const hint = orderHint(state, army, chosenRegiments);
    if (hint) html += `<p class="hint">${hint}</p>`;
    html += siegeButtons(input, army);
  }
  return html;
}

/** "Vostgrad", "near Vostgrad" or "the hills" for a tile. */
function placeLabel(state: GameState, tile: TileId): string {
  const city = cityAt(state, tile);
  if (city) return city.name;
  const near = state.cities[state.territory[tile]?.cityId ?? state.regions[tile] ?? ""];
  if (near) return `near ${near.name}`;
  return `the ${TERRAIN[state.tiles[tile].terrain].name.toLowerCase()}`;
}

/** A Besiege button for each enemy city next to the army, or its siege status if already besieged. */
function siegeButtons(input: InfoPanelInput, army: Army): string {
  const { ctx, state, humanId } = input;
  return besiegeTargets(ctx, state, army)
    .map((city) => {
      if (city.besiegedBy === humanId) {
        return `<p class="siege-note">Besieging ${escapeHtml(city.name)}: ${suppliesText(city)}.</p>`;
      }
      if (city.besiegedBy) {
        const by = getFaction(state, city.besiegedBy)?.shortName ?? "another faction";
        return `<p class="siege-note">${escapeHtml(city.name)} is already besieged by ${escapeHtml(by)}.</p>`;
      }
      return `<button type="button" class="action secondary" data-besiege="${city.tile}">Besiege ${escapeHtml(city.name)}</button>`;
    })
    .join("");
}

function suppliesText(city: City): string {
  return `it surrenders in ${city.supplies} turn${city.supplies === 1 ? "" : "s"}`;
}

/** A warning line for a besieged city. */
function siegeStatus(state: GameState, city: City): string {
  if (!city.besiegedBy) return "";
  const by = escapeHtml(getFaction(state, city.besiegedBy)?.shortName ?? "the enemy");
  const turns = `${city.supplies} turn${city.supplies === 1 ? "" : "s"}`;
  const garrison = Math.round(SIEGE.garrisonAttrition * 100);
  return `<p class="siege-warning">Besieged by ${by}: surrenders in ${turns}.</p>`;
}

/** Tells the player what the ticked regiments can do right now. */
function orderHint(state: GameState, army: Army, chosen: ReadonlySet<RegimentId>): string {
  const ticked = army.regiments.filter((r) => chosen.has(r.id));
  if (army.regiments.every((r) => r.movementLeft <= 0)) return "No moves left this turn.";
  if (besiegedCity(state, army)) return "Besieged: can only attack the besiegers.";
  if (ticked.some((r) => r.pinned)) return "Held by an enemy's zone of control.";
  if (ticked.some((r) => r.movementLeft <= 0)) return "Some chosen regiments have no moves left.";
  return "";
}

/**
 * The settlement panel: its details, and for your own cities the tax rate,
 * what's under way, and buttons that open the city screen on a tab.
 */
function citySection(input: InfoPanelInput, city: City): string {
  const mine = city.owner === input.humanId;
  let html = `
    <div class="settlement">
      ${cityHeading(city)}
      ${cityDetails(input, city)}`;
  if (mine) {
    html += taxToggle(city, input.playerTurn);
    html += underWay(city);
    if (input.playerTurn) html += cityScreenButtons();
  }
  return html + `</div>`;
}

/**
 * The city screen: a large window over the map for one of the player's own
 * cities, with its details on the left and the Construction, Recruitment and
 * Retraining tabs filling the rest. Empty unless it's the player's turn and
 * the selected tile is one of their cities.
 */
export function renderCityScreen(input: InfoPanelInput): string {
  const city = input.tile ? cityAt(input.state, input.tile) : undefined;
  if (!city || city.owner !== input.humanId || !input.playerTurn) return "";
  return `
    <div class="city-screen-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(city.name)}">
      <header class="city-screen-header">
        ${cityHeading(city)}
        <div class="city-screen-nav">
          <button type="button" class="tax-arrow" data-city-step="-1" aria-label="Previous city" title="Previous city (Shift+Tab)">&#9664;</button>
          <button type="button" class="tax-arrow" data-city-step="1" aria-label="Next city" title="Next city (Tab)">&#9654;</button>
          <button type="button" class="city-screen-close" data-close-city-screen aria-label="Back to the map" title="Back to the map (Esc)">&times;</button>
        </div>
      </header>
      <div class="city-screen-body">
        <aside class="city-screen-facts settlement">
          ${cityDetails(input, city)}
          ${taxToggle(city, input.playerTurn)}
        </aside>
        <section class="city-screen-main">${cityTabs(input, city)}</section>
      </div>
    </div>`;
}

/** The city's name, level and whether it's a capital. */
function cityHeading(city: City): string {
  return `<h2>${escapeHtml(city.name)}<span class="rank">Level ${cityLevel(city)}${city.isCapital ? ", capital" : ""}</span></h2>`;
}

/** Buttons that open the city screen on each of its tabs. */
function cityScreenButtons(): string {
  const button = (id: CityTab, label: string) => `<button type="button" class="secondary" data-city-tab="${id}">${label}</button>`;
  return `
    <div class="city-open">
      ${button("construction", "Construction")}
      ${button("recruitment", "Recruitment")}
      ${button("retraining", "Retraining")}
    </div>`;
}

/** One line each for the building and the regiment that come next, so the side panel still shows them. */
function underWay(city: City): string {
  const lines: string[] = [];
  const work = city.constructionQueue[0];
  if (work) {
    const more = city.constructionQueue.length - 1;
    lines.push(`Building ${escapeHtml(BUILDINGS[work.building].levels[work.level - 1].name)}: ${work.turnsLeft} turn${work.turnsLeft === 1 ? "" : "s"}${more ? `, ${more} more queued` : ""}.`);
  }
  const order = city.recruitQueue[0];
  if (order) {
    const name = order.kind === "scout" ? "a scout" : order.kind === "train" ? unitName(order.unit, order.tier) : `+${order.soldiers} ${UNITS[order.unit].name}`;
    const more = city.recruitQueue.length - 1;
    lines.push(`${order.kind === "retrain" ? "Retraining" : "Training"} ${escapeHtml(name)}${more ? `, ${more} more queued` : ""}.`);
  }
  return lines.map((line) => `<p class="hint under-way">${line}</p>`).join("");
}

/** The city's owner and figures: income, people, growth, supplies, defence, and any siege. */
function cityDetails(input: InfoPanelInput, city: City): string {
  const { state, humanId } = input;
  const owner = getFaction(state, city.owner);
  const stats = cityStats(state, city);
  const mine = city.owner === humanId;
  const besieged = Boolean(city.besiegedBy);

  const growth = besieged
    ? "None while besieged"
    : `${formatPercent(stats.growthRate)} <span class="muted">(${signed(stats.growth)})</span>`;

  return `
      ${ownerLine(owner?.name ?? "Unknown", owner?.color ?? "#000")}
      <dl class="settlement-details">
        <dt>Income</dt><dd>${besieged ? "None" : `+${stats.gold}`}</dd>
        <dt>Population</dt><dd>${formatNumber(city.population)}</dd>
        <dt>Growth</dt><dd>${growth}</dd>
        <dt>Capacity</dt><dd${stats.limitedByLevel ? ` class="limited" title="Its ${escapeHtml(BUILDINGS.government.levels[city.buildings.government - 1].name)} limits it to ${formatNumber(stats.capacity)}; its land could hold ${formatNumber(stats.landCapacity)}. Raise its government to let it grow."` : ""}>${formatNumber(stats.capacity)}${stats.limitedByLevel ? " &#9888;" : ""}</dd>
        <dt>Supplies</dt><dd>${city.supplies}/${maxSupplies(city)} turns</dd>
        <dt>Taxes</dt><dd>${TAX_RATES[city.taxRate].name}</dd>
        <dt>Defense</dt><dd>+${Math.round(cityDefense(city) * 100)}%</dd>
        <dt>Walls</dt><dd>${city.buildings.walls ? escapeHtml(BUILDINGS.walls.levels[city.buildings.walls - 1].name) : "None"}</dd>
      </dl>
      ${mine ? incomeTable(stats, besieged) : ""}
      ${!mine && input.visible && !input.visible.has(city.tile) ? `<p class="hint">Garrison out of sight.</p>` : ""}
      ${siegeStatus(state, city)}`;
}

/**
 * How the city's income is reached, a row each: its base, people, mine and
 * farms, the market on those, its trade and the market on that, then taxes.
 * A multiplier's row shows the gold it adds. Each row is the change in the
 * rounded running total, so the rows always add up to the total shown.
 */
function incomeTable(stats: CityStats, besieged: boolean): string {
  const i = stats.income;
  const rows: string[] = [];
  let running = 0;
  const row = (label: string, after: number, factor?: number) => {
    const added = Math.round(after) - Math.round(running);
    running = after;
    const sign = added < 0 ? "−" : "+";
    rows.push(`<tr><th scope="row">${label}${factor !== undefined ? ` <span class="muted">${formatMultiplier(factor)}</span>` : ""}</th><td>${sign}${Math.abs(added)}</td></tr>`);
  };
  row("Base", i.base);
  row("People", running + i.people);
  if (i.mine) row("Mine", running + i.mine);
  if (i.farms) row("Farms", running + i.farms);
  if (i.port) row("Fishing", running + i.port);
  if (i.trade) row("Trade", running + i.trade);
  if (i.trade && i.tradeMarket !== 1) row("Market on trade", running + i.trade * (i.tradeMarket - 1), i.tradeMarket);
  if (i.taxes !== 1) row("Taxes", running * i.taxes, i.taxes);
  return `
    <table class="income-table">
      <tbody>${rows.join("")}</tbody>
      <tfoot><tr><th scope="row">${besieged ? "Normally" : "Gold a turn"}</th><td>${i.total}</td></tr></tfoot>
    </table>
    ${besieged ? `<p class="hint">Besieged: no gold this turn.</p>` : ""}`;
}

/** ◀ Normal tax rate ▶, and what the current rate does. */
function taxToggle(city: City, enabled: boolean): string {
  const index = TAX_ORDER.indexOf(city.taxRate);
  const lower = TAX_ORDER[index - 1];
  const higher = TAX_ORDER[index + 1];
  const tax = TAX_RATES[city.taxRate];
  const effect =
    city.taxRate === "normal"
      ? "Standard gold and growth."
      : `${tax.gold > 1 ? "+" : ""}${Math.round((tax.gold - 1) * 100)}% gold, ${tax.growth > 1 ? "+" : ""}${Math.round((tax.growth - 1) * 100)}% growth.`;

  return `
    <div class="tax-toggle">
      <button type="button" class="tax-arrow" data-tax="${lower ?? ""}" ${lower && enabled ? "" : "disabled"} aria-label="Lower taxes">&#9664;</button>
      <div class="tax-label"><strong>${tax.name} tax rate</strong><span>${effect}</span></div>
      <button type="button" class="tax-arrow" data-tax="${higher ?? ""}" ${higher && enabled ? "" : "disabled"} aria-label="Raise taxes">&#9654;</button>
    </div>`;
}

/** The Construction, Recruitment and Retraining tabs of the city screen. */
function cityTabs(input: InfoPanelInput, city: City): string {
  const tab = input.cityTab;
  const tabButton = (id: CityTab, label: string) =>
    `<button type="button" role="tab" class="city-tab" data-city-tab="${id}" aria-selected="${tab === id}">${label}</button>`;
  return `
    <div class="city-tabs" role="tablist">
      ${tabButton("construction", "Construction")}
      ${tabButton("recruitment", "Recruitment")}
      ${tabButton("retraining", "Retraining")}
    </div>
    <div class="city-tab-panel" role="tabpanel">
      ${tab === "construction" ? constructionTab(input, city) : tab === "recruitment" ? recruitmentTab(input, city) : retrainingTab(input, city)}
    </div>`;
}

/**
 * A box per building the city can build next, with what it costs (click to
 * queue it), and the construction queue: what's being built, and how long it
 * has to go. Buildings it can't build yet are left out; one it can't afford
 * is greyed out. What's already built is in the selection bar's Town tab.
 */
function constructionTab(input: InfoPanelInput, city: City): string {
  const { state, humanId } = input;
  if (!humanId) return "";

  // A siege or a full queue holds up every building: say so once.
  const heldUp = city.besiegedBy
    ? `${city.name} can't build while it's besieged.`
    : city.constructionQueue.length >= CONSTRUCTION_QUEUE_SIZE
      ? `The construction queue is full.`
      : "";

  const boxes = BUILDING_ORDER.filter((building) => buildingAvailable(state, city.id, building)).map((building) => {
    const def = BUILDINGS[building];
    const built = city.buildings[building];
    const next = nextLevel(city, building)!;
    const check = canBuild(state, humanId, city.id, building);
    const queued = plannedLevel(city, building) - built;
    // One name per box, the building's: the level's own name (Palisade, Forum...) is in the tooltip, and the pips show the level.
    const status = `${formatNumber(next.def.cost)} gold, ${next.def.turns} turns`;
    // A mine's, farms' or port's gold depends on the land: say what the next level would earn.
    const goldNote = landGoldSummary(state, city, building, next.level);
    const title = `${def.name}, level ${next.level}: ${next.def.name}. ${def.purpose} ${goldNote} ${check.ok ? `Click to queue it.` : check.reason}`;
    // Short of gold: the price turns red, nothing more. Any other reason is said in the box.
    // (A siege or full queue is said once, below.)
    const short = (getFaction(state, humanId)?.gold ?? 0) < next.def.cost;
    const blocked = !check.ok && !heldUp && !short ? check.reason : "";
    return `
      <button type="button" class="building-box" data-build="${building}" ${check.ok ? "" : "disabled"} title="${escapeHtml(title)}">
        ${buildingSvg(building)}
        <span class="unit-name">${def.name}</span>
        ${levelPips(built)}
        ${queued > 0 ? `<span class="unit-stat">+${queued} queued</span>` : ""}
        <span class="building-next${short ? " short" : ""}">${status}</span>
        ${goldNote ? `<span class="building-note">${escapeHtml(goldNote)}</span>` : ""}
        ${blocked ? `<span class="building-lock">${escapeHtml(blocked)}</span>` : ""}
      </button>`;
  }).join("");
  const options = boxes
    ? `<div class="box-grid buildings">${boxes}</div>${heldUp ? `<p class="hint">${escapeHtml(heldUp)}</p>` : ""}`
    : `<p class="hint">Nothing more to build right now.</p>`;

  // The queue: the first building is under way, the rest start in turn.
  let turnsSoFar = 0;
  const items = city.constructionQueue.map((work, index) => {
    const name = BUILDINGS[work.building].levels[work.level - 1].name;
    turnsSoFar += work.turnsLeft;
    const total = BUILDINGS[work.building].levels[work.level - 1].turns;
    const done = index === 0 ? Math.round(((total - work.turnsLeft) / total) * 100) : 0;
    const when = city.besiegedBy ? "Halted by the siege" : `Done in ${turnsSoFar} turn${turnsSoFar === 1 ? "" : "s"}`;
    return `
      <div class="queue-entry" title="${escapeHtml(`${name}: ${formatNumber(work.cost)} gold. Cancel to refund it.`)}">
        ${buildingSvg(work.building)}
        <span class="queue-entry-name">${escapeHtml(name)}</span>
        <span class="reg-status">${escapeHtml(when)}</span>
        <span class="strength"><span style="width:${done}%"></span></span>
        <button type="button" class="queue-cancel" data-cancel-construction="${index}" aria-label="Cancel ${escapeHtml(name)}">&times;</button>
      </div>`;
  }).join("");
  const queue = items || `<div class="queue-slot empty">Empty</div>`;

  // What it takes to advance the city.
  const nextGov = nextLevel(city, "government");
  const advance = nextGov
    ? `Level ${nextGov.level} at ${formatNumber(LEVEL_POPULATION[nextGov.level])} people (has ${formatNumber(city.population)}).`
    : "";

  return `
    ${options}
    <h4 class="queue-title">Construction queue <span class="queue-count">${city.constructionQueue.length}/${CONSTRUCTION_QUEUE_SIZE}</span></h4>
    <div class="queue-row">${queue}</div>
    ${advance && city.constructionQueue.length === 0 ? `<p class="hint">${advance}</p>` : ""}`;
}

/**
 * For a mine or farms: the tiles it earns from and the gold the next level
 * would bring. For roads or a port: its trade routes and the trade gold the
 * next level would bring. Before taxes and the market; empty for other
 * buildings.
 */
function landGoldSummary(state: GameState, city: City, building: BuildingType, nextLevelNumber: number | null): string {
  if (building === "roads" || building === "port") return tradeSummary(state, city, building, nextLevelNumber);
  const kinds = {
    mine: { tiles: mineableTiles(state, city.id), perTile: BUILDING_EFFECTS.mineGoldPerTile as readonly number[], what: "to dig", none: "No hills or mountains to mine." },
    farms: { tiles: plainsTiles(state, city.id), perTile: BUILDING_EFFECTS.farmsGoldPerPlainsTile as readonly number[], what: "of plains", none: "No plains to farm for gold." },
  };
  if (building !== "mine" && building !== "farms") return "";
  const { tiles, perTile, what, none } = kinds[building];
  if (tiles === 0) return none;
  const gold = (level: number) => Math.round(tiles * perTile[level]);
  const now = gold(city.buildings[building]);
  const count = `${tiles} tile${tiles === 1 ? "" : "s"} ${what}`;
  return nextLevelNumber
    ? `${count}: +${gold(nextLevelNumber)} gold a turn${now ? ` (now +${now})` : ""}.`
    : `${count}: +${now} gold a turn.`;
}

/** Roads' or a port's trade: its routes now, or at the next level, and their gold before taxes and the market. */
function tradeSummary(state: GameState, city: City, building: "roads" | "port", nextLevelNumber: number | null): string {
  const by = building === "roads" ? "land" : "sea";
  const at = (level: number) => tradeRoutes(state, { ...city, buildings: { ...city.buildings, [building]: level } }).filter((r) => r.by === by);
  const gold = (routes: TradeRoute[]) => Math.round(routes.reduce((sum, r) => sum + r.gold, 0));
  const now = at(city.buildings[building]);
  const next = nextLevelNumber ? at(nextLevelNumber) : now;
  if (next.length === 0) return building === "roads" ? "No roads to trade with." : "No port in range.";
  const cut = next.filter((r) => r.cut).length;
  const routes = `${next.length} trade route${next.length === 1 ? "" : "s"} by ${by}${cut ? ` (${cut} cut by enemies)` : ""}`;
  return nextLevelNumber
    ? `${routes}: +${gold(next)} gold a turn${now.length ? ` (now +${gold(now)})` : ""}.`
    : `${routes}: +${gold(now)} gold a turn.`;
}

/**
 * A box per unit type and tier the city can train (click one to queue a
 * regiment of it), what its buildings would unlock next, and the city's
 * recruitment queue, shared with retraining.
 */
function recruitmentTab(input: InfoPanelInput, city: City): string {
  const { state, humanId } = input;
  if (!humanId) return "";
  const color = getFaction(state, humanId)?.color ?? "#888888";
  const options = trainableOptions(city);

  const boxes = options.map(({ unit, tier }) => {
    const def = UNITS[unit];
    const name = unitName(unit, tier);
    const cost = regimentCost(unit, tier);
    const check = canTrain(state, humanId, city.id, unit, tier);
    const specials = describeSpecials(unit, tier);
    const stats = `${describeAttackArmor(unit, tier)}${specials ? ` · ${specials}` : ""}.`;
    const drilled = tier > 1 ? ` Stats ×${TIERS[tier].stats}.` : "";
    const short = describeStatsShort(unit, tier);
    return `
      <button type="button" class="unit-box" data-train="${unit}" data-tier="${tier}" ${check.ok ? "" : "disabled"}
        title="${escapeHtml(check.ok ? `Queue a regiment of ${name}: ${cost.gold} gold, ${cost.population} people, upkeep ${formatUpkeep(upkeepFor(unit, regimentSize(unit), tier))} a turn. ${stats}${drilled}` : check.reason)}">
        ${tierMark(tier)}
        ${figureSvg(unit, color, tier)}
        <span class="unit-name">${escapeHtml(name)}</span>
        <span class="unit-stat">${regimentSize(unit)} soldiers</span>
        <span class="unit-stat">${formatNumber(cost.gold)} gold</span>
        <span class="unit-stat">Move ${def.movement}</span>
        <span class="unit-stat">${short[0]}</span>
        <span class="unit-stat">${short[1]}</span>
      </button>`;
  }).join("");

  const scoutCheck = canTrainScout(state, humanId, city.id);
  const scoutBox = `
      <button type="button" class="unit-box" data-train-scout="${city.id}" ${scoutCheck.ok ? "" : "disabled"}
        title="${escapeHtml(scoutCheck.ok ? `Queue a scout: ${SCOUT.cost} gold, upkeep ${SCOUT.upkeep} a turn. Sees ${VISION.scout} tiles, goes anywhere, never fights and can't be killed.` : scoutCheck.reason)}">
        ${scoutSvg(color)}
        <span class="unit-name">Scout</span>
        <span class="unit-stat">1 rider</span>
        <span class="unit-stat">${SCOUT.cost} gold</span>
        <span class="unit-stat">Move ${SCOUT.movement}</span>
        <span class="unit-stat">Sight ${VISION.scout}</span>
      </button>`;

  const checks = options.map(({ unit, tier }) => canTrain(state, humanId, city.id, unit, tier));
  const blocked = checks.find((c) => !c.ok);
  const note = checks.every((c) => !c.ok) && blocked && !blocked.ok ? escapeHtml(blocked.reason) : "";
  // What its buildings would unlock next: the lowest tier it lacks, cheapest unit first.
  let next = "";
  for (const tier of [1, 2, 3] as const) {
    const unit = LINE_UNITS.find((u) => !unitUnlocked(city, u, tier));
    const building = unit ? UNITS[unit].building : null;
    if (unit && building) {
      const name = BUILDINGS[building].levels[tier - 1].name;
      next = `Next: ${unitName(unit, tier).toLowerCase()}, with ${/^[AEIOU]/.test(name) ? "an" : "a"} ${name}.`;
      break;
    }
  }

  return `
    <div class="box-grid units">${boxes}${scoutBox}</div>
    ${next ? `<p class="hint">${escapeHtml(next)}</p>` : ""}
    ${recruitQueue(city, color)}
    ${note ? `<p class="hint">${note}</p>` : ""}`;
}

/**
 * Mercenaries for hire where your army stands (or in your empty city): how
 * many the territory has, a box per unit (click to hire a basic regiment at
 * once), and a button to top up the army's damaged mercenaries. Empty when
 * you have nothing here or it's not your turn.
 */
function mercenarySection(input: InfoPanelInput, tile: TileId): string {
  const { state, humanId, playerTurn } = input;
  if (!humanId || !playerTurn) return "";
  const army = armyAt(state, tile);
  const city = cityAt(state, tile);
  if (army ? army.owner !== humanId : city?.owner !== humanId) return "";
  const territory = territoryOf(state, tile);
  if (!territory) return "";
  const color = getFaction(state, humanId)?.color ?? "#888888";
  const boxes = UNIT_TYPES.map((unit) => {
    const gold = mercenaryCost(unit);
    const upkeep = upkeepFor(unit, regimentSize(unit), 1, true);
    const check = canHire(state, humanId, tile, unit);
    const name = UNITS[unit].name;
    return `
      <button type="button" class="unit-box" data-hire="${unit}" ${check.ok ? "" : "disabled"}
        title="${escapeHtml(check.ok ? `Hire basic ${name.toLowerCase()} now: ${gold} gold, no people, upkeep ${formatUpkeep(upkeep)} a turn. They can't move until next turn.` : check.reason)}">
        <span class="merc-mark">&#9679;</span>
        ${figureSvg(unit, color, 1)}
        <span class="unit-name">${escapeHtml(name)}</span>
        <span class="unit-stat">${regimentSize(unit)} soldiers</span>
        <span class="unit-stat">${formatNumber(gold)} gold</span>
      </button>`;
  }).join("");
  const plan = army ? topUpPlan(state, army) : null;
  const check = army ? canTopUp(state, humanId, army.id) : null;
  const topUpButton =
    army && plan && plan.soldiers > 0
      ? `<button type="button" class="action secondary" data-top-up="${army.id}" ${check?.ok ? "" : "disabled"}
          title="${escapeHtml(check?.ok ? "Fill the damaged mercenary regiments from this territory's mercenaries, at once." : check?.reason ?? "")}">
          Top up ${formatNumber(plan.soldiers)} mercenaries: ${formatNumber(plan.gold)} gold</button>`
      : "";
  return `
    <h4 class="queue-title">Mercenaries <span class="queue-count" title="Soldiers for hire around ${escapeHtml(territory.name)}. Every round adds ${MERCENARIES.refillPerTurn}, up to ${MERCENARIES.supply}.">${formatNumber(territory.mercenarySupply)} for hire around ${escapeHtml(territory.name)}</span></h4>
    <div class="box-grid units mercs">${boxes}</div>
    ${topUpButton}`;
}

/**
 * A box per regiment stationed in the city: click damaged ones to choose
 * them, then queue them for retraining. Retraining shares the recruitment
 * queue: one order a turn.
 */
function retrainingTab(input: InfoPanelInput, city: City): string {
  const { state, humanId, retrainQueue: chosen } = input;
  if (!humanId) return "";
  const color = getFaction(state, humanId)?.color ?? "#888888";
  const army = armyAt(state, city.tile);
  if (!army || army.owner !== humanId) {
    return `<p class="hint">No army here.</p>
      ${recruitQueue(city, color)}`;
  }

  const queued = new Set(city.recruitQueue.flatMap((o) => (o.kind === "retrain" ? [o.regimentId] : [])));
  const damaged = (r: Regiment) => r.soldiers < regimentSize(r.unit);
  const boxes = army.regiments
    .map((r) => {
      const choosable = damaged(r) && !queued.has(r.id) && !r.mercenary;
      return regimentBox(r, color, {
        status: queued.has(r.id) ? "Queued" : r.mercenary && damaged(r) ? "Hired" : damaged(r) ? `${formatNumber(retrainCost(r))} gold` : "Full",
        title: queued.has(r.id)
          ? `${unitName(r.unit, r.tier)}: queued for retraining`
          : r.mercenary && damaged(r)
            ? `Mercenaries: ${r.soldiers} of ${regimentSize(r.unit)}. Top them up from the army's panel, not here.`
            : queued.has(r.id)
          ? `${unitName(r.unit, r.tier)}: queued for retraining`
          : damaged(r)
            ? `${unitName(r.unit, r.tier)}: ${r.soldiers} of ${regimentSize(r.unit)}. ${chosen.has(r.id) ? "Click to leave it out." : "Click to choose it for retraining."}`
            : `${unitName(r.unit, r.tier)}: at full strength`,
        attr: choosable ? `data-retrain="${r.id}"` : "",
        pressed: choosable ? chosen.has(r.id) : null,
        dim: !choosable,
      });
    })
    .join("");

  const picked = army.regiments.filter((r) => chosen.has(r.id));
  const gold = picked.reduce((sum, r) => sum + retrainCost(r), 0);
  const check = canRetrain(state, humanId, city.id, picked.map((r) => r.id));
  const anyChoosable = army.regiments.some((r) => damaged(r) && !queued.has(r.id) && !r.mercenary);
  return `
    <div class="box-grid">${boxes}</div>
    ${anyChoosable ? `
      <div class="queue-actions">
        <button type="button" class="action" data-replenish="${city.id}" ${check.ok ? "" : "disabled"}>
          Queue ${picked.length || ""} for retraining${picked.length ? `: ${formatNumber(gold)} gold` : ""}
        </button>
        <button type="button" class="action secondary" data-queue-all="${city.id}">Choose all damaged</button>
      </div>
      ${picked.length > 0 && !check.ok ? `<p class="hint">${escapeHtml(check.reason)}</p>` : ""}` : ""}
    ${recruitQueue(city, color)}
    ${anyChoosable ? "" : `<p class="hint">Nothing needs retraining.</p>`}`;
}

/**
 * The city's recruitment queue, shared by training and retraining: one order
 * is completed at the end of each turn. Each entry can be cancelled for a
 * refund.
 */
function recruitQueue(city: City, color: string): string {
  const spare = city.population - ARMY_RULES.minCityPopulation;
  // Every retrain is done next turn; new regiments come one a turn, in order.
  let people = city.recruitQueue
    .filter((o) => o.kind === "retrain")
    .reduce((sum, o) => sum + o.soldiers * ARMY_RULES.populationPerSoldier, 0);
  const retrainPeople = people;
  let trainingAhead = 0;
  const items = city.recruitQueue.map((order, index) => {
    if (order.kind === "scout") {
      const when = city.besiegedBy ? "Halted by the siege" : trainingAhead === 0 ? "Next turn" : `In ${trainingAhead + 1} turns`;
      trainingAhead++;
      return `
      <div class="queue-entry" title="${escapeHtml(`Training a scout: ${formatNumber(order.cost)} gold. Cancel to refund it.`)}">
        ${scoutSvg(color)}
        <span class="queue-entry-name">Scout</span>
        <span class="reg-status">${escapeHtml(when)}</span>
        <button type="button" class="queue-cancel" data-cancel-recruit="${index}" aria-label="Cancel Scout">&times;</button>
      </div>`;
    }
    let when: string;
    if (city.besiegedBy) when = "Halted by the siege";
    else if (order.kind === "retrain") when = retrainPeople > spare ? "Waiting for people" : "Next turn";
    else {
      people += regimentSize(order.unit) * ARMY_RULES.populationPerSoldier;
      when = people > spare ? "Waiting for people" : trainingAhead === 0 ? "Next turn" : `In ${trainingAhead + 1} turns`;
      trainingAhead++;
    }
    const name = order.kind === "train" ? unitName(order.unit, order.tier) : UNITS[order.unit].name;
    const label = order.kind === "train" ? name : `+${order.soldiers} ${name}`;
    return `
      <div class="queue-entry" title="${escapeHtml(`${order.kind === "train" ? "Training" : "Retraining"} ${name}: ${formatNumber(order.cost)} gold. Cancel to refund it.`)}">
        ${figureSvg(order.unit, color, order.kind === "train" ? order.tier : 1)}
        <span class="queue-entry-name">${escapeHtml(label)}</span>
        <span class="reg-status">${escapeHtml(when)}</span>
        <button type="button" class="queue-cancel" data-cancel-recruit="${index}" aria-label="Cancel ${escapeHtml(label)}">&times;</button>
      </div>`;
  }).join("");
  return `
    <h4 class="queue-title">Recruitment queue <span class="queue-count">${city.recruitQueue.length}/${ARMY_RULES.recruitQueueSize}</span></h4>
    <div class="queue-row">${items || `<div class="queue-slot empty">Empty</div>`}</div>`;
}

/**
 * The tile's watchtower (whose it is, and who sees through it), or a button
 * to build one on the player's own land. Empty if neither applies.
 */
function watchtowerSection(input: InfoPanelInput, tile: TileId): string {
  const { state, humanId, playerTurn } = input;
  if (state.watchtowers[tile]) {
    const owner = getFaction(state, towerOwner(state, tile) ?? "");
    const sighter = towerSighter(state, tile);
    const held = sighter && sighter !== owner?.id ? `, held by ${getFaction(state, sighter)?.shortName ?? "an enemy"}` : "";
    return `<p class="terrain-line" title="Sees ${VISION.watchtower} tiles around it. An enemy army standing on it sees through it instead.">Watchtower${owner ? ` (${escapeHtml(owner.shortName)})` : ""}${escapeHtml(held)}.</p>`;
  }
  if (!humanId || towerOwner(state, tile) !== humanId || cityAt(state, tile)) return "";
  const check = canBuildWatchtower(state, humanId, tile);
  const enabled = check.ok && playerTurn;
  const title = check.ok ? `Sees ${VISION.watchtower} tiles around it, for good. Taken with the city.` : check.reason;
  return `<button type="button" class="action secondary" data-watchtower="${tile}" ${enabled ? "" : "disabled"} title="${escapeHtml(title)}">Build watchtower (${formatNumber(WATCHTOWER.cost)})</button>`;
}

function terrainSection(state: GameState, tile: TileId, compact: boolean): string {
  const terrain = TERRAIN[state.tiles[tile].terrain];
  const defense = defenseBonusAt(state, tile);
  const defenseText = defense > 0 ? `+${Math.round(defense * 100)}%` : "None";

  if (compact) {
    return `<p class="terrain-line">${terrain.name}. Defense bonus ${defenseText}.</p>`;
  }

  // Land outside every territory still shows the region it's drawn in, but earns its city nothing.
  const claim = state.territory[tile];
  const regionCity = state.cities[claim?.cityId ?? state.regions[tile] ?? ""];
  const owner = regionCity ? getFaction(state, regionCity.owner) : undefined;
  const ownerDetail = !regionCity ? "" : claim ? regionCity.name : `near ${regionCity.name}, not worked`;
  const cost = terrain.passable ? enterCost(state, tile) : 0;
  const move = !terrain.passable ? "Impassable" : cost < terrain.moveCost ? `${cost} (road)` : isRoadTile(state, tile) ? `${cost} (road, not built)` : `${cost}`;
  return `
    <h2>${terrain.name}</h2>
    ${owner ? ownerLine(owner.name, owner.color, ownerDetail) : ""}
    <dl>
      <dt>Supports</dt><dd>${formatNumber(terrain.capacity)} people</dd>
      <dt>Growth rate</dt><dd>${formatPercent(terrain.growth)}</dd>
      ${terrain.mineable ? `<dt>Mining</dt><dd>A city's mine earns gold here</dd>` : ""}
      <dt>Movement cost</dt><dd>${move}</dd>
      <dt>Defense bonus</dt><dd>${defenseText}</dd>
    </dl>`;
}

/** Upkeep can be fractional for small regiments: show one decimal below 10. */
function formatUpkeep(n: number): string {
  return n < 10 ? String(Math.round(n * 10) / 10) : formatNumber(Math.round(n));
}
