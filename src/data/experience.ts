/**
 * Regiments gain experience from the enemy soldiers they kill, which raises
 * their level.
 * Each level adds the same flat bonus to attack and armor for every unit, so
 * it's worth most to the weakest soldiers. See systems/combat.ts.
 */
export const EXPERIENCE = {
  /** Attack and armor each level adds, on top of the tier's multiplier. */
  attackPerLevel: 5,
  armorPerLevel: 5,
  /** Points needed for levels 1, 2, 3...; the last is the top level and the most a regiment can hold. */
  levels: [2, 3, 6, 8, 13, 17],
  /**
   * Enemy soldiers a regiment must kill for each point, won or lost, rounded:
   * its own kills in the battle, plus its share of the rout if its side won
   * (horsemen ride down the fleeing). See gainExperience in systems/combat.ts.
   */
  killsPerPoint: 15,
} as const;

/** The top level a regiment can reach. */
export const MAX_EXPERIENCE_LEVEL = EXPERIENCE.levels.length;

/** The most experience points a regiment can hold. */
export const MAX_EXPERIENCE = EXPERIENCE.levels[EXPERIENCE.levels.length - 1];

/** A regiment's level, 0 to MAX_EXPERIENCE_LEVEL, from its experience points. */
export function experienceLevel(points: number): number {
  return EXPERIENCE.levels.filter((needed) => points >= needed).length;
}
