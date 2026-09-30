/** Siege numbers. See systems/siege.ts. */
export const SIEGE = {
  /**
   * Turns a besieged city can hold out, by its level (index = level). When
   * its supplies run out, it surrenders.
   */
  supplyTurnsByLevel: [0, 3, 4, 5],
  /** Capitals are better stocked: this many more turns. */
  capitalExtraTurns: 1,
  /** Supplies a city regains each turn when not besieged, up to its maximum. */
  restockPerTurn: 1,
  /** From the first turn of a siege, the garrison loses this share of its soldiers each turn... */
  garrisonAttrition: 0.05,
  /** ...and the city this share of its people. */
  populationAttrition: 0.01,
} as const;
