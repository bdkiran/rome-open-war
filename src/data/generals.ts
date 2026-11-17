import type { Culture } from "@/data/cultures.js";

/**
 * Generals: named commanders who ride with an army in a bodyguard regiment of
 * their own (UNITS.bodyguard in data/units.ts). An army without one gains one
 * by winning a battle that counts; he learns traits by winning more, and may die
 * in battle by chance, or when his bodyguard is cut down. See systems/generals.ts.
 */
export type GeneralTrait = "fierce" | "stubborn" | "swift" | "besieger" | "drillmaster" | "wary";

export const GENERAL_TRAITS: readonly GeneralTrait[] = ["fierce", "stubborn", "swift", "besieger", "drillmaster", "wary"];

export const GENERALS = {
  /** Riders in a full bodyguard, the most it can hold. */
  bodyguardSize: 60,
  /** Riders a bodyguard gets back at the start of each of its owner's turns, free, anywhere. */
  bodyguardRefill: 6,
  /** Gold a turn to keep a general and his bodyguard, whatever its strength. */
  wages: 6,
  /** The most generals a faction can have, for each city it holds. */
  perCity: 1,
  /**
   * Chance that a winning army without a general gains one in an even fight,
   * while every general slot its faction has is free. It's scaled by the
   * share of slots still free, then by the odds (see grantChance in
   * systems/generals.ts): beating a weaker enemy gives `grantFloor` of it up
   * to all of it, and winning against the odds climbs to a certainty.
   */
  grantChance: 0.7,
  /** The share of the grant chance even a win over a much weaker enemy earns. */
  grantFloor: 0.5,
  /**
   * A beaten enemy weaker than this share of the winners' strength earns
   * nothing: stragglers don't make generals. Above 0.1, since battle strengths
   * are capped at ten to one.
   */
  minFoe: 0.15,
  /** Winning against an enemy this many times your strength makes a general for certain (while a slot is free). */
  underdogFullAt: 1.5,
  /** Chance that a general learns a trait he doesn't have when his side wins, times the odds (at most 1). */
  traitChance: 0.25,
  /**
   * Chance that a general who fights in a battle, won or lost, is killed in
   * it, and his bodyguard with him. He also dies if his bodyguard is cut down.
   */
  deathChance: 0.05,
  /** Fierce: his army's melee blows deal this much more, e.g. 0.15 = +15%. */
  fierce: 0.15,
  /** Stubborn: his army takes this much less when it defends. */
  stubborn: 0.15,
  /** Swift: movement points added to each of his army's regiments every turn, never above `swiftCap`. */
  swift: 3,
  swiftCap: 16,
  /** Besieger: when his army storms a city, the walls' bonus is this much lower (never below 0). */
  besieger: 0.15,
  /** Drillmaster: extra experience points for his army's regiments in a battle that counts. */
  drillmaster: 1,
  /** Wary: his beaten army loses this share of the usual losses while it flees. */
  wary: 0.6,
} as const;

/** Each trait's name, and what it does in a few words (for the army card's tooltips). */
export const TRAIT_INFO: Record<GeneralTrait, { name: string; effect: string }> = {
  fierce: { name: "Fierce", effect: `His army deals ${pct(GENERALS.fierce)} more in melee.` },
  stubborn: { name: "Stubborn", effect: `His army takes ${pct(GENERALS.stubborn)} less when defending.` },
  swift: { name: "Swift", effect: `His army moves ${GENERALS.swift} points further a turn (at most ${GENERALS.swiftCap}).` },
  besieger: { name: "Besieger", effect: `Walls count ${pct(GENERALS.besieger)} less when his army storms a city.` },
  drillmaster: { name: "Drillmaster", effect: `His regiments gain ${GENERALS.drillmaster} more experience from a battle.` },
  wary: { name: "Wary", effect: `His army loses ${pct(1 - GENERALS.wary)} fewer men when it flees.` },
};

function pct(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/** Names a new general is picked from, by his faction's culture. */
export const GENERAL_NAMES: Record<Culture, readonly string[]> = {
  roman: [
    "Marcellus", "Fabius", "Scipio", "Paullus", "Flaminius", "Varro", "Sempronius", "Fulvius", "Claudius",
    "Cornelius", "Valerius", "Manlius", "Aemilius", "Postumius", "Atilius", "Minucius", "Junius", "Livius",
  ],
  hellenistic: [
    "Philopoemen", "Antigonus", "Demetrius", "Ptolemy", "Seleucus", "Lysimachus", "Cleomenes", "Aratus",
    "Nicanor", "Theodotus", "Molon", "Achaeus", "Xenon", "Perseus", "Leonnatus", "Pyrrhus", "Eumenes", "Nearchus",
  ],
  punic: [
    "Hanno", "Hasdrubal", "Mago", "Himilco", "Bomilcar", "Hamilcar", "Maharbal", "Gisco", "Carthalo",
    "Adherbal", "Syphax", "Masinissa", "Bostar", "Hampsicora", "Juba", "Gala", "Mathos", "Hiempsal",
  ],
  celtic: [
    "Brennus", "Vercassivellaunus", "Indibilis", "Mandonius", "Britomarus", "Aneroestes", "Concolitanus",
    "Ducarius", "Boiorix", "Viridomarus", "Allucius", "Istolatios", "Caturix", "Teutobod", "Ariovistus",
    "Cassivellaunus", "Comontorius", "Litavicus",
  ],
  thracian: [
    "Seuthes", "Cotys", "Teres", "Sitalces", "Rhoemetalces", "Dromichaetes", "Burebista", "Oroles", "Rubobostes",
    "Scilurus", "Ateas", "Palacus", "Abrupolis", "Amadocus", "Kersebleptes", "Zalmodegikos", "Medocus", "Bithys",
  ],
};
