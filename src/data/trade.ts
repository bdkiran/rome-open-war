/**
 * Trade between a faction's own cities. A route joins two cities of the same
 * owner and needs the building at both ends: roads in both for a land route
 * (their land must border), ports in both for a sea route (within the ports'
 * sailing range). A route runs at the lower of the two cities' levels and
 * pays each end gold for every 1,000 people at the other end, so trading
 * with a big city pays more. Cities joined by a road trade only by land.
 * The market multiplies trade gold more than the rest of a city's income.
 */
export const TRADE = {
  /** Gold per 1,000 people in the partner city, by a land route's level (index = road level; 0 = no route). */
  roadGoldPer1000: [0, 0.4, 0.7, 1],
  /** Gold per 1,000 people in the partner city, by a sea route's level (index = port level). */
  seaGoldPer1000: [0, 0.4, 0.7, 1],
  /** Steps over the sea a route can span, by its level (index = port level). */
  seaRange: [0, 6, 16, 40],
  /** Extra trade gold from the market (index = market level): +50% with a market square. */
  marketTrade: [0, 0.5, 1, 1.5],
} as const;
