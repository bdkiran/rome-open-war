/** Sieges: a garrison is shut in, a beaten siege ends at once, and a city restocks fully when one ends. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAction } from "@/core/actions.js";
import type { GameContext } from "@/core/context.js";
import { createGame } from "@/core/setup.js";
import { armyAt, type Army, type GameState } from "@/core/state.js";
import { ROMAN_WORLD } from "@/data/scenarios/romanWorld.js";
import { regimentSize } from "@/data/units.js";
import { attackOptions, reachableTiles, SHUT_IN } from "@/systems/armies.js";
import { assess } from "@/ai/assess.js";
import { maxSupplies } from "@/systems/siege.js";

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
        regiments: [{ id: "besieger", unit: "spearmen", tier: 1, soldiers: regimentSize("spearmen"), movementLeft: 12, pinned: false }],
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

  it("can't be used to stage an attack on anyone else by marching in", () => {
    const { ctx, state: besieged, besiegerTile } = romaBesieged();
    const roma = Object.values(besieged.cities).find((c) => c.name === "Roma")!;
    const around = ctx.topology.neighbors(roma.tile).filter((t) => t !== besiegerTile && !ctx.topology.neighbors(t).includes(besiegerTile));
    // Two tiles beside Roma, not next to each other: a Macedonian army on one, our field army on the other.
    const outsider = around.find((t) => around.some((u) => u !== t && !ctx.topology.neighbors(u).includes(t)))!;
    const far = around.find((u) => u !== outsider && !ctx.topology.neighbors(u).includes(outsider))!;
    // Both on open ground, and only Roma next to the Macedonians: everything else around them is sea.
    const tiles = { ...besieged.tiles };
    for (const t of [outsider, far]) tiles[t] = { ...tiles[t], terrain: "plains" as const };
    for (const t of ctx.topology.neighbors(outsider)) if (t !== roma.tile) tiles[t] = { ...tiles[t], terrain: "water" as const };
    const reg = (id: string) => ({ id, unit: "spearmen" as const, tier: 1 as const, soldiers: regimentSize("spearmen"), movementLeft: 12, pinned: false });
    const state = {
      ...besieged,
      tiles,
      armies: {
        ...besieged.armies,
        stranger: { id: "stranger", owner: "macedon", tile: outsider, destination: null, regiments: [reg("s1")] },
        field: { id: "field", owner: "rome", tile: far, destination: null, regiments: [reg("f1")] },
      },
    };
    assert.ok(reachableTiles(ctx, state, state.armies.field, ["f1"]).has(roma.tile), "the field army can march into Roma");
    assert.equal(attackOptions(ctx, state, state.armies.field, ["f1"]).has(outsider), false, "attacked the Macedonians from inside besieged Roma");
  });

  it("can still attack its besiegers", () => {
    const { ctx, state, garrison, besiegerTile } = romaBesieged();
    const targets = attackOptions(ctx, state, garrison, garrison.regiments.map((r) => r.id));
    assert.deepEqual([...targets.keys()], [besiegerTile]);
  });
});

describe("the AI's siege target", () => {
  it("sticks to a city its field army is camped next to, even when another looks cheaper", () => {
    const map = ROMAN_WORLD.mapEngine.createMap();
    const ctx: GameContext = { topology: map.topology };
    let state = createGame(ctx, map, ROMAN_WORLD);
    const roma = Object.values(state.cities).find((c) => c.name === "Roma")!;
    const camp = ctx.topology.neighbors(roma.tile).find((t) => map.tiles[t].terrain !== "water" && !armyAt(state, t))!;
    const reg = (id: string) => ({ id, unit: "spearmen" as const, tier: 1 as const, soldiers: regimentSize("spearmen"), movementLeft: 12, pinned: false });
    // Roma is strongly held; Carthage's army stands next to it.
    const garrison = armyAt(state, roma.tile)!;
    state = {
      ...state,
      armies: {
        ...state.armies,
        [garrison.id]: { ...garrison, regiments: Array.from({ length: 8 }, (_, i) => reg(`g${i}`)) },
        camp: { id: "camp", owner: "carthage", tile: camp, destination: null, regiments: [reg("c1"), reg("c2"), reg("c3")] },
      },
    };
    assert.equal(assess(ctx, state, "carthage").target?.name, "Roma");
  });
});

describe("the end of a siege", () => {
  /** Roma besieged and down to its last turn of supplies, with Roma's garrison 8 strong regiments. */
  function lastTurn() {
    const setup = romaBesieged();
    const roma = Object.values(setup.state.cities).find((c) => c.name === "Roma")!;
    const reg = (id: string) => ({ id, unit: "spearmen" as const, tier: 3 as const, soldiers: regimentSize("spearmen"), movementLeft: 12, pinned: false });
    const state: GameState = {
      ...setup.state,
      cities: { ...setup.state.cities, [roma.id]: { ...roma, supplies: 1 } },
      armies: { ...setup.state.armies, [setup.garrison.id]: { ...setup.garrison, regiments: Array.from({ length: 8 }, (_, i) => reg(`g${i}`)) } },
    };
    const carthage = state.factions.findIndex((f) => f.id === "carthage");
    return { ...setup, roma, state, carthage };
  }

  it("is broken by a failed storm, so the city doesn't surrender that turn", () => {
    const { ctx, state, roma, carthage } = lastTurn();
    let next: GameState = { ...state, currentFactionIndex: carthage };
    const storm = applyAction(ctx, next, "carthage", { type: "attack", armyId: "besiegers", regimentIds: ["besieger"], target: roma.tile });
    assert.ok(storm.ok);
    next = storm.state;
    assert.equal(next.battles[next.battles.length - 1].attackerWon, false);
    assert.equal(next.cities[roma.id].besiegedBy, null, "the siege is broken");
    assert.equal(next.cities[roma.id].supplies, maxSupplies(next.cities[roma.id]), "and the city restocked");
    const ended = applyAction(ctx, next, "carthage", { type: "endTurn" });
    assert.ok(ended.ok);
    assert.equal(ended.state.cities[roma.id].owner, "rome", "Roma held");
    assert.ok(armyAt(ended.state, roma.tile), "its garrison survived");
  });

  it("is broken when the garrison sallies and beats the besiegers", () => {
    const { ctx, state, roma, garrison, besiegerTile } = lastTurn();
    const ids = state.armies[garrison.id].regiments.map((r) => r.id);
    const sally = applyAction(ctx, state, "rome", { type: "attack", armyId: garrison.id, regimentIds: ids, target: besiegerTile });
    assert.ok(sally.ok);
    assert.equal(sally.state.battles[sally.state.battles.length - 1].attackerWon, true);
    assert.equal(sally.state.cities[roma.id].besiegedBy, null);
  });

  it("refills the city's supplies when lifted, so a new siege starts from full", () => {
    const { ctx, state, roma, carthage } = lastTurn();
    const lifted = applyAction(ctx, { ...state, currentFactionIndex: carthage }, "carthage", { type: "liftSiege", cityId: roma.id });
    assert.ok(lifted.ok);
    assert.equal(lifted.state.cities[roma.id].supplies, maxSupplies(roma));
  });
});
