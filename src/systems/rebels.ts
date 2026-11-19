/**
 * Rebels (numbers in data/rebels.ts): the holder of every city whose people
 * beat its garrison in a revolt (systems/order.ts). They take no turns; their
 * cities are frozen, and slowly raise militia until someone retakes them.
 */
import { armyAt, citiesOf, type City, type GameState, type Regiment } from "@/core/state.js";
import { ORDER } from "@/data/order.js";
import { REBELS } from "@/data/rebels.js";
import { regimentSize } from "@/data/units.js";
import { placeNewArmy } from "@/systems/armies.js";

/** Rebel militia regiments a city's people raise in a revolt: also the most a rebel city holds. */
export function rebelRegiments(population: number): number {
  const { peoplePerRegiment, maxRegiments } = ORDER.rebels;
  return Math.max(1, Math.min(maxRegiments, Math.floor(population / peoplePerRegiment)));
}

/** New regiments of full-strength rebel militia. */
export function rebelMilitia(state: GameState, count: number): { state: GameState; regiments: Regiment[] } {
  const regiments: Regiment[] = Array.from({ length: count }, (_, i) => ({
    id: `reg${state.nextRegimentNumber + i}`,
    unit: "militia",
    tier: 1,
    soldiers: regimentSize("militia"),
    experience: 0,
    movementLeft: 0,
    pinned: false,
  }));
  return { state: { ...state, nextRegimentNumber: state.nextRegimentNumber + count }, regiments };
}

/**
 * Each new round: every rebel city whose revolt was a multiple of
 * REBELS.raiseEvery turns ago, and whose garrison is below the size of its
 * revolt, raises a regiment of militia. It costs them nothing.
 */
export function raiseRebelMilitia(state: GameState): GameState {
  let next = state;
  for (const city of citiesOf(state, REBELS.id)) {
    if (!raisesThisTurn(state, city)) continue;
    const garrison = armyAt(next, city.tile);
    if (garrison && garrison.owner !== REBELS.id) continue;
    if ((garrison?.regiments.length ?? 0) >= rebelRegiments(city.population)) continue;
    const raised = rebelMilitia(next, 1);
    next = raised.state;
    next = garrison
      ? { ...next, armies: { ...next.armies, [garrison.id]: { ...garrison, regiments: [...garrison.regiments, ...raised.regiments] } } }
      : placeNewArmy(next, REBELS.id, city.tile, raised.regiments);
  }
  return next;
}

/** Whether a rebel city raises militia this turn: every REBELS.raiseEvery turns since its revolt. */
function raisesThisTurn(state: GameState, city: City): boolean {
  if (city.conqueredOn === null) return false;
  const since = state.turn - city.conqueredOn;
  return since > 0 && since % REBELS.raiseEvery === 0;
}
