import {
  addLog,
  armiesOf,
  armyAt,
  cityAt,
  getFaction,
  type Army,
  type ArmyId,
  type Check,
  type City,
  type FactionId,
  type GameState,
  type Regiment,
} from "@/core/state.js";
import { ARMY_RULES, MERCENARIES, UNITS, regimentSize, type UnitType } from "@/data/units.js";
import type { TileId } from "@/map/topology.js";
import { mercenaryCost, placeNewArmy } from "@/systems/armies.js";

/**
 * Mercenaries: gold turned into regiments at once, out in the land. Every
 * city's territory has soldiers for hire, whoever owns it. An army standing
 * there (or an empty city of yours) hires basic regiments of any unit from
 * them, and tops up its damaged mercenary regiments from them. Each hire
 * drains the territory's supply, which refills a little every round. Hired
 * regiments take no people and skip the recruitment queue, but cost twice as
 * much to hire and keep, and can't move on the turn they're hired.
 */

const fmt = (n: number) => n.toLocaleString("en-US");

/** The city whose territory a tile is in, if any. Its supply is the one hired from there. */
export function territoryOf(state: GameState, tile: TileId): City | undefined {
  const cityId = state.regions[tile];
  return cityId ? state.cities[cityId] : undefined;
}

/**
 * Whether a regiment of mercenaries can be hired on a tile now: it's in a
 * territory with enough soldiers for hire, our army stands there (or it's our
 * own city), it isn't a besieged city, the army has room, and we have the gold
 * (so never in debt). Any unit, always basic.
 */
export function canHire(state: GameState, factionId: FactionId, tile: TileId, unit: UnitType): Check {
  const faction = getFaction(state, factionId);
  if (!faction) return { ok: false, reason: "No such faction." };
  const territory = territoryOf(state, tile);
  if (!territory) return { ok: false, reason: "Mercenaries are hired in a city's territory." };
  const army = armyAt(state, tile);
  const city = cityAt(state, tile);
  if (army && army.owner !== factionId) return { ok: false, reason: "That army isn't yours." };
  if (!army && city?.owner !== factionId) return { ok: false, reason: "Mercenaries join an army. You have none here." };
  if (city?.besiegedBy) return { ok: false, reason: `${city.name} is besieged and can't hire.` };
  const size = regimentSize(unit);
  if (territory.mercenarySupply < size) {
    return {
      ok: false,
      reason: `Only ${fmt(territory.mercenarySupply)} mercenaries for hire around ${territory.name}. A regiment of ${UNITS[unit].name.toLowerCase()} is ${size}.`,
    };
  }
  const queuedTraining = city?.owner === factionId ? city.recruitQueue.filter((o) => o.kind === "train").length : 0;
  if ((army?.regiments.length ?? 0) + queuedTraining >= ARMY_RULES.maxRegiments) {
    return { ok: false, reason: `The army would have more than ${ARMY_RULES.maxRegiments} regiments.` };
  }
  const gold = mercenaryCost(unit);
  if (faction.gold < gold) return { ok: false, reason: `Costs ${fmt(gold)} gold. You have ${fmt(faction.gold)}.` };
  return { ok: true };
}

/**
 * Pays for a regiment of mercenaries from the territory's supply. It joins the
 * army on the tile (or forms one in our empty city) at once, with no movement
 * left. Call canHire first.
 */
export function hire(state: GameState, factionId: FactionId, tile: TileId, unit: UnitType): GameState {
  const territory = territoryOf(state, tile)!;
  const gold = mercenaryCost(unit);
  const regiment: Regiment = {
    id: `reg${state.nextRegimentNumber}`,
    unit,
    tier: 1,
    soldiers: regimentSize(unit),
    experience: 0,
    movementLeft: 0,
    pinned: false,
    mercenary: true,
  };
  let next: GameState = {
    ...state,
    nextRegimentNumber: state.nextRegimentNumber + 1,
    factions: state.factions.map((f) => (f.id === factionId ? { ...f, gold: f.gold - gold } : f)),
    cities: { ...state.cities, [territory.id]: { ...territory, mercenarySupply: territory.mercenarySupply - regiment.soldiers } },
  };
  const army = armyAt(next, tile);
  next = army
    ? { ...next, armies: { ...next.armies, [army.id]: { ...army, regiments: [...army.regiments, regiment] } } }
    : placeNewArmy(next, factionId, tile, [regiment]);
  return addLog(next, `Hired a regiment of ${UNITS[unit].name.toLowerCase()} mercenaries around ${territory.name}.`, {
    kind: "recruitment",
    factions: [factionId],
  });
}

/** What topping up an army's mercenaries would take: soldiers added to each damaged mercenary regiment, in order, as far as the supply goes. */
export interface TopUp {
  regiments: { id: string; soldiers: number }[];
  soldiers: number;
  gold: number;
}

/** The top-up an army could have where it stands: its damaged mercenary regiments, filled from the territory's supply in order. */
export function topUpPlan(state: GameState, army: Army): TopUp {
  let supply = territoryOf(state, army.tile)?.mercenarySupply ?? 0;
  const plan: TopUp = { regiments: [], soldiers: 0, gold: 0 };
  for (const r of army.regiments) {
    const missing = Math.min(regimentSize(r.unit) - r.soldiers, supply);
    if (!r.mercenary || missing <= 0) continue;
    plan.regiments.push({ id: r.id, soldiers: missing });
    plan.soldiers += missing;
    plan.gold += mercenaryCost(r.unit, missing);
    supply -= missing;
  }
  return plan;
}

/**
 * Whether an army can top up its mercenaries now: it's ours, has damaged
 * mercenary regiments, stands in a territory with mercenaries for hire, isn't
 * shut in a besieged city, and we have the gold.
 */
export function canTopUp(state: GameState, factionId: FactionId, armyId: ArmyId): Check {
  const army = state.armies[armyId];
  const faction = getFaction(state, factionId);
  if (!army || !faction || army.owner !== factionId) return { ok: false, reason: "That army isn't yours." };
  if (!army.regiments.some((r) => r.mercenary && r.soldiers < regimentSize(r.unit))) {
    return { ok: false, reason: "No mercenaries here need topping up." };
  }
  const territory = territoryOf(state, army.tile);
  if (!territory) return { ok: false, reason: "Mercenaries are hired in a city's territory." };
  if (cityAt(state, army.tile)?.besiegedBy) return { ok: false, reason: "Besieged: no mercenaries can reach the city." };
  if (territory.mercenarySupply === 0) return { ok: false, reason: `No mercenaries left for hire around ${territory.name}.` };
  const { gold } = topUpPlan(state, army);
  if (faction.gold < gold) return { ok: false, reason: `Costs ${fmt(gold)} gold. You have ${fmt(faction.gold)}.` };
  return { ok: true };
}

/** Fills the army's damaged mercenary regiments from the territory's supply, at once. Call canTopUp first. */
export function topUp(state: GameState, factionId: FactionId, armyId: ArmyId): GameState {
  const army = state.armies[armyId];
  const territory = territoryOf(state, army.tile)!;
  const plan = topUpPlan(state, army);
  const added = new Map(plan.regiments.map((r) => [r.id, r.soldiers]));
  const regiments = army.regiments.map((r) => (added.has(r.id) ? { ...r, soldiers: r.soldiers + added.get(r.id)! } : r));
  const next: GameState = {
    ...state,
    factions: state.factions.map((f) => (f.id === factionId ? { ...f, gold: f.gold - plan.gold } : f)),
    cities: { ...state.cities, [territory.id]: { ...territory, mercenarySupply: territory.mercenarySupply - plan.soldiers } },
    armies: { ...state.armies, [army.id]: { ...army, regiments } },
  };
  return addLog(next, `Hired ${fmt(plan.soldiers)} mercenaries around ${territory.name} to fill the ranks.`, {
    kind: "recruitment",
    factions: [factionId],
  });
}

/** Once a round, every territory's supply of mercenaries grows back a little, up to its full size. */
export function refillMercenaries(state: GameState): GameState {
  const short = Object.values(state.cities).filter((c) => c.mercenarySupply < MERCENARIES.supply);
  if (short.length === 0) return state;
  const refilled = short.map((c) => [c.id, { ...c, mercenarySupply: Math.min(MERCENARIES.supply, c.mercenarySupply + MERCENARIES.refillPerTurn) }]);
  return { ...state, cities: { ...state.cities, ...Object.fromEntries(refilled) } };
}

/** Mercenary regiments a faction has in the field. */
export function mercenaryRegiments(state: GameState, factionId: FactionId): number {
  return armiesOf(state, factionId).reduce((n, a) => n + a.regiments.filter((r) => r.mercenary).length, 0);
}
