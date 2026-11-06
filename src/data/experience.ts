/**
 * Regiments that survive battles gain experience, which raises their level.
 * Each level adds the same flat bonus to attack and armor for every unit, so
 * it's worth most to the weakest soldiers. See systems/combat.ts.
 */
export const EXPERIENCE = {
  /** Attack and armor each level adds, on top of the tier's multiplier. */
  attackPerLevel: 5,
  armorPerLevel: 5,
  /** Points needed for levels 1, 2, 3...; the last is the top level and the most a regiment can hold. */
  levels: [2, 3, 6, 8, 13, 17],
  /** Points for each surviving regiment on the side that won. */
  win: 2,
  /** Points for each surviving regiment on the side that lost. */
  loss: 1,
  /**
   * No points if the enemy brought fewer than this share of your side's
   * soldiers: most battles are chases of fleeing remnants, which teach nothing.
   */
  minEnemyShare: 0.25,
} as const;

/** The top level a regiment can reach. */
export const MAX_EXPERIENCE_LEVEL = EXPERIENCE.levels.length;

/** The most experience points a regiment can hold. */
export const MAX_EXPERIENCE = EXPERIENCE.levels[EXPERIENCE.levels.length - 1];

/** A regiment's level, 0 to MAX_EXPERIENCE_LEVEL, from its experience points. */
export function experienceLevel(points: number): number {
  return EXPERIENCE.levels.filter((needed) => points >= needed).length;
}
