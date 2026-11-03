/** How far each faction can see. Beyond this, enemy armies are hidden. */
export const VISION = {
  /** Tiles a city can see around it. All of a faction's own territory is always visible too. */
  city: 3,
  /** Tiles an army can see around it... */
  army: 2,
  /** ...or this many if it includes any cavalry. */
  armyWithCavalry: 3,
  /** Tiles a watchtower sees around it (data/watchtowers.ts). */
  watchtower: 3,
} as const;
