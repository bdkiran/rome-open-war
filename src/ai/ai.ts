import type { Action } from "@/core/actions.js";
import type { GameContext } from "@/core/context.js";
import {
  armiesOf,
  armyAt,
  updateFaction,
  cityAt,
  citiesOf,
  getFaction,
  type Army,
  type City,
  type CityId,
  type FactionId,
  type GameState,
  type RegimentId,
} from "@/core/state.js";
import { AI } from "@/data/ai.js";
import type { TaxRate } from "@/data/economy.js";
import { ARMY_RULES, UNIT_TYPES, UNITS, regimentSize, type Tier, type UnitType } from "@/data/units.js";
import type { TileId } from "@/map/topology.js";
import {
  assess,
  counterFor,
  counterToNearestEnemy,
  trainAgainst,
  enemyRegimentsNear,
  stackCanMove,
  type Assessment,
} from "@/ai/assess.js";
import {
  attackOptions,
  canMerge,

  factionUpkeep,
  reachableTiles,
  upkeepFor,
} from "@/systems/armies.js";
import { cityStats, factionIncome, mineableTiles } from "@/systems/cities.js";
import { battleSides, battleStrength, defenseBonusAt, matchup } from "@/systems/combat.js";
import { canBesiege } from "@/systems/siege.js";
import { canBuild, nextLevel } from "@/systems/buildings.js";
import { unsettledCities } from "@/systems/conquest.js";
import { bestTier, canRetrain, canTrain, trainableUnits } from "@/systems/recruitment.js";
import type { BuildingType } from "@/data/buildings.js";
import { fogged, visibleTiles } from "@/systems/vision.js";
import { costToTarget } from "@/systems/pathfinding.js";

/**
 * Chooses the AI's next action, one at a time. The controller calls this
 * repeatedly, applying each action, until it returns endTurn. Each call looks
 * at the current state afresh, so the AI never acts on stale information.
 *
 * It returns ordinary Actions, the same ones the human player sends, so the
 * AI can never break the rules. In order of priority it will:
 *
 *   0. Raise taxes when in debt (and lower them once recovered), and merge
 *      damaged regiments of the same type.
 *   1. Attack wherever the odds are good, marching up to the target first if
 *      it's in reach this turn, and counting every army that would join in.
 *      That includes sieges it expects to win and sallies from besieged cities.
 *   2. Pull field armies back when an adjacent enemy outmatches them.
 *   3. Send surplus regiments from the muster city toward the target once
 *      they're big enough to survive a sally by its defenders.
 *   4. March field armies toward the target and besiege it when they arrive,
 *      or bring them home when there's no target.
 *
 * When one of its own cities is besieged, relieving it comes first: armies
 * besieging it are attacked at even odds, the garrison sallies (at any odds
 * once the city is about to surrender), a relief force is trained and sent
 * from the nearest free city, and every field army marches to the city.
 *   5. Defend: replenish battered garrisons and train garrisons for its cities.
 *   6. Build: walls where enemies are near, then advancing the city, then
 *      markets and farms, keeping a little gold in reserve.
 *   7. Train field regiments that counter the target's defenders.
 * Training never lets upkeep outgrow income.
 */
export function nextAction(ctx: GameContext, real: GameState, factionId: FactionId): Action {
  // The AI plays under the same fog as the player: it decides using only the
  // enemy armies it can see. Its moves are worked out against the real state
  // so they're always legal.
  const seen = fogged(real, factionId, visibleTiles(ctx, real, factionId));
  const plan = assess(ctx, seen, factionId);
  return (
    settleAction(seen, factionId) ??
    taxAction(seen, factionId, plan) ??
    mergeAction(seen, factionId) ??
    attackAction(ctx, real, seen, factionId, plan) ??
    retreatAction(ctx, real, seen, factionId) ??
    launchAction(ctx, real, seen, factionId, plan) ??
    advanceAction(ctx, real, seen, factionId, plan) ??
    trainingAction(ctx, seen, factionId, plan, "defense") ??
    constructionAction(ctx, seen, factionId, plan) ??
    trainingAction(ctx, seen, factionId, plan, "field") ?? { type: "endTurn" }
  );
}

// ---- 0. Conquered cities, taxes and merging -------------------------------

/**
 * Decides the fate of a city just taken: exterminate it when short of gold,
 * enslave it when there are other cities to send its people to, otherwise
 * occupy it.
 */
function settleAction(state: GameState, factionId: FactionId): Action | null {
  const city = unsettledCities(state, factionId)[0];
  if (!city) return null;
  const gold = getFaction(state, factionId)?.gold ?? 0;
  const others = citiesOf(state, factionId).length - 1;
  const choice = gold < AI.plunderWhenBelow ? "exterminate" : others > 0 ? "enslave" : "occupy";
  return { type: "settleCity", cityId: city.id, choice };
}


/**
 * The tax rate the AI wants for a city, or null to leave it as it is. In
 * debt, or at war for a besieged city, every city pays high taxes. A city at
 * its capacity pays high taxes too: it can't grow anyway, so slower growth
 * costs nothing. Otherwise taxes come back to normal, once the treasury has
 * recovered from any debt.
 */
export function aiTaxRate(state: GameState, city: City, gold: number, atWar: boolean): TaxRate | null {
  if (gold < 0 || atWar) return "high";
  if (city.population >= cityStats(state, city).capacity * AI.fullCity) return "high";
  return gold > AI.recoveredGold ? "normal" : null;
}

/** Sets one city's taxes to what the AI wants for it (see aiTaxRate). */
function taxAction(state: GameState, factionId: FactionId, plan: Assessment): Action | null {
  const gold = getFaction(state, factionId)?.gold ?? 0;
  for (const city of citiesOf(state, factionId)) {
    const wanted = aiTaxRate(state, city, gold, plan.relief !== null);
    if (wanted && wanted !== city.taxRate) return { type: "setTaxRate", cityId: city.id, rate: wanted };
  }
  return null;
}


/** Merge damaged regiments of the same type into fuller ones. It's free. */
function mergeAction(state: GameState, factionId: FactionId): Action | null {
  const army = armiesOf(state, factionId).find(canMerge);
  return army ? { type: "mergeRegiments", armyId: army.id } : null;
}

// ---- 1. Attack ----------------------------------------------------------

function attackAction(ctx: GameContext, real: GameState, state: GameState, factionId: FactionId, plan: Assessment): Action | null {
  // Field armies first, so a captured city is taken by troops that aren't needed at home.
  const armies = [...armiesOf(state, factionId)].sort(
    (a, b) => Number(isHome(state, b, factionId)) - Number(isHome(state, a, factionId)),
  );

  for (const army of armies) {
    const regimentIds = usableRegiments(state, army, factionId, plan).map((r) => r.id);
    if (regimentIds.length === 0) continue;

    // Everything these regiments can hit this turn, marching up first if needed.
    for (const [target, via] of attackOptions(ctx, real, army, regimentIds)) {
      const defender = armyAt(state, target);
      // Only attack armies we can see. A city that looks empty may hide a garrison.
      if (!defender && armyAt(real, target) && !cityAt(state, target)) continue;
      if (!defender) return { type: "attack", armyId: army.id, regimentIds, target, via };

      // Both whole sides, as they'd stand once the army has marched up: every
      // army of ours or theirs (that we can see) within a tile of either.
      const sides = battleSides(ctx, state, { ...army, tile: via }, regimentIds, target);
      const strength = battleStrength(
        sides.attackers.flatMap((s) => s.regiments),
        sides.defenders.flatMap((s) => s.regiments),
        defenseBonusAt(state, target),
      );
      if (strength.attacker > strength.defender * attackMarginFor(ctx, state, factionId, army, target)) {
        return { type: "attack", armyId: army.id, regimentIds, target, via };
      }
    }
  }
  return null;
}

/**
 * How much stronger we need to be to attack. Defending our own cities comes
 * first: armies besieging one of them are attacked at even odds, and a
 * besieged garrison sallies at even odds, at poor odds once its city is close
 * to surrendering, and at any odds on its last turn (its garrison would be
 * destroyed anyway).
 */
function attackMarginFor(ctx: GameContext, state: GameState, factionId: FactionId, army: Army, target: TileId): number {
  const home = cityAt(state, army.tile);
  if (home && home.owner === factionId && home.besiegedBy) {
    if (home.supplies <= AI.lastStandTurns) return 0;
    return home.supplies <= AI.desperateTurns ? AI.desperateMargin : AI.sallyMargin;
  }
  const besieged = ctx.topology
    .neighbors(target)
    .map((t) => cityAt(state, t))
    .filter((c) => c !== undefined && c.owner === factionId && c.besiegedBy !== null);
  if (besieged.length === 0) return AI.attackMargin;
  // A city about to surrender is lost anyway: throw everything at its besiegers.
  return besieged.some((c) => c!.supplies <= AI.desperateTurns) ? AI.desperateMargin : AI.reliefMargin;
}

/** Whether an army is standing in one of our own cities. */
function isHome(state: GameState, army: Army, factionId: FactionId): boolean {
  return cityAt(state, army.tile)?.owner === factionId;
}

/**
 * Regiments an army can commit to an attack. Field armies use every regiment
 * that can move. A garrison only uses the ones it can spare, unless its city
 * is besieged, when it throws in everything. A stack attacks together, so if
 * any usable regiment is out of moves, it doesn't attack this turn.
 */
function usableRegiments(state: GameState, army: Army, factionId: FactionId, plan: Assessment) {
  const city = cityAt(state, army.tile);
  const home = city?.owner === factionId ? city : undefined;
  const keep = home && !home.besiegedBy ? plan.garrisonNeed.get(home.id) ?? 0 : 0;
  const ready = army.regiments.filter((r) => r.movementLeft > 0);
  return ready.slice(0, Math.max(0, army.regiments.length - keep));
}

// ---- 2. Retreat ---------------------------------------------------------

function retreatAction(ctx: GameContext, real: GameState, state: GameState, factionId: FactionId): Action | null {
  for (const army of fieldArmies(state, factionId)) {
    if (!stackCanMove(army)) continue;
    const outmatched = ctx.topology.neighbors(army.tile).some((tile) => {
      const enemy = armyAt(state, tile);
      if (!enemy || enemy.owner === factionId) return false;
      const s = battleStrength(enemy.regiments, army.regiments, defenseBonusAt(state, army.tile));
      return s.attacker > s.defender * AI.retreatMargin;
    });
    if (!outmatched) continue;

    const home = nearestCityWithRoom(ctx, state, factionId, army);
    if (!home) continue;
    const step = stepToward(ctx, real, state, army, army.regiments.map((r) => r.id), home);
    if (step) return { type: "moveArmy", armyId: army.id, regimentIds: army.regiments.map((r) => r.id), to: step };
  }
  return null;
}

function nearestCityWithRoom(ctx: GameContext, state: GameState, factionId: FactionId, army: Army): TileId | null {
  let best: TileId | null = null;
  let bestDistance = Infinity;
  for (const city of citiesOf(state, factionId)) {
    const there = armyAt(state, city.tile);
    if (there && there.regiments.length + army.regiments.length > ARMY_RULES.maxRegiments) continue;
    const d = ctx.topology.distance(city.tile, army.tile);
    if (d < bestDistance) {
      best = city.tile;
      bestDistance = d;
    }
  }
  return best;
}

// ---- 3. Launch ----------------------------------------------------------

function launchAction(ctx: GameContext, real: GameState, state: GameState, factionId: FactionId, plan: Assessment): Action | null {
  if (plan.relief) return launchRelief(ctx, real, state, factionId, plan);
  const { target, muster } = plan;
  if (!target || !muster) return null;
  const army = armyAt(state, muster.tile);
  if (!army || army.owner !== factionId) return null;

  const keep = plan.garrisonNeed.get(muster.id) ?? 0;
  const surplus = army.regiments.length - keep;
  if (surplus < AI.minLaunchRegiments) return null;

  // Send the regiments best suited to the target's defenders; the rest stay home.
  const defenders = armyAt(state, target.tile);
  const counter = counterFor(defenders);
  const ready = army.regiments
    .filter((r) => r.movementLeft > 0)
    .sort((a, b) => (counter ? rank(b.unit, counter) - rank(a.unit, counter) : 0));
  const group = ready.slice(0, surplus);
  if (group.length < AI.minLaunchRegiments) return null;

  // Big enough to hold its ground if the defenders sally out against it in the open.
  if (defenders) {
    const sally = battleStrength(defenders.regiments, group, 0);
    if (sally.attacker * AI.launchMargin > sally.defender) return null;
  }

  const regimentIds = group.map((r) => r.id);
  const step = stepToward(ctx, real, state, army, regimentIds, target.tile);
  return step ? { type: "moveArmy", armyId: army.id, regimentIds, to: step } : null;
}

/**
 * Sends a relief force from the city nearest a besieged one: everything
 * beyond a minimal garrison (even at the capital), a regiment at a time if
 * need be, so help is always on the way.
 */
function launchRelief(ctx: GameContext, real: GameState, state: GameState, factionId: FactionId, plan: Assessment): Action | null {
  const { relief } = plan;
  if (!relief?.muster) return null;
  const army = armyAt(state, relief.muster.tile);
  if (!army || army.owner !== factionId) return null;

  const group = army.regiments.filter((r) => r.movementLeft > 0).slice(0, Math.max(0, army.regiments.length - AI.baseGarrison));
  if (group.length === 0) return null;
  const regimentIds = group.map((r) => r.id);
  const step = stepToward(ctx, real, state, army, regimentIds, relief.city.tile);
  return step ? { type: "moveArmy", armyId: army.id, regimentIds, to: step } : null;
}

/** Higher for units that do better against the counter's victim. */
function rank(unit: UnitType, counter: UnitType): number {
  // The counter's victim is the first type it beats (the triangle one; every type beats militia).
  return unit === counter ? 2 : matchup(unit, UNITS[counter].beats[0]) >= 1 ? 1 : 0;
}

// ---- 4. Advance ---------------------------------------------------------

function advanceAction(ctx: GameContext, real: GameState, state: GameState, factionId: FactionId, plan: Assessment): Action | null {
  if (plan.relief) {
    // Every field army marches to the besieged city; attacks on the besiegers come from attackAction.
    const goal = plan.relief.city.tile;
    for (const army of fieldArmies(state, factionId)) {
      if (!stackCanMove(army) || ctx.topology.distance(army.tile, goal) <= 1) continue;
      const regimentIds = army.regiments.map((r) => r.id);
      const step = stepToward(ctx, real, state, army, regimentIds, goal);
      if (step) return { type: "moveArmy", armyId: army.id, regimentIds, to: step };
    }
    return null;
  }

  for (const army of fieldArmies(state, factionId)) {
    // Declaring a siege doesn't need movement, so check that first.
    if (plan.target && canBesiege(ctx, real, factionId, army.id, plan.target.tile).ok) {
      return { type: "besiege", armyId: army.id, target: plan.target.tile };
    }
    if (!stackCanMove(army)) continue;
    const regimentIds = army.regiments.map((r) => r.id);

    if (!plan.target) {
      // Nothing worth attacking: come home and help defend.
      const home = nearestCityWithRoom(ctx, state, factionId, army);
      const step = home ? stepToward(ctx, real, state, army, regimentIds, home) : null;
      if (step) return { type: "moveArmy", armyId: army.id, regimentIds, to: step };
      continue;
    }

    // Already next to the target (and besieging it): wait for it to surrender or for the odds to turn.
    if (ctx.topology.neighbors(army.tile).includes(plan.target.tile)) continue;
    const step = stepToward(ctx, real, state, army, regimentIds, plan.target.tile);
    if (step) return { type: "moveArmy", armyId: army.id, regimentIds, to: step };
  }
  return null;
}

/** Armies standing outside our own cities. */
function fieldArmies(state: GameState, factionId: FactionId): Army[] {
  return armiesOf(state, factionId).filter((a) => cityAt(state, a.tile)?.owner !== factionId);
}

/**
 * The reachable tile that gets these regiments closest to `goal`, if any gets
 * them closer at all. The route is planned around the enemies we can see;
 * the tiles we can actually reach come from the real state, so the move is
 * always legal.
 */
function stepToward(
  ctx: GameContext,
  real: GameState,
  seen: GameState,
  army: Army,
  regimentIds: readonly RegimentId[],
  goal: TileId,
): TileId | null {
  const cost = costToTarget(ctx, seen, goal, army.owner);
  const here = cost.get(army.tile) ?? Infinity;
  let best: TileId | null = null;
  let bestCost = here;
  for (const tile of reachableTiles(ctx, real, army, regimentIds).keys()) {
    const c = cost.get(tile) ?? Infinity;
    if (c < bestCost) {
      best = tile;
      bestCost = c;
    }
  }
  return best;
}

// ---- 5. Train -----------------------------------------------------------

/**
 * Training in two phases: "defense" (relief forces, replenishing and
 * garrisons, which come before building) and "field" (regiments for the
 * campaign, which come after it).
 */
function trainingAction(
  ctx: GameContext,
  state: GameState,
  factionId: FactionId,
  plan: Assessment,
  phase: "defense" | "field",
): Action | null {
  const faction = getFaction(state, factionId);
  if (!faction || faction.gold <= 0) return null;
  const spareIncome = factionIncome(state, factionId) * (1 - AI.upkeepHeadroom) - factionUpkeep(state, factionId);

  const regimentsAt = (tile: TileId) => {
    const army = armyAt(state, tile);
    return army && army.owner === factionId ? army.regiments.length : 0;
  };

  // A besieged city comes first: raise a relief force that counters the besiegers, whatever the upkeep.
  const { relief } = plan;
  if (phase === "defense" && relief?.muster) {
    const main = relief.besiegers.sort((a, b) => b.regiments.length - a.regiments.length)[0];
    const unit = trainAgainst(relief.muster, main) ?? leastRepresented(relief.muster, armyAt(state, relief.muster.tile));
    const tier = affordableTier(state, factionId, relief.muster.id, unit, Infinity);
    if (tier) {
      return { type: "trainRegiment", cityId: relief.muster.id, unit, tier };
    }
  }

  // Bring battered garrisons back to strength before training new regiments:
  // queue every badly damaged regiment in the city (all are retrained by next turn).
  for (const city of phase === "defense" ? citiesOf(state, factionId) : []) {
    const army = armyAt(state, city.tile);
    if (army?.owner !== factionId) continue;
    const queued = new Set(city.recruitQueue.flatMap((o) => (o.kind === "retrain" ? [o.regimentId] : [])));
    const battered = army.regiments
      .filter((r) => r.soldiers <= regimentSize(r.unit) / 2 && !queued.has(r.id))
      .map((r) => r.id);
    if (battered.length > 0 && canRetrain(state, factionId, city.id, battered).ok) {
      return { type: "replenish", cityId: city.id, regimentIds: battered };
    }
  }

  // Garrisons first, most short-handed city first. Each city trains one regiment a turn.
  const cities = citiesOf(state, factionId)
    .map((city) => ({ city, deficit: (plan.garrisonNeed.get(city.id) ?? 0) - regimentsAt(city.tile) }))
    .filter((c) => c.deficit > 0)
    .sort((a, b) => b.deficit - a.deficit);

  for (const { city } of phase === "defense" ? cities : []) {
    const unit = counterToNearestEnemy(ctx, state, city);
    // An empty or threatened city gets its garrison even if upkeep is tight.
    const emergency = regimentsAt(city.tile) === 0 || enemyRegimentsNear(ctx, state, factionId, city.tile) > 0;
    const tier = affordableTier(state, factionId, city.id, unit, emergency ? Infinity : spareIncome);
    if (tier) {
      return { type: "trainRegiment", cityId: city.id, unit, tier };
    }
  }

  if (phase === "defense") return null;
  if (savingForBuilding(ctx, state, factionId)) return null;

  // Then a field regiment at the muster city, countering the target's defenders.
  const { target, muster } = plan;
  if (target && muster && regimentsAt(muster.tile) < ARMY_RULES.maxRegiments) {
    // Counter the garrison if we can see it; otherwise build a balanced stack.
    const unit = trainAgainst(muster, armyAt(state, target.tile)) ?? leastRepresented(muster, armyAt(state, muster.tile));
    const tier = affordableTier(state, factionId, muster.id, unit, spareIncome);
    if (tier) {
      return { type: "trainRegiment", cityId: muster.id, unit, tier };
    }
  }
  return null;
}

// ---- 6. Build ------------------------------------------------------------

/** Regiments per city the AI wants before it saves up for buildings instead of more field regiments. */
const ARMY_BEFORE_SAVING = 5;
/** It saves for a building only if its income would pay for it within this many turns. */
const SAVING_TURNS = 10;

/**
 * Whether to hold back field training to save for a building: when the army
 * is already a decent size, and some city has a building it could start but
 * for the gold, that the treasury would cover within a few turns of income.
 */
function savingForBuilding(ctx: GameContext, state: GameState, factionId: FactionId): boolean {
  const regiments = armiesOf(state, factionId).reduce((sum, a) => sum + a.regiments.length, 0);
  const cities = citiesOf(state, factionId);
  if (regiments < cities.length * ARMY_BEFORE_SAVING) return false;

  const faction = getFaction(state, factionId);
  if (!faction) return false;
  const income = Math.max(1, factionIncome(state, factionId) - factionUpkeep(state, factionId));
  // Pretend the treasury is full, to ask "could it be built, gold aside?"
  const rich = updateFaction(state, factionId, (f) => ({ ...f, gold: Number.MAX_SAFE_INTEGER }));
  return cities.some((city) =>
    aiBuildOrder(state, city.id, false).some((building) => {
      const next = nextLevel(city, building);
      if (!next || faction.gold >= next.def.cost + AI.buildReserve) return false;
      return next.def.cost - faction.gold <= income * SAVING_TURNS && canBuild(rich, factionId, city.id, building).ok;
    }),
  );
}


/**
 * The order the AI builds in a city: government, market, the unit buildings
 * (spear yard, archery range, stables), a mine (only with a few hills or
 * mountains to dig), farms, a port (only with sea), walls, then roads. With
 * enemies near, walls come first. The market comes before the military
 * buildings so the economy isn't starved early.
 */
export function aiBuildOrder(state: GameState, cityId: CityId, threatened: boolean): BuildingType[] {
  const mine: BuildingType[] = mineableTiles(state, cityId) >= AI.mineWorthTiles ? ["mine"] : [];
  const port: BuildingType[] = state.cities[cityId].fishingGrounds > 0 ? ["port"] : [];
  const military: BuildingType[] = ["spearYard", "archeryRange", "stables"];
  return threatened
    ? ["walls", "government", "market", ...military, ...mine, "farms", ...port, "roads"]
    : ["government", "market", ...military, ...mine, "farms", ...port, "walls", "roads"];
}

function constructionAction(ctx: GameContext, state: GameState, factionId: FactionId, plan: Assessment): Action | null {
  if (plan.relief) return null; // at war for a city: every coin goes to the army
  const gold = getFaction(state, factionId)?.gold ?? 0;

  for (const city of citiesOf(state, factionId)) {
    if (city.constructionQueue.length > 0 || city.besiegedBy) continue;
    const threatened = enemyRegimentsNear(ctx, state, factionId, city.tile) > 0;
    for (const building of aiBuildOrder(state, city.id, threatened)) {
      const next = nextLevel(city, building);
      if (!next || gold < next.def.cost + AI.buildReserve) continue;
      if (canBuild(state, factionId, city.id, building).ok) return { type: "build", cityId: city.id, building };
    }
  }
  return null;
}

/**
 * Of the unit types a city can train, the one with the fewest soldiers in an
 * army, to keep stacks mixed (the cheapest, for an empty army).
 */
function leastRepresented(city: City, army: Army | undefined): UnitType {
  const totals = new Map<UnitType, number>(trainableUnits(city).map((t) => [t, 0]));
  for (const r of army?.regiments ?? []) if (totals.has(r.unit)) totals.set(r.unit, totals.get(r.unit)! + r.soldiers);
  return [...totals].sort((a, b) => a[1] - b[1])[0][0];
}

/**
 * The best tier of a unit we can train in this city now and keep paying
 * for: the highest the city has unlocked whose gold we have and whose
 * upkeep fits in the spare income, dropping a tier until one does. Null if
 * none does.
 */
function affordableTier(
  state: GameState,
  factionId: FactionId,
  cityId: string,
  unit: UnitType,
  spareIncome: number,
): Tier | null {
  // One order at a time per city, so the AI can change its mind as things change.
  if (state.cities[cityId].recruitQueue.length > 0) return null;
  const best = bestTier(state.cities[cityId], unit) ?? 0;
  for (let tier = best; tier >= 1; tier--) {
    const t = tier as Tier;
    if (upkeepFor(unit, regimentSize(unit), t) > spareIncome) continue;
    if (canTrain(state, factionId, cityId, unit, t).ok) return t;
  }
  return null;
}
