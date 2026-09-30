import type { GameContext } from "@/core/context.js";
import { createRng, type Rng } from "@/core/rng.js";
import {
  addLog,
  armyAt,
  cityAt,
  getFaction,
  type Army,
  type ArmyId,
  type BattleReport,
  type Check,
  type Forces,
  type FactionId,
  type GameState,
  type Regiment,
  type RegimentId,
} from "@/core/state.js";
import { BUILDING_EFFECTS } from "@/data/buildings.js";
import { COMBAT } from "@/data/combat.js";
import { TERRAIN } from "@/data/terrain.js";
import { TIERS, UNIT_TYPES, UNITS, type Tier, type UnitType } from "@/data/units.js";
import type { TileId } from "@/map/topology.js";
import {
  armyHolding,
  attackTargets,
  besiegedCity,
  mayFightAt,
  canMove,
  describeRegiments,
  moveRegiments,
  pickRegiments,
  relocate,
} from "@/systems/armies.js";
import { captureCity, eliminateIfDefeated } from "@/systems/cities.js";

// ---- Battle maths -------------------------------------------------------

/** Rock-paper-scissors multiplier for `unit` fighting `against`. */
export function matchup(unit: UnitType, against: UnitType): number {
  if (UNITS[unit].beats.includes(against)) return COMBAT.advantage;
  if (UNITS[against].beats.includes(unit)) return COMBAT.disadvantage;
  return 1;
}

/** Anything with a unit type and a soldier count: a regiment, or a hypothetical one (basic, if no tier is given). */
export interface Troops {
  unit: UnitType;
  soldiers: number;
  tier?: Tier;
}

/** What a regiment's soldiers count for: more for better tiers (an elite soldier fights like 1.6 basic ones). */
function fighters(t: Troops): number {
  return t.soldiers * TIERS[t.tier ?? 1].strength;
}

/**
 * Strength of one side against another. Each regiment's soldiers, weighted
 * by its tier, are multiplied by its matchup against the enemy's mix of unit
 * types, weighted by how many soldiers of each type the enemy has. Against a
 * single-type enemy of basic troops this is just soldiers × matchup.
 */
export function sideStrength(side: readonly Troops[], enemy: readonly Troops[]): number {
  const enemyTotal = enemy.reduce((sum, t) => sum + t.soldiers, 0);
  if (enemyTotal === 0) return side.reduce((sum, t) => sum + fighters(t), 0);

  const share = new Map<UnitType, number>();
  for (const type of UNIT_TYPES) share.set(type, 0);
  for (const t of enemy) share.set(t.unit, share.get(t.unit)! + t.soldiers / enemyTotal);

  let strength = 0;
  for (const t of side) {
    let multiplier = 0;
    for (const [type, s] of share) multiplier += s * matchup(t.unit, type);
    strength += fighters(t) * multiplier;
  }
  return strength;
}

export interface BattleStrength {
  attacker: number;
  defender: number;
}

/** Strength of each side before randomness, with the defender's bonus applied. */
export function battleStrength(
  attackers: readonly Troops[],
  defenders: readonly Troops[],
  defenseBonus: number,
): BattleStrength {
  return {
    attacker: sideStrength(attackers, defenders),
    defender: sideStrength(defenders, attackers) * (1 + defenseBonus),
  };
}

export interface BattleResult {
  attackerWins: boolean;
  /** Total soldiers each side lost. */
  attackerLosses: number;
  defenderLosses: number;
  strength: BattleStrength;
}

/**
 * Resolves a battle. The stronger side (after a little randomness) wins and
 * the loser is wiped out. The winner loses soldiers in proportion to how
 * close the fight was.
 */
export function resolveBattle(
  attackers: readonly Troops[],
  defenders: readonly Troops[],
  defenseBonus: number,
  rng: Rng,
): BattleResult {
  const base = battleStrength(attackers, defenders, defenseBonus);
  const roll = () => 1 + (rng.next() * 2 - 1) * COMBAT.randomness;
  const strength = { attacker: base.attacker * roll(), defender: base.defender * roll() };

  const attackerWins = strength.attacker > strength.defender;
  const total = (side: readonly Troops[]) => side.reduce((sum, t) => sum + t.soldiers, 0);
  const winnerSoldiers = total(attackerWins ? attackers : defenders);
  const [winnerStrength, loserStrength] = attackerWins
    ? [strength.attacker, strength.defender]
    : [strength.defender, strength.attacker];

  const closeness = Math.min(1, loserStrength / winnerStrength);
  const winnerLosses = Math.min(winnerSoldiers - 1, Math.round(winnerSoldiers * closeness * COMBAT.winnerLossRate));

  return {
    attackerWins,
    attackerLosses: attackerWins ? winnerLosses : total(attackers),
    defenderLosses: attackerWins ? total(defenders) : winnerLosses,
    strength,
  };
}

/** Spreads losses across regiments in proportion to their size. Emptied regiments are removed. */
export function applyLosses(regiments: readonly Regiment[], losses: number): Regiment[] {
  const total = regiments.reduce((sum, r) => sum + r.soldiers, 0);
  if (losses >= total) return [];
  let remaining = losses;
  const result = regiments.map((r, i) => {
    const share = i === regiments.length - 1 ? remaining : Math.min(remaining, Math.round((losses * r.soldiers) / total));
    remaining -= share;
    return { ...r, soldiers: r.soldiers - share };
  });
  return result.filter((r) => r.soldiers > 0);
}

/** Terrain bonus, plus the city bonus and its walls when defending a city. */
export function defenseBonusAt(state: GameState, tile: TileId): number {
  const terrain = TERRAIN[state.tiles[tile].terrain].defenseBonus;
  const city = cityAt(state, tile);
  return terrain + (city ? cityDefense(city) : 0);
}

/** A city's own defense bonus: the base city bonus plus its walls. */
export function cityDefense(city: { buildings: { walls: number } }): number {
  return COMBAT.cityDefenseBonus + BUILDING_EFFECTS.wallsDefense[city.buildings.walls];
}

// ---- Attacking ----------------------------------------------------------

/**
 * Whether the chosen regiments can attack `target`. With `via`, they first
 * march to that tile (which must be reachable this turn) and attack from
 * there, so they need movement left after the march.
 */
export function canAttack(
  ctx: GameContext,
  state: GameState,
  factionId: FactionId,
  armyId: ArmyId,
  regimentIds: readonly RegimentId[],
  target: TileId,
  via?: TileId,
): Check {
  const army = state.armies[armyId];
  if (!army || army.owner !== factionId) return { ok: false, reason: "That army isn't yours." };
  const attackers = pickRegiments(army, regimentIds);
  if (!attackers) return { ok: false, reason: "Choose which regiments attack." };
  if (attackers.some((r) => r.movementLeft <= 0)) return { ok: false, reason: "Some chosen regiments have no movement left." };

  if (via && via !== army.tile) {
    if (besiegedCity(state, army)) {
      return { ok: false, reason: "A besieged garrison can only attack the besiegers outside its walls." };
    }
    const move = canMove(ctx, state, factionId, armyId, regimentIds, via);
    if (!move.ok) return move;
    const moved = moveRegiments(ctx, state, armyId, regimentIds, via);
    const holder = armyHolding(moved, regimentIds[0]);
    if (!holder) return { ok: false, reason: "Those regiments can't attack from there." };
    return canAttack(ctx, moved, factionId, holder.id, regimentIds, target);
  }

  if (!attackTargets(ctx, state, army, regimentIds).includes(target)) {
    if (besiegedCity(state, army)) {
      return { ok: false, reason: "A besieged garrison can only attack the besiegers outside its walls." };
    }
    return { ok: false, reason: "Armies can only attack an enemy army or undefended enemy city next to them." };
  }
  return { ok: true };
}

/** An army's part in a battle: the army, and which of its regiments fight. */
export interface BattleSide {
  army: Army;
  regiments: Regiment[];
}

/**
 * Who fights when an army attacks `target`: every army within one tile of
 * either the attacker or the defender joins its own side. The attacker's
 * other armies bring their regiments that can still move; the defender's
 * other armies bring all of theirs, since defending takes no movement. A
 * besieged garrison only joins a battle against its besiegers. The leading
 * army comes first on the attacking side, the defender first on the other.
 */
export function battleSides(
  ctx: GameContext,
  state: GameState,
  army: Army,
  regimentIds: readonly RegimentId[],
  target: TileId,
): { attackers: BattleSide[]; defenders: BattleSide[] } {
  const lead = pickRegiments(army, regimentIds) ?? [];
  const defender = armyAt(state, target);
  const nearby = new Set([army.tile, target, ...ctx.topology.neighbors(army.tile), ...ctx.topology.neighbors(target)]);
  const others = Object.values(state.armies).filter((a) => a.id !== army.id && a.id !== defender?.id && nearby.has(a.tile));

  const attackers: BattleSide[] = [{ army, regiments: lead }];
  const defenders: BattleSide[] = defender ? [{ army: defender, regiments: defender.regiments }] : [];
  for (const other of others) {
    if (other.owner === army.owner) {
      if (!mayFightAt(state, other, target)) continue;
      const ready = other.regiments.filter((r) => r.movementLeft > 0);
      if (ready.length > 0) attackers.push({ army: other, regiments: ready });
    } else if (defender && other.owner === defender.owner) {
      // A besieged garrison can't come out to help, except against its own besiegers.
      const shutIn = besiegedCity(state, other);
      if (shutIn && shutIn.besiegedBy !== army.owner) continue;
      defenders.push({ army: other, regiments: other.regiments });
    }
  }
  return { attackers, defenders };
}

/**
 * The chosen regiments attack a tile. Call canAttack first. With `via`, they
 * march to that tile first and attack from there.
 *
 * Against an undefended city, they march in and capture it. Against an army,
 * every other army of the attacker's next to the target joins in with the
 * regiments that can still move, and one battle is fought. Losses are shared
 * across everyone who fought. If the attackers win a siege, the leading
 * army's survivors march in and capture the city; supporting armies stay put.
 * Everyone who fought has used their turn.
 */
export function attack(
  ctx: GameContext,
  state: GameState,
  armyId: ArmyId,
  regimentIds: readonly RegimentId[],
  target: TileId,
  via?: TileId,
): GameState {
  // March up to the target first if asked to; the regiments may now belong to
  // a different army (if only some moved, or they joined one on the way).
  if (via && via !== state.armies[armyId].tile) {
    const moved = moveRegiments(ctx, state, armyId, regimentIds, via);
    return attack(ctx, moved, armyHolding(moved, regimentIds[0])!.id, regimentIds, target);
  }

  const army = state.armies[armyId];
  const lead = pickRegiments(army, regimentIds)!.map((r) => ({ ...r, movementLeft: 0 }));
  const defender = armyAt(state, target);
  const attackerName = getFaction(state, army.owner)?.shortName ?? "Unknown";

  if (!defender) return takeCity(state, army, lead, target);

  const { attackers: sides, defenders: defending } = battleSides(ctx, state, army, regimentIds, target);
  const fighting = sides.flatMap((s) => s.regiments.map((r) => ({ ...r, movementLeft: 0 })));
  const holding = defending.flatMap((s) => s.regiments);

  const rng = createRng(state.rngState);
  const result = resolveBattle(fighting, holding, defenseBonusAt(state, target), rng);

  // Share each side's losses across every regiment that fought on it, then
  // put the survivors back in their own armies.
  const armies = { ...state.armies };
  const settle = (group: BattleSide[], regiments: Regiment[], losses: number) => {
    const survivors = new Map(applyLosses(regiments, losses).map((r) => [r.id, r]));
    for (const side of group) {
      const fought = new Set(side.regiments.map((r) => r.id));
      const kept = side.army.regiments.flatMap((r) => {
        if (!fought.has(r.id)) return [r];
        const s = survivors.get(r.id);
        return s ? [s] : [];
      });
      if (kept.length > 0) armies[side.army.id] = { ...side.army, regiments: kept };
      else delete armies[side.army.id];
    }
  };
  settle(sides, fighting, result.attackerLosses);
  settle(defending, holding, result.defenderLosses);

  const defenderName = getFaction(state, defender.owner)?.shortName ?? "Unknown";
  const joined = sides.length > 1 ? ` from ${sides.length} armies` : "";
  const helped = defending.length > 1 ? ` from ${defending.length} armies` : "";
  const report = result.attackerWins
    ? `${possessive(attackerName)} ${describeRegiments(fighting)}${joined} defeated ${possessive(defenderName)} ` +
      `${describeRegiments(holding)}${helped} ${placeName(state, target)}, losing ${fmt(result.attackerLosses)}.`
    : `${possessive(defenderName)} ${describeRegiments(holding)}${helped} repelled ${possessive(attackerName)} ` +
      `${describeRegiments(fighting)}${joined} ${placeName(state, target)}, losing ${fmt(result.defenderLosses)}.`;

  let afterBattle = addLog({ ...state, armies, rngState: rng.state }, report, {
    kind: "battle",
    factions: [army.owner, defender.owner],
  });

  // Won a siege: the defenders are gone, so the leading army's survivors take the city.
  const city = cityAt(state, target);
  const leadAfter = afterBattle.armies[army.id];
  let captured: string | null = null;
  if (result.attackerWins && city && city.owner !== army.owner && leadAfter) {
    const leadIds = new Set(lead.map((r) => r.id));
    const marching = leadAfter.regiments.filter((r) => leadIds.has(r.id));
    if (marching.length > 0) {
      afterBattle = takeCity(afterBattle, leadAfter, marching, target);
      captured = city.name;
    }
  }

  return recordBattle(afterBattle, {
    turn: state.turn,
    tile: target,
    place: placeName(state, target),
    attacker: army.owner,
    defender: defender.owner,
    attackingArmies: sides.length,
    defendingArmies: defending.length,
    attackerForces: forcesOf(fighting),
    defenderForces: forcesOf(holding),
    attackerLosses: result.attackerLosses,
    defenderLosses: result.defenderLosses,
    attackerWon: result.attackerWins,
    defenseBonus: defenseBonusAt(state, target),
    cityCaptured: captured,
  });
}

const MAX_BATTLE_REPORTS = 30;

/** Keeps a report of the battle, dropping the oldest beyond the limit. */
function recordBattle(state: GameState, report: Omit<BattleReport, "id">): GameState {
  const battles = [...state.battles, { ...report, id: state.nextBattleNumber }].slice(-MAX_BATTLE_REPORTS);
  return { ...state, battles, nextBattleNumber: state.nextBattleNumber + 1 };
}

/** Soldiers of each unit type in a set of regiments. */
export function forcesOf(regiments: readonly Troops[]): Forces {
  const forces: Forces = {};
  for (const r of regiments) forces[r.unit] = (forces[r.unit] ?? 0) + r.soldiers;
  return forces;
}

const fmt = (n: number) => n.toLocaleString("en-US");

/** "Rome's", but "Seleucids'". */
function possessive(name: string): string {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

/** Moves regiments into an undefended enemy city and captures it and its land. */
function takeCity(state: GameState, from: Army, regiments: Regiment[], tile: TileId): GameState {
  const city = cityAt(state, tile)!;
  const previousOwner = city.owner;
  const name = getFaction(state, from.owner)?.shortName ?? "Unknown";
  let next = relocate(state, from, regiments, tile);
  next = captureCity(next, city.id, from.owner);
  next = addLog(next, `${name} captured ${city.name}.`, { kind: "city", factions: [from.owner, previousOwner], major: true });
  return eliminateIfDefeated(next, previousOwner);
}

/** "at Vostgrad", "near Vostgrad" or "in the hills". */
export function placeName(state: GameState, tile: TileId): string {
  const city = cityAt(state, tile);
  if (city) return `at ${city.name}`;
  const claim = state.territory[tile];
  if (claim) return `near ${state.cities[claim.cityId]?.name ?? "a city"}`;
  return `in the ${TERRAIN[state.tiles[tile].terrain].name.toLowerCase()}`;
}

// ---- Preview ------------------------------------------------------------

/**
 * Chance that a side with `attack` strength beats one with `defend`, given
 * that each is multiplied by an independent random factor in
 * [1 - randomness, 1 + randomness]. Worked out exactly, not by rolling dice.
 */
export function winChance(attack: number, defend: number): number {
  if (attack <= 0) return 0;
  if (defend <= 0) return 1;
  const lo = 1 - COMBAT.randomness;
  const hi = 1 + COMBAT.randomness;
  if (hi === lo) return attack > defend ? 1 : 0;

  // Average, over the defender's roll, of the chance the attacker's roll is high enough.
  const steps = 400;
  let total = 0;
  for (let i = 0; i < steps; i++) {
    const defenderRoll = lo + ((hi - lo) * (i + 0.5)) / steps;
    const needed = (defend * defenderRoll) / attack;
    total += Math.min(1, Math.max(0, (hi - needed) / (hi - lo)));
  }
  return total / steps;
}

export interface BattlePreview {
  /** Every regiment of ours that would fight, including armies joining in. */
  attackers: Regiment[];
  /** How many of our armies would take part. */
  armies: number;
  /** The army being attacked. */
  defender: Army;
  /** Every regiment that would defend, including armies joining in. */
  defenders: Regiment[];
  /** How many of their armies would take part. */
  defendingArmies: number;
  terrainBonus: number;
  cityBonus: number;
  strength: BattleStrength;
  /** 0 to 1. */
  winChance: number;
  /** Soldiers we'd likely lose if we win. If we lose, every attacker is lost. */
  lossesIfWin: number;
  /** Soldiers the defender would likely lose if it wins. If it loses, all of them. */
  defenderLossesIfHold: number;
  /** Where the battle would be fought, e.g. "near Vostgrad". */
  place: string;
  /** Whether winning would take a city. */
  cityAtStake: string | null;
}

/**
 * What would happen if the chosen regiments attacked `target` (marching to
 * `via` first): who would fight, each side's strength, the odds, and the
 * likely losses. Changes nothing. Returns null if there's no army to fight
 * there, or the attack isn't allowed.
 */
export function previewBattle(
  ctx: GameContext,
  state: GameState,
  armyId: ArmyId,
  regimentIds: readonly RegimentId[],
  target: TileId,
  via?: TileId,
): BattlePreview | null {
  const army = state.armies[armyId];
  if (!army) return null;
  if (!canAttack(ctx, state, army.owner, armyId, regimentIds, target, via).ok) return null;

  // Where the regiments would stand after marching up.
  let staged = state;
  let lead = army;
  if (via && via !== army.tile) {
    staged = moveRegiments(ctx, state, armyId, regimentIds, via);
    lead = armyHolding(staged, regimentIds[0])!;
  }

  const defender = armyAt(staged, target);
  if (!defender) return null;

  const sides = battleSides(ctx, staged, lead, regimentIds, target);
  const attackers = sides.attackers.flatMap((s) => s.regiments);
  const defenders = sides.defenders.flatMap((s) => s.regiments);
  const terrainBonus = TERRAIN[staged.tiles[target].terrain].defenseBonus;
  const city = cityAt(staged, target);
  const cityBonus = city ? cityDefense(city) : 0;
  const strength = battleStrength(attackers, defenders, terrainBonus + cityBonus);

  const total = (rs: readonly Troops[]) => rs.reduce((sum, r) => sum + r.soldiers, 0);
  const likelyLosses = (soldiers: number, winner: number, loser: number) =>
    Math.min(soldiers - 1, Math.round(soldiers * Math.min(1, loser / winner) * COMBAT.winnerLossRate));

  return {
    attackers,
    armies: sides.attackers.length,
    defender,
    defenders,
    defendingArmies: sides.defenders.length,
    terrainBonus,
    cityBonus,
    strength,
    winChance: winChance(strength.attacker, strength.defender),
    lossesIfWin: likelyLosses(total(attackers), strength.attacker, strength.defender),
    defenderLossesIfHold: likelyLosses(total(defenders), strength.defender, strength.attacker),
    place: placeName(staged, target),
    cityAtStake: city && city.owner !== army.owner ? city.name : null,
  };
}
