import type { Rng } from "@/core/rng.js";
import {
  addLog,
  armiesOf,
  getFaction,
  type Army,
  type ArmyId,
  type FactionId,
  type GameState,
  type General,
  type Regiment,
} from "@/core/state.js";
import { GENERAL_NAMES, GENERAL_TRAITS, GENERALS, TRAIT_INFO, type GeneralTrait } from "@/data/generals.js";
import { ARMY_RULES, UNITS } from "@/data/units.js";

// A general rides with his army in a bodyguard regiment of his own, so he
// follows it wherever its regiments go, and dies when his bodyguard does. An
// army can hold several, like any other regiment, but only its leader's
// traits count: the most senior general, by most traits, then most
// experience, then whoever has been in it longest. In a battle fought by
// several armies, the side's leader is its most senior general across them.

/** Whether a regiment is a general's bodyguard. */
export function isGeneral(r: { general?: General }): boolean {
  return r.general !== undefined;
}

/**
 * The bodyguard of the general leading these regiments, if any: the most
 * senior, by most traits, then most experience, then the first among them.
 */
export function generalOf<T extends { general?: General; experience?: number }>(regiments: readonly T[]): T | undefined {
  let lead: T | undefined;
  for (const r of regiments) {
    if (!r.general) continue;
    if (!lead || r.general.traits.length > lead.general!.traits.length
      || (r.general.traits.length === lead.general!.traits.length && (r.experience ?? 0) > (lead.experience ?? 0))) lead = r;
  }
  return lead;
}

/** Whether an army has a general. */
export function hasGeneral(army: Army): boolean {
  return army.regiments.some(isGeneral);
}

/** Whether the general leading these regiments, if any, has a trait. */
export function hasTrait(regiments: readonly { general?: General; experience?: number }[], trait: GeneralTrait): boolean {
  return generalOf(regiments)?.general?.traits.includes(trait) ?? false;
}

/** What a side's leading general does for it in battle. With no general, every effect is neutral. */
export interface Leadership {
  /** Multiplies the side's melee blows. */
  meleeDealt: number;
  /** Multiplies the losses it takes when defending. */
  takenWhenDefending: number;
  /** Taken off the walls' share of the defense bonus when it storms a city. */
  wallsCut: number;
  /** Multiplies its losses while fleeing, if beaten. */
  routFactor: number;
  /** Extra experience points for its regiments from a battle that counts. */
  drill: number;
}

/** What the general leading a side (its most senior), if any, does for it. */
export function leadershipOf(side: readonly { general?: General; experience?: number }[]): Leadership {
  const traits = generalOf(side)?.general?.traits ?? [];
  const has = (t: GeneralTrait) => traits.includes(t);
  return {
    meleeDealt: has("fierce") ? 1 + GENERALS.fierce : 1,
    takenWhenDefending: has("stubborn") ? 1 - GENERALS.stubborn : 1,
    wallsCut: has("besieger") ? GENERALS.besieger : 0,
    routFactor: has("wary") ? GENERALS.wary : 1,
    drill: has("drillmaster") ? GENERALS.drillmaster : 0,
  };
}

/** A regiment's movement for a fresh turn: its unit's, plus what a Swift general in its army adds. */
export function freshMovement(r: Regiment, swift: boolean): number {
  const base = UNITS[r.unit].movement;
  return swift ? Math.max(base, Math.min(GENERALS.swiftCap, base + GENERALS.swift)) : base;
}

/** How many generals a faction has. */
export function generalCount(state: GameState, factionId: FactionId): number {
  return armiesOf(state, factionId).reduce((n, a) => n + a.regiments.filter(isGeneral).length, 0);
}

/** The most generals a faction can have: GENERALS.perCity for each city it holds. */
export function generalCap(state: GameState, factionId: FactionId): number {
  return Object.values(state.cities).filter((c) => c.owner === factionId).length * GENERALS.perCity;
}

/**
 * How much of the grant and trait chances a win earns, 0 to 1: full against an
 * enemy at least GENERALS.grantFullAt of the winners' size, and in proportion
 * below that, so crushing a small band rarely makes a general.
 */
export function rewardChance(enemySoldiers: number, ownSoldiers: number): number {
  if (ownSoldiers <= 0) return 1;
  return Math.min(1, enemySoldiers / ownSoldiers / GENERALS.grantFullAt);
}

/**
 * After a win, the winning side may gain a general and its generals may
 * learn: its leading army, if it has none, gains one with GENERALS.grantChance
 * (while its faction is under the cap), and each surviving general of the
 * side learns a new trait with GENERALS.traitChance, both scaled by `share`
 * (rewardChance). A full army can't take him: the winner is told instead.
 * Rolled with the battle's dice.
 */
export function rewardVictors(
  state: GameState,
  rng: Rng,
  leadArmyId: ArmyId,
  winners: readonly Regiment[],
  place: string,
  share: number,
): GameState {
  if (share <= 0) return state;
  let next = state;
  const alive = new Set(Object.values(state.armies).flatMap((a) => a.regiments.map((r) => r.id)));
  for (const r of winners) {
    if (!r.general || !alive.has(r.id) || r.general.traits.length >= GENERAL_TRAITS.length) continue;
    if (rng.next() >= GENERALS.traitChance * share) continue;
    next = learnTrait(next, rng, r.id);
  }

  // A side that lost a general in the battle doesn't raise a new one from it.
  if (winners.some((r) => r.general && !alive.has(r.id))) return next;
  const lead = next.armies[leadArmyId];
  if (!lead || hasGeneral(lead)) return next;
  if (generalCount(next, lead.owner) >= generalCap(next, lead.owner)) return next;
  if (rng.next() >= GENERALS.grantChance * share) return next;
  if (lead.regiments.length >= ARMY_RULES.maxRegiments) {
    return addLog(next, `A leader stood out ${place}, but the army had no room for a general.`, { kind: "battle", factions: [lead.owner] });
  }
  return grantGeneral(next, rng, leadArmyId, place);
}

/** Gives an army a new general, with a full bodyguard, a name from his culture and one rolled trait. */
export function grantGeneral(state: GameState, rng: Rng, armyId: ArmyId, place: string): GameState {
  const army = state.armies[armyId];
  const faction = getFaction(state, army.owner)!;
  const taken = new Set(
    Object.values(state.armies).flatMap((a) => a.regiments.flatMap((r) => (r.general ? [r.general.name] : []))),
  );
  const names = GENERAL_NAMES[faction.culture];
  const free = names.filter((n) => !taken.has(n));
  const pool = free.length > 0 ? free : names;
  const name = pool[Math.floor(rng.next() * pool.length)];
  const trait = GENERAL_TRAITS[Math.floor(rng.next() * GENERAL_TRAITS.length)];
  const bodyguard: Regiment = {
    id: `reg${state.nextRegimentNumber}`,
    unit: "bodyguard",
    tier: 1,
    soldiers: GENERALS.bodyguardSize,
    experience: 0,
    movementLeft: 0,
    pinned: false,
    general: { name, traits: [trait] },
  };
  const next: GameState = {
    ...state,
    armies: { ...state.armies, [armyId]: { ...army, regiments: [...army.regiments, bodyguard] } },
    nextRegimentNumber: state.nextRegimentNumber + 1,
  };
  return addLog(next, `${name} (${TRAIT_INFO[trait].name}) rose to lead ${possessive(faction.shortName)} army ${place}.`, {
    kind: "battle",
    factions: [army.owner],
    major: true,
  });
}

/** A general learns a rolled trait he doesn't have yet. */
function learnTrait(state: GameState, rng: Rng, regimentId: string): GameState {
  for (const army of Object.values(state.armies)) {
    const r = army.regiments.find((x) => x.id === regimentId);
    if (!r?.general) continue;
    const missing = GENERAL_TRAITS.filter((t) => !r.general!.traits.includes(t));
    if (missing.length === 0) return state;
    const trait = missing[Math.floor(rng.next() * missing.length)];
    const general = { ...r.general, traits: [...r.general.traits, trait] };
    const regiments = army.regiments.map((x) => (x.id === regimentId ? { ...x, general } : x));
    const next = { ...state, armies: { ...state.armies, [army.id]: { ...army, regiments } } };
    return addLog(next, `${general.name} is now ${TRAIT_INFO[trait].name.toLowerCase()}.`, { kind: "battle", factions: [army.owner] });
  }
  return state;
}

/**
 * After a battle, each general among `fought` who is still alive is killed
 * with GENERALS.deathChance, won or lost, and his bodyguard is taken off the
 * map with him. Rolled with the battle's dice. Report it with reportFallen.
 */
export function strikeGenerals(state: GameState, rng: Rng, fought: readonly Regiment[]): GameState {
  const struck = new Set(fought.filter((r) => r.general && rng.next() < GENERALS.deathChance).map((r) => r.id));
  if (struck.size === 0) return state;
  const armies = { ...state.armies };
  for (const army of Object.values(state.armies)) {
    if (!army.regiments.some((r) => struck.has(r.id))) continue;
    const kept = army.regiments.filter((r) => !struck.has(r.id));
    if (kept.length > 0) armies[army.id] = { ...army, regiments: kept };
    else delete armies[army.id];
  }
  return { ...state, armies };
}

/**
 * Reports the generals among `before` (the regiments that fought) whose
 * bodyguard is gone in `after`, to both sides.
 */
export function reportFallen(after: GameState, before: readonly Regiment[], place: string, factions: FactionId[]): GameState {
  const alive = new Set(Object.values(after.armies).flatMap((a) => a.regiments.map((r) => r.id)));
  let next = after;
  for (const r of before) {
    if (!r.general || alive.has(r.id)) continue;
    next = addLog(next, `${r.general.name} fell ${place}.`, { kind: "battle", factions, major: true });
  }
  return next;
}

/** At the start of its owner's turn, every bodyguard gets GENERALS.bodyguardRefill riders back, free, up to full. */
export function replenishBodyguards(state: GameState, factionId: FactionId): GameState {
  const armies = { ...state.armies };
  let changed = false;
  for (const army of armiesOf(state, factionId)) {
    if (!army.regiments.some((r) => isGeneral(r) && r.soldiers < GENERALS.bodyguardSize)) continue;
    changed = true;
    armies[army.id] = {
      ...army,
      regiments: army.regiments.map((r) =>
        isGeneral(r) ? { ...r, soldiers: Math.min(GENERALS.bodyguardSize, r.soldiers + GENERALS.bodyguardRefill) } : r,
      ),
    };
  }
  return changed ? { ...state, armies } : state;
}

/** "Rome's", but "Seleucids'". */
function possessive(name: string): string {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}
