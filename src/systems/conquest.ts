import {
  addLog,
  citiesOf,
  getFaction,
  updateFaction,
  type Check,
  type City,
  type CityId,
  type FactionId,
  type GameState,
} from "@/core/state.js";
import { LOOT_PER_LEVEL, SETTLEMENT, type SettlementChoice } from "@/data/conquest.js";
import { cityLevel } from "@/systems/buildings.js";

const fmt = (n: number) => n.toLocaleString("en-US");

export interface SettlementOutcome {
  gold: number;
  /** People sent to the conqueror's other cities. */
  moved: number;
  /** People killed or lost on the march. */
  lost: number;
}

/** What each choice would bring, for a city as it stands now. */
export function settlementOutcome(state: GameState, city: City, choice: SettlementChoice): SettlementOutcome {
  const def = SETTLEMENT[choice];
  const levelBonus = 1 + LOOT_PER_LEVEL * (cityLevel(city) - 1);
  const others = citiesOf(state, city.owner).filter((c) => c.id !== city.id);
  // With nowhere to send them, the enslaved are lost too.
  const moved = others.length > 0 ? Math.round(city.population * def.moved) : 0;
  const lost = Math.round(city.population * def.lost) + (others.length > 0 ? 0 : Math.round(city.population * def.moved));
  return { gold: Math.round((city.population / 1000) * def.goldPer1000 * levelBonus), moved, lost };
}

/** Cities a faction has taken whose fate it hasn't decided yet. */
export function unsettledCities(state: GameState, factionId: FactionId): City[] {
  return citiesOf(state, factionId).filter((c) => c.unsettled);
}

export function canSettle(state: GameState, factionId: FactionId, cityId: CityId): Check {
  const city = state.cities[cityId];
  if (!city || city.owner !== factionId) return { ok: false, reason: "That city isn't yours." };
  if (!city.unsettled) return { ok: false, reason: `${city.name}'s fate has already been decided.` };
  return { ok: true };
}

/**
 * Decides a captured city's fate: its conqueror takes the plunder, and the
 * city loses the people killed or carried off. The enslaved are shared out
 * evenly among the conqueror's other cities. Call canSettle first.
 */
export function settleCity(state: GameState, factionId: FactionId, cityId: CityId, choice: SettlementChoice): GameState {
  const city = state.cities[cityId];
  const outcome = settlementOutcome(state, city, choice);
  const cities = { ...state.cities };
  cities[cityId] = { ...city, unsettled: false, population: Math.max(1, city.population - outcome.moved - outcome.lost) };

  const others = citiesOf(state, factionId).filter((c) => c.id !== cityId);
  others.forEach((other, i) => {
    const share = Math.floor(outcome.moved / others.length) + (i < outcome.moved % others.length ? 1 : 0);
    cities[other.id] = { ...other, population: other.population + share };
  });

  let next = updateFaction({ ...state, cities }, factionId, (f) => ({ ...f, gold: f.gold + outcome.gold }));
  const name = getFaction(state, factionId)?.shortName ?? "Unknown";
  const text =
    choice === "occupy"
      ? `${name} occupied ${city.name}, taking ${fmt(outcome.gold)} gold in tribute.`
      : choice === "enslave"
        ? `${name} enslaved ${city.name}, carrying off ${fmt(outcome.moved)} people and ${fmt(outcome.gold)} gold.`
        : `${name} put ${city.name} to the sword: ${fmt(outcome.lost)} dead, ${fmt(outcome.gold)} gold plundered.`;
  next = addLog(next, text, { kind: "city", factions: [factionId] });
  return next;
}
