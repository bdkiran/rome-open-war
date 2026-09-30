import type { GameContext } from "@/core/context.js";
import {
  armyAt,
  armySoldiers,
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
import { ARMY_RULES, UNIT_TYPES, UNITS, type UnitType, regimentSize } from "@/data/units.js";
import { TAX_ORDER, TAX_RATES } from "@/data/economy.js";
import {
  BUILDING_EFFECTS,
  BUILDING_ORDER,
  BUILDINGS,
  CONSTRUCTION_QUEUE_SIZE,
  LEVEL_POPULATION,
  LEVEL_POPULATION_LIMIT,
} from "@/data/buildings.js";
import { buildingAvailable, canBuild, cityLevel, nextLevel, plannedLevel } from "@/systems/buildings.js";
import { cityDefense, defenseBonusAt } from "@/systems/combat.js";
import { enterCost } from "@/systems/pathfinding.js";
import { buildingSvg } from "@/ui/buildingArt.js";
import type { TileId } from "@/map/topology.js";
import { formatNumber, formatPercent } from "@/render/format.js";
import { figureSvg } from "@/render/figures.js";
import { besiegedCity, canMerge, regimentCost, upkeepFor } from "@/systems/armies.js";
import { canRetrain, canTrain, retrainCost, trainableUnits } from "@/systems/recruitment.js";
import { besiegeTargets, maxSupplies } from "@/systems/siege.js";
import { SIEGE } from "@/data/siege.js";
import { cityStats, mineableTiles, type CityStats } from "@/systems/cities.js";
import { levelPips, regimentBox } from "@/ui/boxes.js";
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
  if (army) sections.push(armySection(input, army));
  if (city) sections.push(citySection(input, city));
  sections.push(terrainSection(state, tile, Boolean(army || city)));
  if (input.ctx.topology.links?.().some(([a, b]) => a === tile || b === tile)) {
    sections.push(`<p class="terrain-line">Sea crossing.</p>`);
  }
  return sections.join(`<hr>`);
}

/**
 * The army's facts and orders: its size, upkeep, march and siege buttons.
 * Its regiments, to tick for orders, are in the selection bar.
 */
function armySection(input: InfoPanelInput, army: Army): string {
  const { state, humanId, playerTurn, chosenRegiments } = input;
  const owner = getFaction(state, army.owner);
  const mine = army.owner === humanId;
  const canOrder = mine && playerTurn;
  const count = army.regiments.length;
  const upkeep = army.regiments.reduce((sum, r) => sum + upkeepFor(r.unit, r.soldiers), 0);

  let html = `
    <h2>${formatNumber(armySoldiers(army))} soldiers</h2>
    ${ownerLine(owner?.name ?? "Unknown", owner?.color ?? "#000", `${count} of ${ARMY_RULES.maxRegiments} regiments`)}`;

  if (mine) html += `<p class="terrain-line">Upkeep ${formatNumber(Math.round(upkeep))} gold per turn.</p>`;
  if (canOrder) html += armyServices(input, army);

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

/** A button to merge damaged regiments of the same type. Retraining lives in the city panel. */
function armyServices(_input: InfoPanelInput, army: Army): string {
  return canMerge(army)
    ? `<button type="button" class="action secondary" data-merge="${army.id}">Merge damaged regiments of the same type</button>`
    : "";
}

/** "Vostgrad", "near Vostgrad" or "the hills" for a tile. */
function placeLabel(state: GameState, tile: TileId): string {
  const city = cityAt(state, tile);
  if (city) return city.name;
  const claim = state.territory[tile];
  if (claim && state.cities[claim.cityId]) return `near ${state.cities[claim.cityId].name}`;
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
  if (ticked.length === 0) return "Choose regiments to order.";
  if (ticked.some((r) => r.movementLeft <= 0)) return "Some chosen regiments have no moves left.";
  return "";
}

/**
 * The settlement panel: its details, and for your own cities the tax rate
 * and two tabs, Recruitment and Retraining.
 */
function citySection(input: InfoPanelInput, city: City): string {
  const { state, humanId, playerTurn } = input;
  const owner = getFaction(state, city.owner);
  const stats = cityStats(state, city);
  const mine = city.owner === humanId;
  const besieged = Boolean(city.besiegedBy);

  const growth = besieged
    ? "None while besieged"
    : `${formatPercent(stats.growthRate)} <span class="muted">(${signed(stats.growth)})</span>`;

  let html = `
    <div class="settlement">
      <h2>${escapeHtml(city.name)}<span class="rank">Level ${cityLevel(city)}${city.isCapital ? ", capital" : ""}</span></h2>
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
      ${mine ? incomeLine(stats, besieged) : ""}
      ${!mine && input.visible && !input.visible.has(city.tile) ? `<p class="hint">Garrison out of sight.</p>` : ""}
      ${siegeStatus(state, city)}`;

  if (mine) {
    html += taxToggle(city, playerTurn);
    if (playerTurn) html += cityTabs(input, city);
  }
  return html + `</div>`;
}

/** How the city's income is reached: its base, people and mine, then taxes and the market. */
function incomeLine(stats: CityStats, besieged: boolean): string {
  const i = stats.income;
  const x = (n: number) => `×${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, "")}`;
  const parts = [`${i.base} base`, `${i.people} people`, ...(i.mine ? [`${i.mine} mine`] : [])].join(" + ");
  const multipliers = [...(i.taxes !== 1 ? [`${x(i.taxes)} taxes`] : []), ...(i.market !== 1 ? [`${x(i.market)} market`] : [])];
  const text = multipliers.length ? `${parts} = ${i.subtotal}, ${multipliers.join(", ")} = ${i.total}` : `${parts} = ${i.total}`;
  return `<p class="income-line">${besieged ? `Normally ${text} gold. Besieged: nothing this turn.` : `${text} gold a turn`}</p>`;
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

/** The Recruitment and Retraining tabs. */
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
    const current = (built > 0 ? def.levels[built - 1].name : "Not built") + (queued > 0 ? ` (+${queued} queued)` : "");
    const status = `${escapeHtml(next.def.name)}: ${formatNumber(next.def.cost)} gold, ${next.def.turns} turns`;
    // A mine's worth depends on the land: say what the next level would earn.
    const mineNote = building === "mine" ? mineSummary(state, city, next.level) : "";
    const title = `${def.name}. ${def.purpose} ${mineNote} ${check.ok ? `Click to queue the ${next.def.name}.` : check.reason}`;
    // Short of gold: say so in the box. (A siege or full queue is said once, below.)
    const blocked = !check.ok && !heldUp ? check.reason : "";
    return `
      <button type="button" class="building-box" data-build="${building}" ${check.ok ? "" : "disabled"} title="${escapeHtml(title)}">
        ${buildingSvg(building)}
        <span class="unit-name">${def.name}</span>
        ${levelPips(built)}
        <span class="unit-stat">${escapeHtml(current)}</span>
        <span class="building-next">${status}</span>
        ${mineNote ? `<span class="building-note">${escapeHtml(mineNote)}</span>` : ""}
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

/** How many tiles a city's mine can dig, and the gold the next level would bring, before taxes and the market. */
function mineSummary(state: GameState, city: City, nextLevelNumber: number | null): string {
  const tiles = mineableTiles(state, city.id);
  if (tiles === 0) return "No hills or mountains to mine.";
  const perTile = BUILDING_EFFECTS.mineGoldPerTile;
  const now = tiles * perTile[city.buildings.mine];
  const then = nextLevelNumber ? tiles * perTile[nextLevelNumber] : now;
  return nextLevelNumber
    ? `${tiles} tile${tiles === 1 ? "" : "s"} to dig: +${then} gold a turn${now ? ` (now +${now})` : ""}.`
    : `${tiles} tile${tiles === 1 ? "" : "s"}: +${now} gold a turn.`;
}

/**
 * A box per unit type the city can train (click one to queue a regiment of
 * it), what its Barracks would unlock next, and the city's recruitment
 * queue, shared with retraining.
 */
function recruitmentTab(input: InfoPanelInput, city: City): string {
  const { state, humanId } = input;
  if (!humanId) return "";
  const color = getFaction(state, humanId)?.color ?? "#888888";
  const units = trainableUnits(city);

  const boxes = units.map((unit) => {
    const def = UNITS[unit];
    const cost = regimentCost(unit);
    const check = canTrain(state, humanId, city.id, unit);
    // Every type beats militia; name the one that matters.
    const beats = def.beats.filter((b) => b !== "militia");
    return `
      <button type="button" class="unit-box" data-train="${unit}" ${check.ok ? "" : "disabled"}
        title="${escapeHtml(check.ok ? `Queue a regiment of ${def.name}: ${cost.gold} gold, ${cost.population} people, upkeep ${formatUpkeep(upkeepFor(unit, regimentSize(unit)))} a turn` : check.reason)}">
        ${figureSvg(unit, color)}
        <span class="unit-name">${def.name}</span>
        <span class="unit-stat">${regimentSize(unit)} soldiers</span>
        <span class="unit-stat">${formatNumber(cost.gold)} gold</span>
        <span class="unit-stat">Move ${def.movement}</span>
        <span class="unit-stat">${beats.length ? `Beats ${beats.map((b) => UNITS[b].name.toLowerCase()).join(", ")}` : "Beats nothing"}</span>
      </button>`;
  }).join("");

  const checks = units.map((u) => canTrain(state, humanId, city.id, u));
  const blocked = checks.find((c) => !c.ok);
  const note = checks.every((c) => !c.ok) && blocked && !blocked.ok ? escapeHtml(blocked.reason) : "";
  // What the Barracks would unlock next.
  const locked = UNIT_TYPES.find((u) => !units.includes(u));
  const next = locked ? `Next: ${UNITS[locked].name.toLowerCase()}, with a ${BUILDINGS.barracks.levels[UNITS[locked].barracks - 1].name}.` : "";

  return `
    <div class="box-grid units">${boxes}</div>
    ${next ? `<p class="hint">${escapeHtml(next)}</p>` : ""}
    ${recruitQueue(city, color)}
    ${note ? `<p class="hint">${note}</p>` : ""}`;
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
      const choosable = damaged(r) && !queued.has(r.id);
      return regimentBox(r, color, {
        status: queued.has(r.id) ? "Queued" : damaged(r) ? `${formatNumber(retrainCost(r))} gold` : "Full",
        title: queued.has(r.id)
          ? `${UNITS[r.unit].name}: queued for retraining`
          : damaged(r)
            ? `${UNITS[r.unit].name}: ${r.soldiers} of ${regimentSize(r.unit)}. ${chosen.has(r.id) ? "Click to leave it out." : "Click to choose it for retraining."}`
            : `${UNITS[r.unit].name}: at full strength`,
        attr: choosable ? `data-retrain="${r.id}"` : "",
        pressed: choosable ? chosen.has(r.id) : null,
        dim: !choosable,
      });
    })
    .join("");

  const picked = army.regiments.filter((r) => chosen.has(r.id));
  const gold = picked.reduce((sum, r) => sum + retrainCost(r), 0);
  const check = canRetrain(state, humanId, city.id, picked.map((r) => r.id));
  const anyChoosable = army.regiments.some((r) => damaged(r) && !queued.has(r.id));
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
    let when: string;
    if (city.besiegedBy) when = "Halted by the siege";
    else if (order.kind === "retrain") when = retrainPeople > spare ? "Waiting for people" : "Next turn";
    else {
      people += regimentSize(order.unit) * ARMY_RULES.populationPerSoldier;
      when = people > spare ? "Waiting for people" : trainingAhead === 0 ? "Next turn" : `In ${trainingAhead + 1} turns`;
      trainingAhead++;
    }
    const label = order.kind === "train" ? UNITS[order.unit].name : `+${order.soldiers} ${UNITS[order.unit].name}`;
    return `
      <div class="queue-entry" title="${escapeHtml(`${order.kind === "train" ? "Training" : "Retraining"} ${UNITS[order.unit].name}: ${formatNumber(order.cost)} gold. Cancel to refund it.`)}">
        ${figureSvg(order.unit, color)}
        <span class="queue-entry-name">${escapeHtml(label)}</span>
        <span class="reg-status">${escapeHtml(when)}</span>
        <button type="button" class="queue-cancel" data-cancel-recruit="${index}" aria-label="Cancel ${escapeHtml(label)}">&times;</button>
      </div>`;
  }).join("");
  return `
    <h4 class="queue-title">Recruitment queue <span class="queue-count">${city.recruitQueue.length}/${ARMY_RULES.recruitQueueSize}</span></h4>
    <div class="queue-row">${items || `<div class="queue-slot empty">Empty</div>`}</div>`;
}

function terrainSection(state: GameState, tile: TileId, compact: boolean): string {
  const terrain = TERRAIN[state.tiles[tile].terrain];
  const defense = defenseBonusAt(state, tile);
  const defenseText = defense > 0 ? `+${Math.round(defense * 100)}%` : "None";

  if (compact) {
    return `<p class="terrain-line">${terrain.name}. Defense bonus ${defenseText}.</p>`;
  }

  const claim = state.territory[tile];
  const owner = claim ? getFaction(state, claim.owner) : undefined;
  const cost = terrain.passable ? enterCost(state, tile) : 0;
  const move = !terrain.passable ? "Impassable" : cost < terrain.moveCost ? `${cost} (roads)` : `${cost}`;
  return `
    <h2>${terrain.name}</h2>
    ${owner ? ownerLine(owner.name, owner.color, state.cities[claim!.cityId]?.name ?? "") : ""}
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
