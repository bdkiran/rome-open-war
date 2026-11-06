/** Siege numbers. See systems/siege.ts. */
export const SIEGE = {
  /**
   * Full turns a besieged city can hold out, by its level (index = level). When
   * its supplies run out, it surrenders.
   */
  supplyTurnsByLevel: [0, 3, 4, 5],
  /** Capitals are better stocked: this many more turns. */
  capitalExtraTurns: 1,
  /** From the first full turn of a siege, the garrison loses this share of its soldiers each turn... */
  garrisonAttrition: 0.05,
  /** ...and the city this share of its people. */
  populationAttrition: 0.01,
  /**
   * Siege works: a garrisoned walled city can't be stormed until its besieger
   * has as many whole points of works as the walls' level (see systems/siege.ts).
   * Soldiers next to the city build this many points a turn each, as a fraction.
   */
  worksPerSoldier: 1 / 500,
  /** Horsemen are poor at carpentry: each counts as this share of a soldier. */
  mountedWorkShare: 0.5,
  maxWorks: 5,
  /** Each whole point of works takes this share off the bonus of the walls, so 5 points leave none. */
  wallWeakeningPerWork: 0.2,
  /** What each whole point of works looks like (index = points). */
  worksSteps: ["no siege works", "ladders", "rams", "a siege tower", "two siege towers", "full siege works"],
} as const;
