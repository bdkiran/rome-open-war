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
import { ARMY_RULES, regimentSize, TIERS, UNITS, unitStats, type Tier, type UnitStats, type UnitType } from "@/data/units.js";
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
  placeNewArmy,
  relocate,
} from "@/systems/armies.js";
import { captureCity, eliminateIfDefeated } from "@/systems/cities.js";

// ---- Battle maths -------------------------------------------------------
//
// A battle is fought in rounds. First come the volleys (COMBAT.volleys
// rounds), when only ranged troops fight: arrows ignore armor, but horsemen
// close fast, so only the first volley reaches them, at reduced effect. Then
// the lines meet and every regiment fights in melee each round, dealing
// losses by its attack over the target's armor; spearmen add their
// anti-cavalry against horsemen, and attacking cavalry add their charge in
// the first melee round on open ground. Each regiment's losses dealt are
// spread over the enemy's regiments by their share of soldiers.
//
// The defender deals (1 + defense bonus) times the losses and takes that much
// less. A side breaks once it has lost COMBAT.breakPoint of its soldiers, and
// is routed and destroyed; the winner keeps the losses it took up to that
// moment, which may come partway through a round.

/** Anything with a unit type and a soldier count: a regiment, or a hypothetical one (basic, if no tier is given). */
export interface Troops {
  unit: UnitType;
  soldiers: number;
  tier?: Tier;
}

/** Where a battle is fought: the defender's bonus, and whether attacking cavalry can charge. */
export interface Battlefield {
  /** Terrain, city and walls together, e.g. 0.55 = +55%. */
  defenseBonus: number;
  /** Open ground outside a city, where attacking cavalry can charge. */
  openGround: boolean;
}

/** One kind of troops on a side, a unit at a tier, with its soldiers pooled: they all fight alike. */
interface Kind {
  stats: UnitStats;
  /** The tier's multiplier: better-drilled troops also weather arrows better. */
  drill: number;
  soldiers: number;
}

/** Pools a side's troops into kinds, and which kind each troop belongs to. */
function kindsOf(side: readonly Troops[]): { kinds: Kind[]; kindOf: number[] } {
  const keys: string[] = [];
  const kinds: Kind[] = [];
  const kindOf = side.map((t) => {
    const tier = t.tier ?? 1;
    const key = `${t.unit}:${tier}`;
    let i = keys.indexOf(key);
    if (i < 0) {
      i = keys.push(key) - 1;
      kinds.push({ stats: unitStats(t.unit, tier), drill: TIERS[tier].stats, soldiers: 0 });
    }
    kinds[i].soldiers += t.soldiers;
    return i;
  });
  return { kinds, kindOf };
}

const soldiersIn = (kinds: readonly { soldiers: number }[]) => kinds.reduce((sum, k) => sum + k.soldiers, 0);

/** Losses one soldier of `from` deals to `to` in a round, before the kill rate and the dice. */
function blow(from: Kind, to: Kind, round: number, charging: boolean): number {
  if (round < COMBAT.volleys) {
    if (from.stats.ranged === 0) return 0;
    if (!to.stats.mounted) return from.stats.ranged / to.drill;
    return round === 0 ? (from.stats.ranged * COMBAT.rangedVsMounted) / to.drill : 0;
  }
  let attack = from.stats.attack + (to.stats.mounted ? from.stats.antiCavalry : 0);
  if (charging && round === COMBAT.volleys) attack += from.stats.charge;
  return attack / to.stats.armor;
}

/** Losses a side deals to each of the enemy's kinds in one round, spread by their share of soldiers. */
function dealt(from: readonly Kind[], to: readonly Kind[], round: number, charging: boolean): number[] {
  const alive = soldiersIn(to);
  const losses = to.map(() => 0);
  if (alive <= 0) return losses;
  for (const f of from) {
    if (f.soldiers <= 0) continue;
    to.forEach((t, j) => {
      if (t.soldiers > 0) losses[j] += f.soldiers * COMBAT.killRate * (t.soldiers / alive) * blow(f, t, round, charging);
    });
  }
  return losses;
}

export interface BattleResult {
  attackerWins: boolean;
  /**
   * Soldiers left in each attacking regiment, in the order given, when the
   * battle ended. The loser's survivors still have to flee (see rout).
   */
  attackerSoldiers: number[];
  defenderSoldiers: number[];
  /** Total soldiers each side lost in the battle itself, before any rout. */
  attackerLosses: number;
  defenderLosses: number;
  /** Rounds fought before one side broke. */
  rounds: number;
}

/**
 * Fights a battle out, round by round (see the top of this section). With
 * an RNG, the losses each side deals in a round are thrown by the dice;
 * without one, the battle is fought with no luck at all.
 */
export function resolveBattle(
  attackers: readonly Troops[],
  defenders: readonly Troops[],
  field: Battlefield,
  rng: Rng | null,
): BattleResult {
  const a = kindsOf(attackers);
  const d = kindsOf(defenders);
  const attackerStart = soldiersIn(a.kinds);
  const defenderStart = soldiersIn(d.kinds);
  const luck = () => (rng ? 1 + (rng.next() * 2 - 1) * COMBAT.roundRandomness : 1);
  const edge = 1 + field.defenseBonus;

  let rounds = 0;
  let attackerWins = defenderStart === 0;
  while (attackerStart > 0 && defenderStart > 0) {
    const attackLuck = luck();
    const defendLuck = luck();
    const toDefenders = dealt(a.kinds, d.kinds, rounds, field.openGround).map((n) => (n * attackLuck) / edge);
    const toAttackers = dealt(d.kinds, a.kinds, rounds, false).map((n) => n * defendLuck * edge);
    rounds++;

    // How far into the round each side reaches its breaking point, if it
    // does: the fight stops the moment the first one breaks, so a side is
    // never judged on losses it took after the other had already run.
    const breaksAt = (kinds: Kind[], start: number, losses: number[]) => {
      const room = soldiersIn(kinds) - start * (1 - COMBAT.breakPoint);
      const total = losses.reduce((sum, n) => sum + n, 0);
      return total > 0 && total >= room ? Math.max(0, room) / total : Infinity;
    };
    const attackerBreaks = breaksAt(a.kinds, attackerStart, toAttackers);
    const defenderBreaks = breaksAt(d.kinds, defenderStart, toDefenders);
    const lasts = Math.min(1, attackerBreaks, defenderBreaks);
    d.kinds.forEach((k, i) => (k.soldiers = Math.max(0, k.soldiers - toDefenders[i] * lasts)));
    a.kinds.forEach((k, i) => (k.soldiers = Math.max(0, k.soldiers - toAttackers[i] * lasts)));

    if (lasts < 1 || attackerBreaks <= 1 || defenderBreaks <= 1) {
      // The first to break loses; if both break at once, the defenders hold.
      attackerWins = defenderBreaks < attackerBreaks;
      break;
    }
    if (rounds >= COMBAT.maxRounds) {
      attackerWins = soldiersIn(d.kinds) / defenderStart < soldiersIn(a.kinds) / attackerStart;
      break;
    }
  }

  const attackerSoldiers = survivors(attackers, a, attackerWins);
  const defenderSoldiers = survivors(defenders, d, !attackerWins);
  const lost = (side: readonly Troops[], left: number[]) => side.reduce((sum, t, i) => sum + t.soldiers - left[i], 0);
  return {
    attackerWins,
    attackerSoldiers,
    defenderSoldiers,
    attackerLosses: lost(attackers, attackerSoldiers),
    defenderLosses: lost(defenders, defenderSoldiers),
    rounds,
  };
}

/**
 * A side's soldiers left in each regiment: each kind's losses, in whole
 * soldiers, spread over its regiments by size. The winner always keeps at
 * least one soldier.
 */
function survivors(side: readonly Troops[], pooled: { kinds: Kind[]; kindOf: number[] }, won: boolean): number[] {
  const left = side.map((t) => t.soldiers);
  pooled.kinds.forEach((kind, k) => {
    const members = side.flatMap((_, i) => (pooled.kindOf[i] === k ? [i] : []));
    const before = members.reduce((sum, i) => sum + side[i].soldiers, 0);
    const spread = spreadLosses(members.map((i) => side[i].soldiers), before - Math.round(kind.soldiers));
    members.forEach((i, j) => (left[i] = spread[j]));
  });
  if (won && left.length > 0 && left.every((n) => n <= 0)) left[0] = 1;
  return left;
}

/** Takes `losses` from a list of soldier counts in proportion to their size. Returns what's left of each. */
function spreadLosses(soldiers: readonly number[], losses: number): number[] {
  const total = soldiers.reduce((sum, n) => sum + n, 0);
  if (losses >= total) return soldiers.map(() => 0);
  const left = soldiers.map((n) => n - Math.min(n, Math.floor((losses * n) / total)));
  // Rounding down leaves a few soldiers over: one each from the regiments in turn.
  let remaining = losses - (total - left.reduce((sum, n) => sum + n, 0));
  for (let i = 0; remaining > 0; i = (i + 1) % left.length) {
    if (left[i] > 0) {
      left[i]--;
      remaining--;
    }
  }
  return left;
}

/**
 * A quick measure of a side's strength against another, without fighting the
 * battle (the AI uses it to choose what to train): its soldiers times the square root of the losses each deals per
 * round against the enemy's mix, averaged over a typical battle
 * (COMBAT.typicalRounds, volleys and charge included). Two sides of equal
 * strength are an even fight. Scaled so that militia against militia is just
 * their soldiers.
 */
export function sideStrength(side: readonly Troops[], enemy: readonly Troops[], charging: boolean): number {
  const own = kindsOf(side).kinds;
  const theirs = kindsOf(enemy).kinds;
  const soldiers = soldiersIn(own);
  const enemies = soldiersIn(theirs);
  if (enemies === 0) return soldiers;

  let power = 0;
  for (const f of own) {
    for (const t of theirs) {
      let total = 0;
      for (let round = 0; round < COMBAT.typicalRounds; round++) total += blow(f, t, round, charging);
      power += (f.soldiers / soldiers) * (t.soldiers / enemies) * total;
    }
  }
  const meleeRounds = COMBAT.typicalRounds - COMBAT.volleys;
  return soldiers * Math.sqrt(power / meleeRounds);
}

export interface BattleStrength {
  attacker: number;
  defender: number;
}

/**
 * Each side's strength, whose ratio says how one-sided the battle is: the
 * battle is fought once without luck, and each side's share of losses is
 * read back through the square law (strength² × (1 − (1 − share lost)²) is
 * the same for both sides). Equal strengths are an even fight; 1.2 times the
 * enemy's strength wins comfortably. The size of the numbers comes from
 * sideStrength, so they read like soldiers.
 */
export function battleStrength(
  attackers: readonly Troops[],
  defenders: readonly Troops[],
  field: Battlefield,
): BattleStrength {
  const soldiers = (side: readonly Troops[]) => side.reduce((sum, t) => sum + t.soldiers, 0);
  const attackerStart = soldiers(attackers);
  const defenderStart = soldiers(defenders);
  if (attackerStart === 0 || defenderStart === 0) return { attacker: attackerStart, defender: defenderStart };

  const calm = resolveBattle(attackers, defenders, field, null);
  const worn = (lost: number, start: number) => Math.max(1e-6, 1 - (1 - Math.min(1, lost / start)) ** 2);
  const [attackerLost, defenderLost] = calm.attackerWins
    ? [calm.attackerLosses, defenderStart * COMBAT.breakPoint]
    : [attackerStart * COMBAT.breakPoint, calm.defenderLosses];
  const ratio = Math.min(MAX_STRENGTH_RATIO, Math.max(1 / MAX_STRENGTH_RATIO,
    Math.sqrt(worn(defenderLost, defenderStart) / worn(attackerLost, attackerStart))));

  const scale = Math.sqrt(sideStrength(attackers, defenders, field.openGround) * sideStrength(defenders, attackers, false));
  return { attacker: scale * Math.sqrt(ratio), defender: scale / Math.sqrt(ratio) };
}

/** A battle won without loss would be infinitely one-sided: cap the ratio. */
const MAX_STRENGTH_RATIO = 10;

/** The battlefield on a tile: its defense bonus, and whether it's open ground (never in a city). */
export function battlefieldAt(state: GameState, tile: TileId): Battlefield {
  return {
    defenseBonus: defenseBonusAt(state, tile),
    openGround: TERRAIN[state.tiles[tile].terrain].openGround && !cityAt(state, tile),
  };
}

/** Spreads losses across regiments in proportion to their size. Emptied regiments are removed. */
export function applyLosses(regiments: readonly Regiment[], losses: number): Regiment[] {
  const left = spreadLosses(regiments.map((r) => r.soldiers), losses);
  return regiments.map((r, i) => ({ ...r, soldiers: left[i] })).filter((r) => r.soldiers > 0);
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

// ---- Flight -------------------------------------------------------------
//
// A side that breaks is routed. Each of its armies that fought flees with its
// survivors, up to COMBAT.fleeTiles tiles, losing more on the way. An army
// that can't flee fights to the death and is destroyed: a garrison defending
// its city, a besieged garrison, or one with nowhere to go. An army that
// fought from its own city falls back inside its walls.

/**
 * Soldiers a routed side loses as it flees: a share of its survivors, plus
 * those cut down by the winner's surviving horsemen (better tiers count for
 * more). Never more than it has.
 */
export function routLosses(fleeing: number, winners: readonly Troops[]): number {
  const horsemen = winners.reduce((sum, t) => sum + (UNITS[t.unit].mounted ? t.soldiers * TIERS[t.tier ?? 1].stats : 0), 0);
  return Math.min(fleeing, Math.round(fleeing * COMBAT.routLoss + horsemen * COMBAT.cavalryPursuit));
}

/**
 * Where a routed army of `owner` standing on `from` flees with `regiments`
 * regiments: up to COMBAT.fleeTiles steps over land, ignoring terrain and
 * zones of control, but never past or onto another faction's army or city,
 * a besieged city, or `closed` (a city being stormed). It stops on an empty
 * tile or joins one of its own armies with room. It makes for its nearest
 * own city in reach; otherwise for the tile farthest from `enemy`, then the
 * one with the fewest enemy armies next to it. Null if there's nowhere to go.
 */
export function fleeTile(
  ctx: GameContext,
  state: GameState,
  owner: FactionId,
  from: TileId,
  regiments: number,
  enemy: TileId,
  closed: TileId | null = null,
): TileId | null {
  const blocked = new Set<TileId>(closed ? [closed] : []);
  const room = new Map<TileId, number>();
  for (const army of Object.values(state.armies)) {
    if (army.owner !== owner) blocked.add(army.tile);
    else room.set(army.tile, ARMY_RULES.maxRegiments - army.regiments.length);
  }
  for (const city of Object.values(state.cities)) {
    if (city.owner !== owner || city.besiegedBy) blocked.add(city.tile);
  }

  const steps = new Map<TileId, number>([[from, 0]]);
  const queue: TileId[] = [from];
  while (queue.length > 0) {
    const tile = queue.shift()!;
    const d = steps.get(tile)!;
    if (d >= COMBAT.fleeTiles) continue;
    for (const n of ctx.topology.neighbors(tile)) {
      // Next door only: a routed army doesn't take a sea crossing.
      if (steps.has(n) || blocked.has(n) || !TERRAIN[state.tiles[n].terrain].passable) continue;
      if (ctx.topology.distance(tile, n) !== 1) continue;
      steps.set(n, d + 1);
      queue.push(n);
    }
  }

  const candidates = [...steps].filter(([t, d]) => d > 0 && (room.get(t) ?? ARMY_RULES.maxRegiments) >= regiments);
  if (candidates.length === 0) return null;
  const homes = candidates.filter(([t]) => cityAt(state, t)?.owner === owner).sort((a, b) => a[1] - b[1] || compareTiles(a[0], b[0]));
  if (homes.length > 0) return homes[0][0];

  const threats = (t: TileId) => ctx.topology.neighbors(t).filter((n) => blocked.has(n) && armyAt(state, n)).length;
  candidates.sort(
    ([a], [b]) =>
      ctx.topology.distance(b, enemy) - ctx.topology.distance(a, enemy) || threats(a) - threats(b) || compareTiles(a, b),
  );
  return candidates[0][0];
}

const compareTiles = (a: TileId, b: TileId) => (a < b ? -1 : a > b ? 1 : 0);

/** What became of a routed side. */
interface Routed {
  state: GameState;
  /** Soldiers it lost in all, battle and rout. */
  losses: number;
  /** Whether any of it got away. */
  fled: boolean;
}

/**
 * Routs a beaten side (see the top of this section). `left` holds each of
 * `regiments`' survivors at the end of the battle, `winners` the winning
 * side's survivors, `enemy` where the winners stand, and `stormed` the city
 * being stormed, if any. Regiments of its armies that didn't fight stay where
 * they are.
 */
function rout(
  ctx: GameContext,
  state: GameState,
  group: readonly BattleSide[],
  regiments: readonly Regiment[],
  left: readonly number[],
  winners: readonly Troops[],
  enemy: TileId,
  stormed: TileId | null,
): Routed {
  const survivors = new Map(regiments.map((r, i) => [r.id, { ...r, soldiers: left[i], movementLeft: 0 }]));

  // Take everyone who fought off the map; regiments that didn't fight stay.
  const armies = { ...state.armies };
  for (const side of group) {
    const fought = new Set(side.regiments.map((r) => r.id));
    const kept = side.army.regiments.filter((r) => !fought.has(r.id));
    if (kept.length > 0) armies[side.army.id] = { ...side.army, regiments: kept };
    else delete armies[side.army.id];
  }
  let next: GameState = { ...state, armies };

  // Decide where each army goes, placing them one at a time so they share
  // the room on any tile.
  const placed: { side: BattleSide; tile: TileId; regiments: Regiment[] }[] = [];
  for (const side of group) {
    const alive = side.regiments.map((r) => survivors.get(r.id)!).filter((r) => r.soldiers > 0);
    if (alive.length === 0) continue;
    const home = cityAt(state, side.army.tile);
    let tile: TileId | null;
    if (home && home.owner === side.army.owner) {
      // In its own city: a stormed or besieged garrison is trapped; any other falls back inside.
      tile = side.army.tile === stormed || home.besiegedBy ? null : side.army.tile;
      const there = armyAt(next, side.army.tile);
      if (tile && there && there.regiments.length + alive.length > ARMY_RULES.maxRegiments) tile = null;
    } else {
      tile = fleeTile(ctx, next, side.army.owner, side.army.tile, alive.length, enemy, stormed);
    }
    if (!tile) continue;
    next = placeRegiments(next, side.army, tile, alive);
    placed.push({ side, tile, regiments: alive });
  }

  // The rout: losses on the way, spread over everyone who got away.
  const away = placed.flatMap((p) => p.regiments);
  const fleeing = away.reduce((sum, r) => sum + r.soldiers, 0);
  const spread = spreadLosses(away.map((r) => r.soldiers), routLosses(fleeing, winners)).map((n, i) => scatter(away[i], n));
  const after = new Map(away.map((r, i) => [r.id, spread[i]]));
  const armiesAfter = { ...next.armies };
  for (const army of Object.values(next.armies)) {
    if (!army.regiments.some((r) => after.has(r.id))) continue;
    const kept = army.regiments.flatMap((r) => {
      const n = after.get(r.id);
      return n === undefined ? [r] : n > 0 ? [{ ...r, soldiers: n }] : [];
    });
    if (kept.length > 0) armiesAfter[army.id] = { ...army, regiments: kept };
    else delete armiesAfter[army.id];
  }

  const total = regiments.reduce((sum, r) => sum + r.soldiers, 0);
  const kept = spread.reduce((sum, n) => sum + n, 0);
  return { state: { ...next, armies: armiesAfter }, losses: total - kept, fled: kept > 0 };
}

/** What's left of a fleeing regiment: nothing if it's down to less than COMBAT.scatterBelow of a full one. */
function scatter(regiment: Troops, soldiers: number): number {
  return soldiers < regimentSize(regiment.unit) * COMBAT.scatterBelow ? 0 : soldiers;
}

/** Puts regiments on a tile: into the owner's army there, or as the given army if its id is free, or as a new army. */
function placeRegiments(state: GameState, army: Army, tile: TileId, regiments: Regiment[]): GameState {
  const host = Object.values(state.armies).find((a) => a.tile === tile && a.owner === army.owner);
  if (host) return { ...state, armies: { ...state.armies, [host.id]: { ...host, regiments: [...host.regiments, ...regiments] } } };
  if (!state.armies[army.id]) {
    return { ...state, armies: { ...state.armies, [army.id]: { ...army, tile, destination: null, regiments } } };
  }
  return placeNewArmy(state, army.owner, tile, regiments);
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
  const result = resolveBattle(fighting, holding, battlefieldAt(state, target), rng);

  // The winners' survivors go back to their own armies.
  const armies = { ...state.armies };
  const settle = (group: BattleSide[], regiments: Regiment[], left: number[]) => {
    const survivors = new Map(regiments.flatMap((r, i) => (left[i] > 0 ? [[r.id, { ...r, soldiers: left[i] }] as const] : [])));
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
  const won = result.attackerWins;
  if (won) settle(sides, fighting, result.attackerSoldiers);
  else settle(defending, holding, result.defenderSoldiers);
  const winners = won
    ? fighting.map((r, i) => ({ ...r, soldiers: result.attackerSoldiers[i] }))
    : holding.map((r, i) => ({ ...r, soldiers: result.defenderSoldiers[i] }));

  // The losers are routed: they flee, or fight to the death.
  const city = cityAt(state, target);
  const routed = won
    ? rout(ctx, { ...state, armies }, defending, holding, result.defenderSoldiers, winners, army.tile, city ? target : null)
    : rout(ctx, { ...state, armies }, sides, fighting, result.attackerSoldiers, winners, target, null);
  const attackerLosses = won ? result.attackerLosses : routed.losses;
  const defenderLosses = won ? routed.losses : result.defenderLosses;

  const defenderName = getFaction(state, defender.owner)?.shortName ?? "Unknown";
  const joined = sides.length > 1 ? ` from ${sides.length} armies` : "";
  const helped = defending.length > 1 ? ` from ${defending.length} armies` : "";
  const flight = routed.fled ? `They fled, losing ${fmt(routed.losses)}.` : "They fought to the death.";
  const report = won
    ? `${possessive(attackerName)} ${describeRegiments(fighting)}${joined} defeated ${possessive(defenderName)} ` +
      `${describeRegiments(holding)}${helped} ${placeName(state, target)}, losing ${fmt(attackerLosses)}. ${flight}`
    : `${possessive(defenderName)} ${describeRegiments(holding)}${helped} repelled ${possessive(attackerName)} ` +
      `${describeRegiments(fighting)}${joined} ${placeName(state, target)}, losing ${fmt(defenderLosses)}. ${flight}`;

  let afterBattle = addLog({ ...routed.state, rngState: rng.state }, report, {
    kind: "battle",
    factions: [army.owner, defender.owner],
  });

  // Won a siege: the garrison fought to the death, so the leading army's survivors take the city.
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
    attackerLosses,
    defenderLosses,
    attackerWon: won,
    loserFled: routed.fled,
    defenseBonus: defenseBonusAt(state, target),
    rounds: result.rounds,
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

export interface BattleOdds {
  /** 0 to 1. */
  winChance: number;
  /** Soldiers the attackers lose, on average, in the battles they win. */
  lossesIfWin: number;
  /** Soldiers the defenders lose, on average, in the battles they hold. */
  defenderLossesIfHold: number;
  /** Soldiers the attackers lose, on average, when beaten: the battle, the rout, and any that can't flee. */
  lossesIfBeaten: number;
  /** The same for the defenders. */
  defenderLossesIfBeaten: number;
}

/** Which regiments on each side could get away if beaten (see escapes). All of them if not given. */
export interface Escapes {
  attackers: readonly boolean[];
  defenders: readonly boolean[];
}

/**
 * Estimates the odds by fighting the battle out COMBAT.previewBattles times
 * with dice seeded from `seed`, so the same situation always shows the same
 * odds. A beaten side loses its regiments that can't get away, and the rout
 * from the rest. Where one side never wins (or never loses), its losses are
 * taken as the most a winner can lose (or the least a loser can): up to the
 * break point.
 */
export function estimateBattle(
  attackers: readonly Troops[],
  defenders: readonly Troops[],
  field: Battlefield,
  seed: number,
  escapes?: Escapes,
): BattleOdds {
  const rng = createRng(seed ^ 0x5bd1e995);
  const away = {
    attackers: escapes?.attackers ?? attackers.map(() => true),
    defenders: escapes?.defenders ?? defenders.map(() => true),
  };
  /** A beaten side's losses: everyone who can't flee, and the rout from those who do. */
  const beaten = (side: readonly Troops[], left: readonly number[], free: readonly boolean[], winners: readonly Troops[]) => {
    const fleeing = side.flatMap((_, i) => (free[i] ? [i] : []));
    const survivors = fleeing.map((i) => left[i]);
    const total = survivors.reduce((sum, n) => sum + n, 0);
    const after = spreadLosses(survivors, routLosses(total, winners)).map((n, j) => scatter(side[fleeing[j]], n));
    const kept = after.reduce((sum, n) => sum + n, 0);
    return side.reduce((sum, t) => sum + t.soldiers, 0) - kept;
  };
  const withSoldiers = (side: readonly Troops[], left: readonly number[]) => side.map((t, i) => ({ ...t, soldiers: left[i] }));

  let wins = 0;
  const sum = { winLosses: 0, holdLosses: 0, beaten: 0, defenderBeaten: 0 };
  for (let i = 0; i < COMBAT.previewBattles; i++) {
    const r = resolveBattle(attackers, defenders, field, rng);
    if (r.attackerWins) {
      wins++;
      sum.winLosses += r.attackerLosses;
      sum.defenderBeaten += beaten(defenders, r.defenderSoldiers, away.defenders, withSoldiers(attackers, r.attackerSoldiers));
    } else {
      sum.holdLosses += r.defenderLosses;
      sum.beaten += beaten(attackers, r.attackerSoldiers, away.attackers, withSoldiers(defenders, r.defenderSoldiers));
    }
  }
  const holds = COMBAT.previewBattles - wins;
  const share = (side: readonly Troops[], k: number) => side.map((t) => Math.round(t.soldiers * k));
  const mostLost = (side: readonly Troops[]) => Math.round(side.reduce((total, t) => total + t.soldiers, 0) * COMBAT.breakPoint);
  return {
    winChance: wins / COMBAT.previewBattles,
    lossesIfWin: wins > 0 ? Math.round(sum.winLosses / wins) : mostLost(attackers),
    defenderLossesIfHold: holds > 0 ? Math.round(sum.holdLosses / holds) : mostLost(defenders),
    lossesIfBeaten: holds > 0
      ? Math.round(sum.beaten / holds)
      : beaten(attackers, share(attackers, 1 - COMBAT.breakPoint), away.attackers, share(defenders, 1 - COMBAT.breakPoint).map((n, i) => ({ ...defenders[i], soldiers: n }))),
    defenderLossesIfBeaten: wins > 0
      ? Math.round(sum.defenderBeaten / wins)
      : beaten(defenders, share(defenders, 1 - COMBAT.breakPoint), away.defenders, share(attackers, 1 - COMBAT.breakPoint).map((n, i) => ({ ...attackers[i], soldiers: n }))),
  };
}

/**
 * Which of a side's regiments would get away if it were beaten here: the
 * battle's rout played out with every soldier alive and no pursuit, to see
 * who finds somewhere to flee.
 */
function escapes(
  ctx: GameContext,
  state: GameState,
  group: readonly BattleSide[],
  enemy: TileId,
  stormed: TileId | null,
): boolean[] {
  const regiments = group.flatMap((s) => s.regiments);
  const routed = rout(ctx, state, group, regiments, regiments.map((r) => r.soldiers), [], enemy, stormed);
  const alive = new Set(Object.values(routed.state.armies).flatMap((a) => a.regiments.map((r) => r.id)));
  return regiments.map((r) => alive.has(r.id));
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
  /** 0 to 1, estimated by fighting the battle out many times (see estimateBattle). */
  winChance: number;
  /** Soldiers we'd likely lose if we win. */
  lossesIfWin: number;
  /** Soldiers the defender would likely lose if it wins. */
  defenderLossesIfHold: number;
  /** Soldiers we'd likely lose if beaten, rout included. */
  lossesIfBeaten: number;
  /** Soldiers the defender would likely lose if beaten, rout included. */
  defenderLossesIfBeaten: number;
  /** Whether any of us could flee if beaten; otherwise we'd fight to the death. */
  attackersCanFlee: boolean;
  /** Whether any of the defenders could flee if beaten. */
  defendersCanFlee: boolean;
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
  const field = battlefieldAt(staged, target);
  const away: Escapes = {
    attackers: escapes(ctx, staged, sides.attackers, target, null),
    defenders: escapes(ctx, staged, sides.defenders, lead.tile, city ? target : null),
  };
  const odds = estimateBattle(attackers, defenders, field, staged.rngState, away);

  return {
    attackers,
    armies: sides.attackers.length,
    defender,
    defenders,
    defendingArmies: sides.defenders.length,
    terrainBonus,
    cityBonus,
    strength: battleStrength(attackers, defenders, field),
    ...odds,
    attackersCanFlee: away.attackers.some(Boolean),
    defendersCanFlee: away.defenders.some(Boolean),
    place: placeName(staged, target),
    cityAtStake: city && city.owner !== army.owner ? city.name : null,
  };
}
