/**
 * Seeded random number generator (mulberry32).
 *
 * All game randomness goes through this so that a given seed always produces
 * the same battles. Never use Math.random() in game
 * logic.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Internal state. Store it in the game state to resume the same sequence later. */
  readonly state: number;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;

  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    get state() {
      return a;
    },
  };
}

/** A fresh seed for starting a new game. The only place Math.random() is allowed. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}
