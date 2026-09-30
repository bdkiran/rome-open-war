import {
  addLog,
  armyAt,
  citiesOf,
  getFaction,
  updateFaction,
  type Check,
  type City,
  type CityId,
  type FactionId,
  type GameState,
  type RecruitOrder,
  type Regiment,
  type RegimentId,
} from "@/core/state.js";
import { ARMY_RULES, UNITS, type UnitType, regimentSize } from "@/data/units.js";
import { placeNewArmy, regimentCost } from "@/systems/armies.js";

/**
 * Each city has a recruitment queue shared by training and retraining. Orders
 * are paid for in gold when queued. At the end of its owner's turn, a city
 * that isn't besieged retrains every regiment queued for it, and trains one
 * new regiment: what's queued for retraining is always ready next turn, and
 * new regiments come one a turn.
 */

const fmt = (n: number) => n.toLocaleString("en-US");

/** Gold to bring a regiment back to full strength. */
export function retrainCost(regiment: Regiment): number {
  return (regimentSize(regiment.unit) - regiment.soldiers) * UNITS[regiment.unit].goldPerSoldier;
}

function queueCheck(state: GameState, factionId: FactionId, cityId: CityId, orders: number, gold: number): Check {
  const city = state.cities[cityId];
  const faction = getFaction(state, factionId);
  if (!city || !faction || city.owner !== factionId) return { ok: false, reason: "That city isn't yours." };
  if (city.besiegedBy) return { ok: false, reason: `${city.name} is besieged and can't recruit.` };
  if (city.recruitQueue.length + orders > ARMY_RULES.recruitQueueSize) {
    return { ok: false, reason: `${city.name}'s recruitment queue is full (${ARMY_RULES.recruitQueueSize} orders).` };
  }
  if (faction.gold < gold) return { ok: false, reason: `Costs ${fmt(gold)} gold. You have ${fmt(faction.gold)}.` };
  return { ok: true };
}

/** Whether a regiment of a unit type can be queued for training in a city. */
export function canTrain(state: GameState, factionId: FactionId, cityId: CityId, unit: UnitType): Check {
  const check = queueCheck(state, factionId, cityId, 1, regimentCost(unit).gold);
  if (!check.ok) return check;
  const city = state.cities[cityId];

  // Room in the army there, counting regiments already queued for training.
  const stationed = armyAt(state, city.tile);
  const queuedTraining = city.recruitQueue.filter((o) => o.kind === "train").length;
  if ((stationed?.owner === factionId ? stationed.regiments.length : 0) + queuedTraining >= ARMY_RULES.maxRegiments) {
    return { ok: false, reason: `The army in ${city.name} would have more than ${ARMY_RULES.maxRegiments} regiments. Move some out first.` };
  }
  // People to spare, counting everyone already queued.
  const spare = city.population - ARMY_RULES.minCityPopulation - queuedPeople(city);
  if (spare < regimentSize(unit) * ARMY_RULES.populationPerSoldier) {
    return { ok: false, reason: `${city.name} can't spare another ${fmt(regimentSize(unit))} people.` };
  }
  return { ok: true };
}

/** Pays for a regiment and queues it. Call canTrain first. */
export function queueTraining(state: GameState, factionId: FactionId, cityId: CityId, unit: UnitType): GameState {
  const cost = regimentCost(unit).gold;
  return addOrders(state, factionId, cityId, [{ kind: "train", unit, cost }], cost);
}

/**
 * Whether regiments in the army standing in a city can be queued for
 * retraining: damaged, not already queued, and paid for.
 */
export function canRetrain(state: GameState, factionId: FactionId, cityId: CityId, regimentIds: readonly RegimentId[]): Check {
  const city = state.cities[cityId];
  if (!city) return { ok: false, reason: "No such city." };
  if (regimentIds.length === 0) return { ok: false, reason: "Choose which regiments to retrain." };
  const army = armyAt(state, city.tile);
  if (!army || army.owner !== factionId) return { ok: false, reason: `You have no army in ${city.name}.` };
  const regiments = regimentIds.map((id) => army.regiments.find((r) => r.id === id));
  if (regiments.some((r) => !r)) return { ok: false, reason: "Those regiments aren't in the city." };
  if (regiments.some((r) => r!.soldiers >= regimentSize(r!.unit))) return { ok: false, reason: "That regiment is already at full strength." };
  const queued = new Set(city.recruitQueue.flatMap((o) => (o.kind === "retrain" ? [o.regimentId] : [])));
  if (regiments.some((r) => queued.has(r!.id))) return { ok: false, reason: "That regiment is already queued for retraining." };
  const gold = regiments.reduce((sum, r) => sum + retrainCost(r!), 0);
  return queueCheck(state, factionId, cityId, regiments.length, gold);
}

/** Pays for retraining regiments and queues them, one order each. Call canRetrain first. */
export function queueRetraining(state: GameState, factionId: FactionId, cityId: CityId, regimentIds: readonly RegimentId[]): GameState {
  const army = armyAt(state, state.cities[cityId].tile)!;
  const orders: RecruitOrder[] = regimentIds.map((id) => {
    const r = army.regiments.find((x) => x.id === id)!;
    return { kind: "retrain", unit: r.unit, regimentId: r.id, soldiers: regimentSize(r.unit) - r.soldiers, cost: retrainCost(r) };
  });
  return addOrders(state, factionId, cityId, orders, orders.reduce((sum, o) => sum + o.cost, 0));
}

/** Removes an order from a city's queue and refunds it. */
export function cancelRecruitOrder(state: GameState, factionId: FactionId, cityId: CityId, index: number): GameState {
  const city = state.cities[cityId];
  const order = city.recruitQueue[index];
  const next = updateFaction(state, factionId, (f) => ({ ...f, gold: f.gold + order.cost }));
  return setCity(next, { ...city, recruitQueue: city.recruitQueue.filter((_, i) => i !== index) });
}

/**
 * At the end of a faction's turn, each of its cities that isn't besieged
 * works through its queue:
 *
 * - **Every** retraining order is completed at once, wherever it sits in the
 *   queue: each regiment is back at full strength next turn. An order for a
 *   regiment that has left the city (or been lost) is dropped and refunded;
 *   one the city hasn't the people for yet waits for a later turn.
 * - **One** training order, the first in the queue: a new regiment joins the
 *   army in the city. If the city can't fill it yet (not enough people, or no
 *   room in the army), it waits, and the training behind it waits too.
 */
export function processRecruitment(state: GameState, factionId: FactionId): GameState {
  let next = state;
  for (const original of citiesOf(state, factionId)) {
    if (next.cities[original.id].besiegedBy) continue;
    next = retrainAll(next, factionId, original.id);
    next = trainNext(next, factionId, original.id);
  }
  return next;
}

/** Completes every retraining order in a city's queue that it can. */
function retrainAll(state: GameState, factionId: FactionId, cityId: CityId): GameState {
  let next = state;
  let city = next.cities[cityId];
  const kept: RecruitOrder[] = [];
  for (const order of city.recruitQueue) {
    if (order.kind !== "retrain") {
      kept.push(order);
      continue;
    }
    const army = armyAt(next, city.tile);
    const own = army && army.owner === factionId ? army : undefined;
    const regiment = own?.regiments.find((r) => r.id === order.regimentId);
    if (!regiment || regiment.soldiers >= regimentSize(regiment.unit)) {
      // Gone from the city, or already whole: refund it.
      next = updateFaction(next, factionId, (f) => ({ ...f, gold: f.gold + order.cost }));
      continue;
    }
    const needed = (regimentSize(regiment.unit) - regiment.soldiers) * ARMY_RULES.populationPerSoldier;
    if (city.population - ARMY_RULES.minCityPopulation < needed) {
      kept.push(order); // not enough people yet: try again next turn
      continue;
    }
    city = { ...city, population: city.population - needed };
    next = setCity(next, city);
    next = {
      ...next,
      armies: {
        ...next.armies,
        [own!.id]: {
          ...own!,
          regiments: own!.regiments.map((r) => (r.id === regiment.id ? { ...r, soldiers: regimentSize(r.unit) } : r)),
        },
      },
    };
    next = addLog(next, `${city.name} retrained a regiment of ${UNITS[order.unit].name} to full strength.`, {
      kind: "recruitment",
      factions: [factionId],
    });
  }
  return setCity(next, { ...next.cities[cityId], recruitQueue: kept });
}

/** Completes the first training order in a city's queue, if it can. */
function trainNext(state: GameState, factionId: FactionId, cityId: CityId): GameState {
  let next = state;
  const city = next.cities[cityId];
  const index = city.recruitQueue.findIndex((o) => o.kind === "train");
  if (index === -1) return next;
  const order = city.recruitQueue[index];

  const army = armyAt(next, city.tile);
  const own = army && army.owner === factionId ? army : undefined;
  const needed = regimentSize(order.unit) * ARMY_RULES.populationPerSoldier;
  if (city.population - ARMY_RULES.minCityPopulation < needed) return next;
  if (own && own.regiments.length >= ARMY_RULES.maxRegiments) return next;

  next = setCity(next, {
    ...city,
    population: city.population - needed,
    recruitQueue: city.recruitQueue.filter((_, i) => i !== index),
  });
  const regiment: Regiment = {
    id: `reg${next.nextRegimentNumber}`,
    unit: order.unit,
    soldiers: regimentSize(order.unit),
    movementLeft: 0,
    fresh: false,
    pinned: false,
  };
  next = { ...next, nextRegimentNumber: next.nextRegimentNumber + 1 };
  next = addLog(next, `${city.name} trained a regiment of ${UNITS[order.unit].name}.`, {
    kind: "recruitment",
    factions: [factionId],
  });
  return own
    ? { ...next, armies: { ...next.armies, [own.id]: { ...own, regiments: [...own.regiments, regiment] } } }
    : placeNewArmy(next, factionId, city.tile, [regiment]);
}

/**
 * Removes retraining orders for regiments no longer in their city's army
 * (they marched out, or were lost), refunding each. Runs after every action,
 * so the queue never holds a regiment that has gone.
 */
export function dropStrayRetraining(state: GameState): GameState {
  let next = state;
  for (const city of Object.values(state.cities)) {
    if (!city.recruitQueue.some((o) => o.kind === "retrain")) continue;
    const army = armyAt(next, city.tile);
    const present = new Set(army && army.owner === city.owner ? army.regiments.map((r) => r.id) : []);
    const stray = city.recruitQueue.filter((o) => o.kind === "retrain" && !present.has(o.regimentId));
    if (stray.length === 0) continue;
    const refund = stray.reduce((sum, o) => sum + o.cost, 0);
    next = updateFaction(next, city.owner, (f) => ({ ...f, gold: f.gold + refund }));
    next = setCity(next, { ...next.cities[city.id], recruitQueue: city.recruitQueue.filter((o) => !stray.includes(o)) });
  }
  return next;
}

/** People the orders in a city's queue will take when they're completed. */
export function queuedPeople(city: City): number {
  return city.recruitQueue.reduce(
    (sum, o) => sum + (o.kind === "train" ? regimentSize(o.unit) : o.soldiers) * ARMY_RULES.populationPerSoldier,
    0,
  );
}

function addOrders(state: GameState, factionId: FactionId, cityId: CityId, orders: RecruitOrder[], gold: number): GameState {
  const city = state.cities[cityId];
  const next = updateFaction(state, factionId, (f) => ({ ...f, gold: f.gold - gold }));
  return setCity(next, { ...city, recruitQueue: [...city.recruitQueue, ...orders] });
}

function setCity(state: GameState, city: City): GameState {
  return { ...state, cities: { ...state.cities, [city.id]: city } };
}
