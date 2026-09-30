import type { GameContext } from "@/core/context.js";
import {
  currentFaction,
  type ArmyId,
  type CityId,
  type FactionId,
  type GameState,
  type RegimentId,
} from "@/core/state.js";
import { TAX_RATES, type TaxRate } from "@/data/economy.js";
import type { UnitType } from "@/data/units.js";
import type { TileId } from "@/map/topology.js";
import {
  canMarch,
  canMove,
  armyHolding,
  canMerge,
  cancelMarch,
  mergeRegiments,
  march,
  moveRegiments,
} from "@/systems/armies.js";
import { attack, canAttack } from "@/systems/combat.js";
import { besiege, canBesiege, canLiftSiege, liftSiege } from "@/systems/siege.js";
import { canBuild, cancelConstruction, queueConstruction } from "@/systems/buildings.js";
import {
  canRetrain,
  canTrain,
  cancelRecruitOrder,
  dropStrayRetraining,
  queueRetraining,
  queueTraining,
} from "@/systems/recruitment.js";
import { canSettle, settleCity, unsettledCities } from "@/systems/conquest.js";
import type { SettlementChoice } from "@/data/conquest.js";
import type { BuildingType } from "@/data/buildings.js";
import { endTurn } from "@/systems/turn.js";

/** Everything a player (human or AI) can do. */
export type Action =
  | { type: "endTurn" }
  /** Queues a regiment of 100 for training in a city. It joins the army there when it's done. */
  | { type: "trainRegiment"; cityId: CityId; unit: UnitType }
  /** Takes an order out of a city's recruitment queue, refunding it. */
  | { type: "cancelRecruit"; cityId: CityId; index: number }
  /** Moves some or all of an army's regiments. Moving only some splits the army. */
  | { type: "moveArmy"; armyId: ArmyId; regimentIds: RegimentId[]; to: TileId }
  /**
   * Some or all of an army's regiments attack a tile. With `via`, they march
   * to that tile first (it must be next to the target) and attack from there.
   */
  | { type: "attack"; armyId: ArmyId; regimentIds: RegimentId[]; target: TileId; via?: TileId }
  /** Sends some or all of an army's regiments marching to a tile over several turns. */
  | { type: "march"; armyId: ArmyId; regimentIds: RegimentId[]; destination: TileId }
  /** Stops an army's march. */
  | { type: "cancelMarch"; armyId: ArmyId }
  /** Combines an army's damaged regiments of the same type into as few as possible. */
  | { type: "mergeRegiments"; armyId: ArmyId }
  /** Queues regiments in the army standing in one of your cities for retraining back to full strength. */
  | { type: "replenish"; cityId: CityId; regimentIds: RegimentId[] }
  /** Calls off your siege of a city. */
  | { type: "liftSiege"; cityId: CityId }
  /** Decides the fate of a city you've just taken. */
  | { type: "settleCity"; cityId: CityId; choice: SettlementChoice }
  /** Starts building the next level of a building in a city. */
  | { type: "build"; cityId: CityId; building: BuildingType }
  /** Takes a building out of a city's construction queue, refunding it (and anything that depended on it). */
  | { type: "cancelConstruction"; cityId: CityId; index: number }
  /** Sets a city's tax rate. */
  | { type: "setTaxRate"; cityId: CityId; rate: TaxRate }
  /**
   * An army puts an enemy city under siege. With `via`, the chosen regiments
   * (or the whole army) first march to that tile, which must be next to the city.
   */
  | { type: "besiege"; armyId: ArmyId; target: TileId; regimentIds?: RegimentId[]; via?: TileId };

export type ActionResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: string };

/**
 * The single entry point for changing the game. Validates that the action is
 * allowed for this faction right now, and returns a new state rather than
 * modifying the old one.
 */
export function applyAction(ctx: GameContext, state: GameState, factionId: FactionId, action: Action): ActionResult {
  const result = perform(ctx, state, factionId, action);
  // Regiments that left a city (or were lost) drop out of its retraining queue at once, refunded.
  return result.ok ? { ok: true, state: dropStrayRetraining(result.state) } : result;
}

function perform(ctx: GameContext, state: GameState, factionId: FactionId, action: Action): ActionResult {
  const current = currentFaction(state);
  if (current.id !== factionId) {
    return { ok: false, reason: `It is ${current.name}'s turn.` };
  }

  switch (action.type) {
    case "endTurn": {
      // A city just taken must have its fate decided first.
      const waiting = unsettledCities(state, factionId)[0];
      if (waiting) return { ok: false, reason: `Decide the fate of ${waiting.name} before ending your turn.` };
      return { ok: true, state: endTurn(ctx, state) };
    }

    case "trainRegiment": {
      const check = canTrain(state, factionId, action.cityId, action.unit);
      if (!check.ok) return check;
      return { ok: true, state: queueTraining(state, factionId, action.cityId, action.unit) };
    }

    case "cancelRecruit": {
      const city = state.cities[action.cityId];
      if (!city || city.owner !== factionId) return { ok: false, reason: "That city isn't yours." };
      if (!city.recruitQueue[action.index]) return { ok: false, reason: "There's no such order in the queue." };
      return { ok: true, state: cancelRecruitOrder(state, factionId, action.cityId, action.index) };
    }

    case "moveArmy": {
      const check = canMove(ctx, state, factionId, action.armyId, action.regimentIds, action.to);
      if (!check.ok) return check;
      return { ok: true, state: moveRegiments(ctx, state, action.armyId, action.regimentIds, action.to) };
    }

    case "attack": {
      const check = canAttack(ctx, state, factionId, action.armyId, action.regimentIds, action.target, action.via);
      if (!check.ok) return check;
      return { ok: true, state: attack(ctx, state, action.armyId, action.regimentIds, action.target, action.via) };
    }

    case "march": {
      const check = canMarch(ctx, state, factionId, action.armyId, action.regimentIds, action.destination);
      if (!check.ok) return check;
      return { ok: true, state: march(ctx, state, action.armyId, action.regimentIds, action.destination) };
    }

    case "cancelMarch": {
      const army = state.armies[action.armyId];
      if (!army || army.owner !== factionId) return { ok: false, reason: "That army isn't yours." };
      return { ok: true, state: cancelMarch(state, action.armyId) };
    }

    case "mergeRegiments": {
      const army = state.armies[action.armyId];
      if (!army || army.owner !== factionId) return { ok: false, reason: "That army isn't yours." };
      if (!canMerge(army)) return { ok: false, reason: "There are no regiments of the same type to merge." };
      return { ok: true, state: mergeRegiments(state, action.armyId) };
    }

    case "replenish": {
      const check = canRetrain(state, factionId, action.cityId, action.regimentIds);
      if (!check.ok) return check;
      return { ok: true, state: queueRetraining(state, factionId, action.cityId, action.regimentIds) };
    }

    case "settleCity": {
      const check = canSettle(state, factionId, action.cityId);
      if (!check.ok) return check;
      return { ok: true, state: settleCity(state, factionId, action.cityId, action.choice) };
    }

    case "build": {
      const check = canBuild(state, factionId, action.cityId, action.building);
      if (!check.ok) return check;
      return { ok: true, state: queueConstruction(state, factionId, action.cityId, action.building) };
    }

    case "cancelConstruction": {
      const city = state.cities[action.cityId];
      if (!city || city.owner !== factionId) return { ok: false, reason: "That city isn't yours." };
      if (!city.constructionQueue[action.index]) return { ok: false, reason: "There's no such building in the queue." };
      return { ok: true, state: cancelConstruction(state, factionId, action.cityId, action.index) };
    }

    case "liftSiege": {
      const check = canLiftSiege(state, factionId, action.cityId);
      if (!check.ok) return check;
      return { ok: true, state: liftSiege(state, factionId, action.cityId) };
    }

    case "setTaxRate": {
      const city = state.cities[action.cityId];
      if (!city || city.owner !== factionId) return { ok: false, reason: "That city isn't yours." };
      if (!(action.rate in TAX_RATES)) return { ok: false, reason: "Unknown tax rate." };
      return { ok: true, state: { ...state, cities: { ...state.cities, [city.id]: { ...city, taxRate: action.rate } } } };
    }

    case "besiege": {
      let next = state;
      let armyId = action.armyId;
      const army = state.armies[armyId];
      if (army && action.via && action.via !== army.tile) {
        const ids = action.regimentIds ?? army.regiments.map((r) => r.id);
        const move = canMove(ctx, next, factionId, armyId, ids, action.via);
        if (!move.ok) return move;
        next = moveRegiments(ctx, next, armyId, ids, action.via);
        armyId = armyHolding(next, ids[0])!.id;
      }
      const check = canBesiege(ctx, next, factionId, armyId, action.target);
      if (!check.ok) return check;
      return { ok: true, state: besiege(next, factionId, action.target) };
    }

    default: {
      // A compile error here means a new Action type isn't handled yet.
      const unhandled: never = action;
      return { ok: false, reason: `Unknown action ${JSON.stringify(unhandled)}` };
    }
  }
}
