/** Battle numbers. See systems/combat.ts for how they're used. */
export const COMBAT = {
  /**
   * Strength multiplier for the side whose unit type beats the other's.
   * Only the side with the advantage is changed, so this is the whole swing:
   * 1.5 means a regiment fights like 150 against the type it beats.
   */
  advantage: 1.5,
  /**
   * Strength multiplier for the side whose unit type loses to the other's.
   * 1 leaves it unchanged. Setting it below 1 as well would count the
   * matchup twice (advantage 2 with disadvantage 0.5 is a 4x swing).
   */
  disadvantage: 1,
  /**
   * Extra defense for an army defending a city: 0.1 means +10%. Walls
   * (data/buildings.ts) and the terrain bonus are added on top.
   */
  cityDefenseBonus: 0.1,
  /** Each side's strength is multiplied by a random factor within ± this amount. */
  randomness: 0.15,
  /**
   * The winner loses this share of its soldiers, scaled by how close the fight
   * was. A 2-to-1 win costs half of this; a narrow win costs nearly all of it.
   */
  winnerLossRate: 0.6,
} as const;
