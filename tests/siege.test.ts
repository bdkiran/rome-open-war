/** A besieged garrison is shut in: it can attack its besiegers, and nothing else. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAction } from "@/core/actions.js";
import type { GameContext } from "@/core/context.js";
import { createGame } from "@/core/setup.js";
import { armyAt, type Army, type GameState } from "@/core/state.js";
import { ROMAN_WORLD } from "@/data/scenarios/romanWorld.js";
import { regimentSize } from "@/data/units.js";
import { attackOptions, reachableTiles, SHUT_IN } from "@/systems/armies.js";

/** A new game with Roma besieged by a Carthaginian army standing next to it. */
function romaBesieged(): { ctx: GameContext; state: GameState; garrison: Army; besiegerTile: string } {
  const map = ROMAN_WORLD.mapEngine.createMap();
  const ctx: GameContext = { topology: map.topology };
  let state = createGame(ctx, map, ROMAN_WORLD);
  const roma = Object.values(state.cities).find((c) => c.name === "Roma")!;
  const besiegerTile = ctx.topology
    .neighbors(roma.tile)
    .find((t) => map.tiles[t].terrain !== "water" && !armyAt(state, t))!;
  state = {
    ...state,
    cities: { ...state.cities, [roma.id]: { ...roma, besiegedBy: "carthage" } },
    armies: {
      ...state.armies,
      besiegers: {
        id: "besiegers",
        owner: "carthage",
        tile: besiegerTile,
        destination: null,
        regiments: [{ id: "besieger", unit: "spearmen", soldiers: regimentSize("spearmen"), movementLeft: 12, pinned: false }],
      },
    },
  };
  return { ctx, state, garrison: armyAt(state, roma.tile)!, besiegerTile };
}

describe("a besieged garrison", () => {
  it("can't move, split off or march out", () => {
    const { ctx, state, garrison } = romaBesieged();
    const ids = garrison.regiments.map((r) => r.id);
    assert.equal(reachableTiles(ctx, state, garrison, ids).size, 0);

    const away = ctx.topology.neighbors(garrison.tile).find((t) => state.tiles[t].terrain !== "water" && !armyAt(state, t))!;
    const move = applyAction(ctx, state, "rome", { type: "moveArmy", armyId: garrison.id, regimentIds: ids.slice(0, 1), to: away });
    assert.deepEqual(move, { ok: false, reason: SHUT_IN });

    const carthago = Object.values(state.cities).find((c) => c.name === "Carthago")!;
    const march = applyAction(ctx, state, "rome", { type: "march", armyId: garrison.id, regimentIds: ids, destination: carthago.tile });
    assert.deepEqual(march, { ok: false, reason: SHUT_IN });
  });

  it("can still attack its besiegers", () => {
    const { ctx, state, garrison, besiegerTile } = romaBesieged();
    const targets = attackOptions(ctx, state, garrison, garrison.regiments.map((r) => r.id));
    assert.deepEqual([...targets.keys()], [besiegerTile]);
  });
});
