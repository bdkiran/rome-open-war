/**
 * Public order: how content a city's people are with its owner. Each city
 * has an order from 0 to 100 that moves each turn toward a target worked out
 * from its situation (systems/order.ts). Low order costs gold and growth,
 * stops training, and below `revoltBelow` the people rise.
 */
import type { TaxRate } from "@/data/economy.js";

export type OrderBand = "content" | "restless" | "unrest";

export const ORDER = {
  /** The target before anything pushes it, and a new city's order. */
  base: 60,
  /** Points order moves toward its target each turn. */
  step: 10,
  /** A city's order the moment it's captured. */
  afterCapture: 30,

  /** Change to the target for each tax rate. */
  taxes: { low: 15, normal: 0, high: -20 } as Record<TaxRate, number>,
  /** Change to the target in the capital. */
  capital: 10,
  /** Change to the target right after a city is conquered, whatever its fate... */
  conquered: -30,
  /** ...fading evenly to nothing over this many turns. */
  conquestFadeTurns: 20,
  /** Change to the target while the city is besieged. */
  siege: -15,
  /**
   * Distance from the capital: so many points per so many tiles beyond the
   * free radius, at most `max`. The capital itself pays nothing.
   */
  distance: { free: 10, tilesPerPoint: 2, max: -20 },
  /**
   * The garrison: points for each 1% of the city's people who are soldiers
   * in the army standing in it. No cap: one army per tile is the limit, so
   * the largest cities can't be held by soldiers alone.
   */
  garrisonPerPercent: 4,

  /** The lowest order of each band; below `unrest` the city revolts. */
  bands: { content: 50, restless: 30, unrest: 10 },
  /** What each band does to the city's gold and growth. Training stops in Unrest. */
  effects: {
    content: { gold: 1, growth: 1 },
    restless: { gold: 0.8, growth: 0.75 },
    unrest: { gold: 0.5, growth: 0 },
  } as Record<OrderBand, { gold: number; growth: number }>,

  /** A city whose order is below this at the end of its owner's turn revolts. */
  revoltBelow: 10,
  /** Rebels: one militia regiment per so many people, at most `maxRegiments` (at least one). */
  rebels: { peoplePerRegiment: 2000, maxRegiments: 5 },
  /** Order after a revolt the garrison put down. */
  afterRevolt: 30,
};

/** The band a city's order puts it in. A city in Unrest below `revoltBelow` is about to revolt. */
export function orderBand(order: number): OrderBand {
  if (order >= ORDER.bands.content) return "content";
  if (order >= ORDER.bands.restless) return "restless";
  return "unrest";
}

/** Display names of the bands. */
export const ORDER_BAND_NAMES: Record<OrderBand, string> = { content: "Content", restless: "Restless", unrest: "Unrest" };
