import type { BuildingType } from "@/data/buildings.js";
import type { TaxRate } from "@/data/economy.js";
import type { Tier, UnitType } from "@/data/units.js";
import type { TileDataMap } from "@/map/tiles.js";
import type { TileId } from "@/map/topology.js";

export type FactionId = string;
export type CityId = string;
export type ArmyId = string;
export type RegimentId = string;

export interface Faction {
  id: FactionId;
  name: string;
  shortName: string;
  /** Used for borders, markers and UI. */
  color: string;
  controller: "human" | "ai";
  alive: boolean;
  gold: number;
}

export interface City {
  id: CityId;
  name: string;
  owner: FactionId;
  tile: TileId;
  /** Number of people living in the city and its territory. */
  population: number;
  foundedTurn: number;
  isCapital: boolean;
  /** Turns of food left for a siege. Used up while besieged, restocked otherwise. */
  supplies: number;
  /** The faction besieging this city, if any. */
  besiegedBy: FactionId | null;
  /**
   * Regiments to train and regiments to retrain, in order. The city completes
   * one order at the end of each of its owner's turns.
   */
  recruitQueue: RecruitOrder[];
  /** Higher taxes bring in more gold but slow population growth. */
  taxRate: TaxRate;
  /** Level of each building (0 = not built). The government's level is the city's level. */
  buildings: Record<BuildingType, number>;
  /** Buildings to build, in order. The first is under construction; the rest wait their turn. */
  constructionQueue: Construction[];
  /** Just captured, and its conqueror hasn't yet chosen its fate (occupy, enslave or exterminate). */
  unsettled: boolean;
  /** Sea tiles within its reach: fishing grounds that add to its capacity and growth. Set when it's founded. */
  fishingGrounds: number;
  /**
   * Sea it can build a port on: its fishing grounds, plus any sea touching
   * its land further out. Set once every city has claimed its land.
   */
  coast: number;
}

/** An order in a city's recruitment queue, paid for when it was queued. */
export type RecruitOrder =
  | { kind: "train"; unit: UnitType; tier: Tier; cost: number }
  | { kind: "retrain"; unit: UnitType; regimentId: RegimentId; soldiers: number; cost: number };

export interface Construction {
  building: BuildingType;
  /** The level it will reach. */
  level: number;
  turnsLeft: number;
  /** Gold paid, refunded if it's cancelled. */
  cost: number;
}

/** Which faction, and which of its cities, a tile belongs to. */
export interface TileClaim {
  owner: FactionId;
  cityId: CityId;
}

/** Soldiers of one unit type, trained together. */
export interface Regiment {
  id: RegimentId;
  unit: UnitType;
  /** Basic, advanced or elite, fixed when it's trained (see TIERS in data/units.ts). */
  tier: Tier;
  soldiers: number;
  /** Movement points left this turn. Refilled at the start of the owner's turn. */
  movementLeft: number;
  /**
   * Moved into an enemy army's zone of control this turn: it must stop there
   * and can't move again until the owner's next turn, though it can still attack.
   */
  pinned: boolean;
}

/** A stack of regiments on one tile. At most one army per tile. */
export interface Army {
  id: ArmyId;
  owner: FactionId;
  tile: TileId;
  regiments: Regiment[];
  /** Where the army is marching over several turns, if anywhere. */
  destination: TileId | null;
}

/** Soldiers of each unit type, e.g. { spearmen: 300, cavalry: 100 }. */
export type Forces = Partial<Record<UnitType, number>>;

/** What happened in one battle, kept so the player can be shown the result. */
export interface BattleReport {
  id: number;
  turn: number;
  tile: TileId;
  /** e.g. "at Vostgrad", "near Vostgrad", "in the hills". */
  place: string;
  attacker: FactionId;
  defender: FactionId;
  /** How many of the attacker's armies fought together. */
  attackingArmies: number;
  /** How many of the defender's armies fought together. */
  defendingArmies: number;
  attackerForces: Forces;
  defenderForces: Forces;
  attackerLosses: number;
  defenderLosses: number;
  attackerWon: boolean;
  /** The defender's terrain, city and walls bonus, e.g. 0.55 = +55%. */
  defenseBonus: number;
  /** Rounds fought before one side broke. */
  rounds: number;
  /** The city taken, if the attackers won a battle for one. */
  cityCaptured: string | null;
}

/** A line in the game's event log, e.g. a battle report. */
/** What a log entry is about, for its icon in the reports. */
export type LogKind = "battle" | "siege" | "city" | "construction" | "recruitment" | "war";

export interface LogEntry {
  /** Increasing with each entry, so the reports can tell which are new. */
  id: number;
  turn: number;
  text: string;
  kind: LogKind;
  /** The factions it concerns: they're told about it. */
  factions: FactionId[];
  /** World news everyone hears about: a city changing hands, a faction falling. */
  major: boolean;
}

/**
 * Everything needed to describe a game in progress. Plain data only (no
 * classes, Maps or functions) so it can be saved as JSON in Phase 7.
 *
 * The map topology is not stored here: it lives in GameContext, rebuilt from
 * the map engine and mapSeed, and never changes during a game.
 */
export interface GameState {
  turn: number;
  /** In turn order. */
  factions: Faction[];
  currentFactionIndex: number;
  tiles: TileDataMap;
  /** Claimed tiles only. Unclaimed tiles have no entry. */
  territory: Record<TileId, TileClaim>;
  cities: Record<CityId, City>;
  armies: Record<ArmyId, Army>;
  /** Used to give each new city and army a unique id. */
  nextCityNumber: number;
  nextArmyNumber: number;
  nextRegimentNumber: number;
  /** Most recent events, oldest first. */
  log: LogEntry[];
  nextLogNumber: number;
  /** Most recent battles, oldest first. */
  battles: BattleReport[];
  nextBattleNumber: number;
  mapSeed: number;
  /** State of the game's RNG. Resume it with createRng(rngState). */
  rngState: number;
}

/** Whether something is allowed, and if not, a reason to show the player. */
export type Check = { ok: true } | { ok: false; reason: string };

const MAX_LOG_ENTRIES = 400;

export function currentFaction(state: GameState): Faction {
  return state.factions[state.currentFactionIndex];
}

export function getFaction(state: GameState, id: FactionId): Faction | undefined {
  return state.factions.find((f) => f.id === id);
}

/** Returns a new state with one faction replaced by update(faction). */
export function updateFaction(state: GameState, id: FactionId, update: (f: Faction) => Faction): GameState {
  return { ...state, factions: state.factions.map((f) => (f.id === id ? update(f) : f)) };
}

export function citiesOf(state: GameState, factionId: FactionId): City[] {
  return Object.values(state.cities).filter((c) => c.owner === factionId);
}

export function cityAt(state: GameState, tile: TileId): City | undefined {
  return Object.values(state.cities).find((c) => c.tile === tile);
}

export function armiesOf(state: GameState, factionId: FactionId): Army[] {
  return Object.values(state.armies).filter((a) => a.owner === factionId);
}

export function armyAt(state: GameState, tile: TileId): Army | undefined {
  return Object.values(state.armies).find((a) => a.tile === tile);
}

export function armySoldiers(army: Army): number {
  return army.regiments.reduce((sum, r) => sum + r.soldiers, 0);
}

/** Adds a line to the event log, keeping only the most recent entries. */
/** Adds an entry to the log: what happened, what kind of thing it was, and who it concerns. */
export function addLog(
  state: GameState,
  text: string,
  about: { kind: LogKind; factions: readonly FactionId[]; major?: boolean },
): GameState {
  const entry: LogEntry = {
    id: state.nextLogNumber,
    turn: state.turn,
    text,
    kind: about.kind,
    factions: [...new Set(about.factions)],
    major: about.major ?? false,
  };
  return { ...state, log: [...state.log, entry].slice(-MAX_LOG_ENTRIES), nextLogNumber: state.nextLogNumber + 1 };
}
