import type { Action } from "@/core/actions.js";
import type { GameContext } from "@/core/context.js";
import { createGame } from "@/core/setup.js";
import {
  armyAt,
  cityAt,
  type BattleReport,
  citiesOf,
  currentFaction,
  getFaction,
  type Army,
  type ArmyId,
  type GameState,
  type LogEntry,
  type RegimentId,
} from "@/core/state.js";
import { ROMAN_WORLD } from "@/data/scenarios/romanWorld.js";
import type { Scenario } from "@/data/scenarios/types.js";
import type { TaxRate } from "@/data/economy.js";
import type { BuildingType } from "@/data/buildings.js";
import { ARMY_RULES, type UnitType, regimentSize } from "@/data/units.js";
import { GameController } from "@/game/controller.js";
import type { TileId } from "@/map/topology.js";
import { attachInput } from "@/render/input.js";
import type { ViewState } from "@/render/mapView.js";
import { MapView3D } from "@/render/three/mapView3d.js";
import { armyHolding, attackOptions, marchRoute, marchSchedule, reachableTiles } from "@/systems/armies.js";
import { fogged, visibleTiles } from "@/systems/vision.js";
import { renderInfoPanel, type CityTab } from "@/ui/infoPanel.js";
import { hideBattlePanel, showBattlePanel } from "@/ui/battlePanel.js";
import { hideSiegePanel, showSiegePanel } from "@/ui/siegePanel.js";
import { hideBattleResult, showBattleResult } from "@/ui/battleResult.js";
import { hideSettlement, showSettlement } from "@/ui/settlementPanel.js";
import { unsettledCities } from "@/systems/conquest.js";
import type { SettlementChoice } from "@/data/conquest.js";
import { showGameOver } from "@/ui/gameOver.js";
import { previewBattle, type BattlePreview } from "@/systems/combat.js";
import { concerns, renderReports } from "@/ui/reports.js";
import { outcomeFor } from "@/systems/victory.js";
import { updateTurnPanel } from "@/ui/turnPanel.js";

// ---- Scenario -------------------------------------------------------------

// The map, factions and starting cities. A scenario can use any MapEngine.
const scenario: Scenario = ROMAN_WORLD;

const map = scenario.mapEngine.createMap();
const { topology } = map;
const ctx: GameContext = { topology };

const controller = new GameController(ctx, createGame(ctx, map, scenario));
/** The faction the person at the keyboard controls, if any. */
const humanId = controller.getState().factions.find((f) => f.controller === "human")?.id ?? null;

// ---- DOM ----------------------------------------------------------------

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in index.html`);
  return el as T;
}

const canvas = byId<HTMLCanvasElement>("map");
const infoPanel = byId<HTMLElement>("tile-info");
const reportElements = {
  root: byId<HTMLElement>("reports"),
  count: byId<HTMLElement>("reports-count"),
  list: byId<HTMLOListElement>("reports-list"),
  dismissAll: byId<HTMLButtonElement>("reports-dismiss"),
};
const turnElements = {
  turnNumber: byId<HTMLElement>("turn-number"),
  turnStatus: byId<HTMLElement>("turn-status"),
  treasury: byId<HTMLElement>("treasury"),
  factionList: byId<HTMLOListElement>("faction-list"),
  endTurnButton: byId<HTMLButtonElement>("end-turn"),
  prevCityButton: byId<HTMLButtonElement>("prev-city"),
  nextCityButton: byId<HTMLButtonElement>("next-city"),
  breakdown: byId<HTMLElement>("money-breakdown"),
};
const notice = byId<HTMLElement>("notice");
const gameOver = {
  root: byId<HTMLElement>("game-over"),
  title: byId<HTMLElement>("game-over-title"),
  text: byId<HTMLElement>("game-over-text"),
  playAgain: byId<HTMLButtonElement>("play-again"),
};
const viewMapButton = byId<HTMLButtonElement>("view-map");
const battlePanel = {
  root: byId<HTMLElement>("battle"),
  title: byId<HTMLElement>("battle-title"),
  body: byId<HTMLElement>("battle-body"),
  fight: byId<HTMLButtonElement>("battle-fight"),
};
const siegePanel = {
  root: byId<HTMLElement>("siege"),
  title: byId<HTMLElement>("siege-title"),
  body: byId<HTMLElement>("siege-body"),
  continueSiege: byId<HTMLButtonElement>("siege-continue"),
  storm: byId<HTMLButtonElement>("siege-storm"),
  withdraw: byId<HTMLButtonElement>("siege-withdraw"),
};
const settlement = {
  root: byId<HTMLElement>("settle"),
  title: byId<HTMLElement>("settle-title"),
  body: byId<HTMLElement>("settle-body"),
};
const battleResult = {
  root: byId<HTMLElement>("battle-result"),
  title: byId<HTMLElement>("battle-result-title"),
  body: byId<HTMLElement>("battle-result-body"),
  close: byId<HTMLButtonElement>("battle-result-close"),
};
const withdrawButton = byId<HTMLButtonElement>("battle-withdraw");

// ---- View state ---------------------------------------------------------

const view: ViewState = {
  selected: null,
  hovered: null,
  reachable: new Set(),
  attackable: new Set(),
  activeFaction: humanId,
  visible: null,
  route: [],
  routeTurns: [],
};
/** The city panel tab the player last chose. */
let cityTab: CityTab = "construction";
/** Regiments queued for retraining, and the city they're queued in. */
let retrainQueue = new Set<RegimentId>();
let retrainCity: string | null = null;

/** Keep the retraining queue to damaged regiments still in the selected city's army. */
function syncRetrainQueue(state: GameState): void {
  const city = view.selected ? cityAt(state, view.selected) : undefined;
  if (!city || city.id !== retrainCity) {
    retrainQueue = new Set();
    retrainCity = city?.id ?? null;
    return;
  }
  const army = armyAt(state, city.tile);
  const queued = new Set(city.recruitQueue.flatMap((o) => (o.kind === "retrain" ? [o.regimentId] : [])));
  const choosable = new Set(
    army?.regiments.filter((r) => r.soldiers < regimentSize(r.unit) && !queued.has(r.id)).map((r) => r.id) ?? [],
  );
  retrainQueue = new Set([...retrainQueue].filter((id) => choosable.has(id)));
}

/** Regiments of the selected army that will move or attack together, and which army they belong to. */
let chosen = new Set<RegimentId>();
let chosenFor: ArmyId | null = null;
/** For each red tile, where the chosen regiments would attack it from. */
let attackVia = new Map<TileId, TileId>();

/**
 * The game as the player sees it: enemy armies out of sight are left out.
 * Used for everything shown and every highlight, so nothing leaks through
 * the fog. Once the player has fallen, the whole map is revealed.
 */
function playerView(state: GameState): GameState {
  if (!humanId || !view.visible) return state;
  return fogged(state, humanId, view.visible);
}

function refreshVision(state: GameState): void {
  const alive = humanId !== null && state.factions.some((f) => f.id === humanId && f.alive);
  view.visible = alive ? visibleTiles(ctx, state, humanId!) : null;
}

/** Once the game is won or lost, the player can look at the map but not give orders. */
function isGameOver(): boolean {
  return humanId !== null && outcomeFor(controller.getState(), humanId) !== null;
}

function isPlayerTurn(): boolean {
  return humanId !== null && !isGameOver() && currentFaction(controller.getState()).id === humanId;
}

/** The player's army on the selected tile, if any. */
function selectedArmy(state: GameState): Army | undefined {
  if (!view.selected) return undefined;
  const army = armyAt(state, view.selected);
  return army && army.owner === humanId ? army : undefined;
}

/**
 * Keep the ticked regiments in step with the selected army. Selecting an army
 * ticks every regiment in it except those trained this turn, so the stack
 * moves at its own pace: once any ticked regiment is out of moves, the stack
 * can't go further. To move faster regiments on their own, the player
 * unticks the others. New recruits are never ticked: they can't move yet,
 * and shouldn't hold the rest of the army back.
 */
function syncChosen(state: GameState): void {
  const army = selectedArmy(state);
  if (!army) {
    chosen = new Set();
    chosenFor = null;
    return;
  }
  const orderable = army.regiments.map((r) => r.id);
  if (chosenFor === army.id) {
    chosen = new Set(orderable.filter((id) => chosen.has(id)));
  } else {
    // A field army is chosen whole; a city's garrison isn't: pick which regiments march out.
    const garrison = cityAt(state, army.tile)?.owner === army.owner;
    chosen = new Set(garrison ? [] : orderable);
  }
  chosenFor = army.id;
}

/** Clears the selected tile and ticked regiments. */
function deselect(): void {
  view.selected = null;
  chosen = new Set();
  chosenFor = null;
}

/** Recompute move and attack highlights for the chosen regiments, and the selected army's march route. */
function refreshHighlights(state: GameState): void {
  const seen = playerView(state);
  const army = selectedArmy(seen);
  view.route = army?.destination ? marchRoute(ctx, seen, army, army.destination) : [];
  view.routeTurns = army ? marchSchedule(seen, army, view.route) : [];
  if (army && isPlayerTurn() && chosen.size > 0) {
    const ids = [...chosen];
    attackVia = attackOptions(ctx, seen, army, ids);
    view.reachable = new Set(reachableTiles(ctx, seen, army, ids).keys());
    view.attackable = new Set(attackVia.keys());
  } else {
    attackVia = new Map();
    view.reachable = new Set();
    view.attackable = new Set();
  }
}

// ---- Rendering ----------------------------------------------------------

/** The 3D map. It needs WebGL; without it, the player is told why the map is missing. */
function createMapView(): MapView3D {
  try {
    return new MapView3D(canvas, topology, map.tiles, byId<HTMLElement>("map-labels"));
  } catch (error) {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div class="notice">The map needs WebGL, which this browser has turned off or doesn't support. Try another browser or enable hardware acceleration.</div>`,
    );
    throw error;
  }
}

const mapView = createMapView();
const camera = mapView.camera;
mapView.resize();
camera.fitToBounds();

// Start looking at the player's capital.
const capital = humanId ? citiesOf(controller.getState(), humanId).find((c) => c.isCapital) : undefined;
if (capital) camera.centerOn(topology.tileCenter(capital.tile), 1);

let needsRedraw = true;
const requestRedraw = () => {
  needsRedraw = true;
};

const input = attachInput(canvas, camera, (p) => mapView.pick(p), {
  onSelect: handleTileClick,
  onHover(tile) {
    if (tile === view.hovered) return;
    view.hovered = tile;
    requestRedraw();
  },
  onViewChange: requestRedraw,
  onCommand: handleRightClick,
});

window.addEventListener("resize", () => {
  mapView.resize();
  requestRedraw();
});

let lastTime = performance.now();
/** While armies are marching across the map, it's redrawn this often (ms). */
const ANIMATION_INTERVAL = 1000 / 30;
let animating = false;
let lastAnimationDraw = 0;

function frame(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (input.update(dt)) needsRedraw = true;
  if (animating && now - lastAnimationDraw >= ANIMATION_INTERVAL) needsRedraw = true;
  if (needsRedraw) {
    animating = mapView.draw(controller.getState(), view, now / 1000);
    lastAnimationDraw = now;
    needsRedraw = false;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---- Player actions -----------------------------------------------------

function dispatch(action: Action): boolean {
  if (!humanId) return false;
  const result = controller.dispatch(humanId, action);
  if (!result.ok) showNotice(explainFailure(action, result.reason));
  return result.ok;
}

/**
 * Orders are planned on what the player can see, so one can fail against an
 * enemy army hidden in the fog. Say so, rather than giving a puzzling reason.
 */
function explainFailure(action: Action, reason: string): string {
  if (action.type === "moveArmy" || action.type === "attack") {
    return "An enemy army you couldn't see is in the way. Your troops hold their ground.";
  }
  return reason;
}

let noticeTimer: number | undefined;
function showNotice(text: string): void {
  notice.textContent = text;
  notice.hidden = false;
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => (notice.hidden = true), 4000);
}

/** A left click only ever selects: a tile, city or army. Orders are given with a right click. */
function handleTileClick(tile: TileId | null): void {
  view.selected = tile;
  refreshAll(controller.getState());
}

/**
 * The player clicked a red tile. An enemy army gets the battle panel. An
 * enemy city is put under siege straight away (the army marches up first if
 * needed) and the siege screen opens; a city already under the player's
 * siege just reopens it. A city in sight with no garrison is simply taken.
 */
function openAttack(state: GameState, army: Army, regimentIds: RegimentId[], tile: TileId): void {
  const seen = playerView(state);
  const via = attackVia.get(tile);
  const attack: Action = { type: "attack", armyId: army.id, regimentIds, target: tile, via };
  const city = cityAt(seen, tile);

  if (city && city.owner !== humanId) {
    const inSight = !view.visible || view.visible.has(tile);
    if (inSight && !armyAt(seen, tile)) {
      order(attack, army.tile, regimentIds);
      return;
    }
    if (city.besiegedBy === null) {
      const siegeVia = siegeStaging(seen, army, regimentIds, tile);
      if (!siegeVia) {
        showNotice(`Your army can't reach ${city.name} this turn.`);
        return;
      }
      order({ type: "besiege", armyId: army.id, target: tile, regimentIds, via: siegeVia }, army.tile, regimentIds);
      if (controller.getState().cities[city.id]?.besiegedBy !== humanId) return; // blocked; a notice says why
    }
    openSiegePanel(city.id, regimentIds);
    return;
  }

  const preview = previewBattle(ctx, seen, army.id, regimentIds, tile, via);
  if (!preview) {
    order(attack, army.tile, regimentIds);
    return;
  }
  pendingAttack = { action: attack, from: army.tile, regimentIds };
  showBattlePanel(battlePanel, state, preview, { marchesFirst: Boolean(via && via !== army.tile) });
}

/**
 * Where the regiments would stand to besiege a city: where they are if it's
 * next to them, otherwise the reachable tile next to it that leaves the most
 * movement (so they may still be able to storm this turn).
 */
function siegeStaging(seen: GameState, army: Army, regimentIds: RegimentId[], cityTile: TileId): TileId | null {
  const next = new Set(topology.neighbors(cityTile));
  if (next.has(army.tile)) return army.tile;
  let best: TileId | null = null;
  let bestLeft = -1;
  for (const [tile, left] of reachableTiles(ctx, seen, army, regimentIds)) {
    if (next.has(tile) && left > bestLeft) {
      best = tile;
      bestLeft = left;
    }
  }
  return best;
}

// ---- Siege screen -------------------------------------------------------

/** The storm the siege screen would launch, if the player chooses it. */
let pendingStorm: { action: Action; preview: BattlePreview | null; from: TileId; regimentIds: RegimentId[] } | null = null;
/** The city the siege screen is showing. */
let siegeCityId: string | null = null;

/**
 * Opens the siege screen for a city, from the point of view of the regiments
 * the player ordered: whether they can storm it now, and the odds.
 */
function openSiegePanel(cityId: string, regimentIds: RegimentId[]): void {
  const state = controller.getState();
  const seen = playerView(state);
  const city = seen.cities[cityId];
  if (!city || !humanId) return;

  const around = new Set(topology.neighbors(city.tile));
  const besiegers = Object.values(seen.armies)
    .filter((a) => a.owner === humanId && around.has(a.tile))
    .flatMap((a) => a.regiments);

  // Storming uses the ordered regiments that are now next to the city and can still move.
  const holder = armyHolding(state, regimentIds[0]);
  const ready = holder && around.has(holder.tile)
    ? holder.regiments.filter((r) => regimentIds.includes(r.id) && r.movementLeft > 0).map((r) => r.id)
    : [];
  const garrisonKnown = !view.visible || view.visible.has(city.tile);
  const preview = holder && ready.length > 0 ? previewBattle(ctx, seen, holder.id, ready, city.tile) : null;

  let stormBlocked: string | null = null;
  if (!holder || !around.has(holder.tile)) stormBlocked = `Your army isn't next to ${city.name}.`;
  else if (ready.length === 0) stormBlocked = "Your troops have no movement left to storm the walls this turn. You can storm next turn, or let the siege work.";

  pendingStorm = holder && ready.length > 0
    ? { action: { type: "attack", armyId: holder.id, regimentIds: ready, target: city.tile }, preview, from: holder.tile, regimentIds: ready }
    : null;

  siegeCityId = city.id;
  showSiegePanel(siegePanel, { state: seen, city, besiegers, garrisonKnown, storm: preview, stormBlocked });
}

function closeSiegePanel(): void {
  hideSiegePanel(siegePanel);
  releaseFocus();
}

siegePanel.storm.addEventListener("click", () => {
  const storm = pendingStorm;
  pendingStorm = null;
  closeSiegePanel();
  if (!storm) return;
  if (!storm.preview) {
    // Nothing visible inside the walls: march in (a hidden garrison will fight).
    order(storm.action, storm.from, storm.regimentIds);
    return;
  }
  pendingAttack = { action: storm.action, from: storm.from, regimentIds: storm.regimentIds };
  showBattlePanel(battlePanel, controller.getState(), storm.preview, { marchesFirst: false });
});
siegePanel.continueSiege.addEventListener("click", () => {
  pendingStorm = null;
  closeSiegePanel();
});
siegePanel.withdraw.addEventListener("click", () => {
  const cityId = siegeCityId;
  pendingStorm = null;
  closeSiegePanel();
  if (cityId && controller.getState().cities[cityId]?.besiegedBy === humanId) {
    dispatch({ type: "liftSiege", cityId });
  }
});

/**
 * Sends a move or attack, then keeps following the regiments that were
 * ordered: select the army they're now in, with its whole stack ticked.
 */
function order(action: Action, from: TileId, regimentIds: RegimentId[]): void {
  dispatch(action);
  const after = controller.getState();
  const holder = Object.values(after.armies).find((a) => a.regiments.some((r) => regimentIds.includes(r.id)));
  view.selected = holder?.tile ?? from;
  chosen = new Set(holder?.regiments.map((r) => r.id) ?? []);
  chosenFor = holder?.id ?? null;
  refreshAll(after);
}

/**
 * A right click gives the selected army its orders: move there if it's in
 * reach this turn, attack if it's a red tile (an enemy city is besieged),
 * otherwise march there over the coming turns.
 */
function handleRightClick(tile: TileId | null): void {
  const state = controller.getState();
  const army = selectedArmy(state);
  if (!tile || !army || !isPlayerTurn() || chosen.size === 0 || tile === army.tile) return;
  const regimentIds = [...chosen];
  if (view.reachable.has(tile)) {
    order({ type: "moveArmy", armyId: army.id, regimentIds, to: tile }, army.tile, regimentIds);
  } else if (view.attackable.has(tile)) {
    openAttack(state, army, regimentIds, tile);
  } else {
    order({ type: "march", armyId: army.id, regimentIds, destination: tile }, army.tile, regimentIds);
  }
}

/**
 * Steps through the player's cities (capital first), selecting each and
 * bringing it into view: +1 for the next, -1 for the previous.
 */
function selectCity(step: 1 | -1): void {
  if (!humanId) return;
  const state = controller.getState();
  const cities = citiesOf(state, humanId).sort((a, b) => Number(b.isCapital) - Number(a.isCapital));
  if (cities.length === 0) return;
  const current = cities.findIndex((c) => c.tile === view.selected);
  const next = cities[current === -1 ? (step === 1 ? 0 : cities.length - 1) : (current + step + cities.length) % cities.length];
  view.selected = next.tile;
  chosenFor = null;
  camera.centerOn(topology.tileCenter(next.tile));
  refreshAll(state);
}

turnElements.prevCityButton.addEventListener("click", () => selectCity(-1));
turnElements.nextCityButton.addEventListener("click", () => selectCity(1));
window.addEventListener("keydown", (e) => {
  if (e.key !== "Tab" || e.target instanceof HTMLInputElement || dialogOpen()) return;
  e.preventDefault();
  selectCity(e.shiftKey ? -1 : 1);
});

// The income line under the treasury opens the money breakdown.
byId<HTMLElement>("treasury").addEventListener("click", (e) => {
  if (!(e.target instanceof Element) || !e.target.closest("[data-toggle-breakdown]")) return;
  turnElements.breakdown.hidden = !turnElements.breakdown.hidden;
  updateTurnPanel(turnElements, controller.getState(), humanId);
});

// ---- Reports ------------------------------------------------------------

/** This turn's notifications not yet dismissed, and which are opened. */
let unreadReports: LogEntry[] = [];
const openReports = new Set<number>();
/** Log entries from this id on arrive as notifications at the start of the player's next turn. */
let reportsFrom = controller.getState().nextLogNumber;
let wasPlayerTurn = isPlayerTurn();

/**
 * When the player's turn begins, what happened since they ended their last
 * one (the end of their turn, and every other faction's turn) that concerns
 * them arrives as notifications. They last only this turn: ending the turn
 * clears them.
 */
function collectReports(state: GameState): void {
  const playerTurn = isPlayerTurn();
  if (playerTurn && !wasPlayerTurn && humanId) {
    const fresh = state.log.filter((e) => e.id >= reportsFrom && concerns(e, humanId!));
    unreadReports = fresh;
    openReports.clear();
    reportsFrom = state.nextLogNumber;
  }
  wasPlayerTurn = playerTurn;
}

function drawReports(): void {
  renderReports(reportElements, { unread: unreadReports, expanded: openReports });
}

reportElements.list.addEventListener("click", (e) => {
  const target = e.target instanceof Element ? e.target.closest("button") : null;
  if (!target) return;
  if (target.dataset.dismiss) {
    const id = Number(target.dataset.dismiss);
    unreadReports = unreadReports.filter((r) => r.id !== id);
    openReports.delete(id);
  } else if (target.dataset.report) {
    const id = Number(target.dataset.report);
    if (openReports.has(id)) openReports.delete(id);
    else openReports.add(id);
  }
  drawReports();
});
reportElements.dismissAll.addEventListener("click", () => {
  unreadReports = [];
  openReports.clear();
  drawReports();
});

// ---- Battle panel -------------------------------------------------------

/** The attack waiting on the player's choice in the battle panel. */
let pendingAttack: { action: Action; from: TileId; regimentIds: RegimentId[] } | null = null;

function closeBattlePanel(): void {
  pendingAttack = null;
  hideBattlePanel(battlePanel);
  releaseFocus();
}

/** Takes keyboard focus off a dialog button that's just been hidden, so shortcuts like Enter work again. */
function releaseFocus(): void {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

battlePanel.fight.addEventListener("click", () => {
  const attack = pendingAttack;
  closeBattlePanel();
  if (attack) order(attack.action, attack.from, attack.regimentIds);
});
withdrawButton.addEventListener("click", closeBattlePanel);

// Escape withdraws from whichever panel is open, before it reaches the map's own Escape (deselect).
window.addEventListener(
  "keydown",
  (e) => {
    if (e.key !== "Escape") return;
    if (!battlePanel.root.hidden) closeBattlePanel();
    else if (!siegePanel.root.hidden) closeSiegePanel();
    else if (!battleResult.root.hidden) closeBattleResult();
    else return;
    e.stopImmediatePropagation();
  },
  { capture: true },
);

/** Whether a dialog is open, so map shortcuts like Enter and Tab should wait. */
function dialogOpen(): boolean {
  return (
    !battlePanel.root.hidden ||
    !siegePanel.root.hidden ||
    !battleResult.root.hidden ||
    !settlement.root.hidden ||
    !gameOver.root.hidden
  );
}

function endPlayerTurn(): void {
  if (!isPlayerTurn() || dialogOpen()) return;
  deselect();
  // What happens from here on (the end of this turn and the others' turns) is reported next turn;
  // this turn's notifications go.
  reportsFrom = controller.getState().nextLogNumber;
  unreadReports = [];
  openReports.clear();
  dispatch({ type: "endTurn" });
}

turnElements.endTurnButton.addEventListener("click", endPlayerTurn);

window.addEventListener("keydown", (e) => {
  // A focused button already handles Enter itself, and Enter in a field shouldn't end the turn.
  if (e.key !== "Enter" || e.repeat) return;
  if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLInputElement) return;
  endPlayerTurn();
});

// Buttons in the panel: city tabs, recruitment cards, taxes, retraining, and army orders.
infoPanel.addEventListener("click", (e) => {
  const target = e.target instanceof Element ? e.target.closest("button") : null;
  if (!target) return;
  const state = controller.getState();
  const city = view.selected ? cityAt(state, view.selected) : undefined;

  if (target.dataset.cityTab) {
    cityTab = target.dataset.cityTab as CityTab;
    renderInfo(state);
  } else if (target.dataset.build && city) {
    dispatch({ type: "build", cityId: city.id, building: target.dataset.build as BuildingType });
  } else if (target.dataset.cancelConstruction !== undefined && city) {
    dispatch({ type: "cancelConstruction", cityId: city.id, index: Number(target.dataset.cancelConstruction) });
  } else if (target.dataset.cancelRecruit !== undefined && city) {
    dispatch({ type: "cancelRecruit", cityId: city.id, index: Number(target.dataset.cancelRecruit) });
  } else if (target.dataset.train && city) {
    dispatch({ type: "trainRegiment", cityId: city.id, unit: target.dataset.train as UnitType });
  } else if (target.dataset.tax && city) {
    dispatch({ type: "setTaxRate", cityId: city.id, rate: target.dataset.tax as TaxRate });
  } else if (target.dataset.merge) {
    dispatch({ type: "mergeRegiments", armyId: target.dataset.merge });
  } else if (target.dataset.regiment) {
    // A regiment box in the army panel: tick or untick it.
    const id = target.dataset.regiment;
    if (chosen.has(id)) chosen.delete(id);
    else chosen.add(id);
    refreshHighlights(state);
    renderInfo(state);
    requestRedraw();
  } else if (target.dataset.retrain) {
    const id = target.dataset.retrain;
    if (retrainQueue.has(id)) retrainQueue.delete(id);
    else retrainQueue.add(id);
    renderInfo(state);
  } else if (target.dataset.queueAll && city) {
    const army = armyAt(state, city.tile);
    const queued = new Set(city.recruitQueue.flatMap((o) => (o.kind === "retrain" ? [o.regimentId] : [])));
    for (const r of army?.regiments ?? []) {
      if (r.soldiers < regimentSize(r.unit) && !queued.has(r.id)) retrainQueue.add(r.id);
    }
    renderInfo(state);
  } else if (target.dataset.replenish) {
    // Clear the choice before dispatching: the panel redraws as the order goes in.
    const picked = [...retrainQueue];
    retrainQueue = new Set();
    if (!dispatch({ type: "replenish", cityId: target.dataset.replenish, regimentIds: picked })) {
      retrainQueue = new Set(picked);
      renderInfo(controller.getState());
    }
  } else if (target.dataset.cancelMarch) {
    dispatch({ type: "cancelMarch", armyId: target.dataset.cancelMarch });
  } else if (target.dataset.besiege) {
    const army = selectedArmy(state);
    const besieged = cityAt(state, target.dataset.besiege);
    if (army && besieged && dispatch({ type: "besiege", armyId: army.id, target: besieged.tile })) {
      refreshAll(controller.getState());
      openSiegePanel(besieged.id, army.regiments.filter((r) => chosen.has(r.id)).map((r) => r.id));
    }
  }
});

// ---- UI updates ---------------------------------------------------------

function infoInput(state: GameState) {
  return {
    ctx,
    state: playerView(state),
    visible: view.visible,
    tile: view.selected,
    humanId,
    playerTurn: isPlayerTurn(),
    cityTab,
    retrainQueue,
    chosenRegiments: chosen,
  };
}

function renderInfo(state: GameState): void {
  infoPanel.innerHTML = renderInfoPanel(infoInput(state));
}

function refreshAll(state: GameState): void {
  refreshVision(state);
  syncRetrainQueue(state);
  syncChosen(state);
  refreshHighlights(state);
  updateTurnPanel(turnElements, state, humanId);
  collectReports(state);
  drawReports();
  renderInfo(state);
  requestRedraw();
}

// ---- Victory and defeat -------------------------------------------------

/** Whether the player has closed the game-over screen to look at the map. */
let gameOverDismissed = false;

function checkGameOver(state: GameState): void {
  if (!humanId || gameOverDismissed || !gameOver.root.hidden) return;
  if (resultQueue.length > 0 || !battleResult.root.hidden) return; // results first
  const outcome = outcomeFor(state, humanId);
  if (!outcome) return;
  deselect();
  showGameOver(gameOver, state, outcome);
}

gameOver.playAgain.addEventListener("click", () => window.location.reload());
viewMapButton.addEventListener("click", () => {
  gameOverDismissed = true;
  gameOver.root.hidden = true;
  releaseFocus();
  refreshAll(controller.getState());
});

// ---- Battle results -----------------------------------------------------

/** Battles the player fought in that haven't been shown yet, oldest first. */
const resultQueue: BattleReport[] = [];
/** The id of the newest battle already considered. */
let lastBattleSeen = controller.getState().nextBattleNumber - 1;

function queueNewBattles(state: GameState): void {
  for (const report of state.battles) {
    if (report.id <= lastBattleSeen) continue;
    if (report.attacker === humanId || report.defender === humanId) resultQueue.push(report);
  }
  lastBattleSeen = state.nextBattleNumber - 1;
}

/** Shows the next queued result, unless another dialog is in the way. */
function showNextResult(): void {
  if (!humanId || resultQueue.length === 0) return;
  if (!battleResult.root.hidden || !battlePanel.root.hidden || !siegePanel.root.hidden) return;
  showBattleResult(battleResult, controller.getState(), resultQueue.shift()!, humanId);
}

function closeBattleResult(): void {
  hideBattleResult(battleResult);
  releaseFocus();
  if (resultQueue.length > 0) showNextResult();
  else {
    showNextSettlement();
    checkGameOver(controller.getState());
  }
}

// ---- A captured city's fate ----------------------------------------------

/**
 * When it's the player's turn and a city they've taken is waiting for its
 * fate to be decided, ask (after any battle results have been shown).
 */
function showNextSettlement(): void {
  if (!humanId || !isPlayerTurn() || !settlement.root.hidden) return;
  if (resultQueue.length > 0 || !battleResult.root.hidden || !battlePanel.root.hidden || !siegePanel.root.hidden) return;
  const state = controller.getState();
  const city = unsettledCities(state, humanId)[0];
  if (city) showSettlement(settlement, state, city);
}

settlement.body.addEventListener("click", (e) => {
  const target = e.target instanceof Element ? e.target.closest("button") : null;
  const choice = target?.dataset.settle as SettlementChoice | undefined;
  if (!choice || !humanId) return;
  const city = unsettledCities(controller.getState(), humanId)[0];
  if (!city) return;
  hideSettlement(settlement);
  releaseFocus();
  dispatch({ type: "settleCity", cityId: city.id, choice });
  showNextSettlement();
});

battleResult.close.addEventListener("click", closeBattleResult);

controller.subscribe((state) => {
  refreshAll(state);
  queueNewBattles(state);
  showNextResult();
  showNextSettlement();
  checkGameOver(state);
});
controller.start();

// Handy while developing: inspect state from the browser console,
// e.g. game.state.armies or game.state.log.
Object.assign(window, {
  game: {
    controller,
    scenario,
    topology,
    mapView,
    camera,
    view,
    get state() {
      return controller.getState();
    },
  },
});
