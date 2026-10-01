/**
 * A beaten side flees up to three tiles, losing more on the way, unless it
 * has nowhere to go: then it fights to the death.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAction } from "@/core/actions.js";
import type { GameContext } from "@/core/context.js";
import { createGame } from "@/core/setup.js";
import { armyAt, cityAt, type Army, type GameState, type Regiment } from "@/core/state.js";
import { COMBAT } from "@/data/combat.js";
import { ROMAN_WORLD } from "@/data/scenarios/romanWorld.js";
import { TERRAIN } from "@/data/terrain.js";
import { regimentSize, type Tier, type UnitType } from "@/data/units.js";
import { fleeTile, routLosses } from "@/systems/combat.js";

const map = ROMAN_WORLD.mapEngine.createMap();
const ctx: GameContext = { topology: map.topology };
const topo = ctx.topology;

/** A new game with no armies on the map. Rome moves first. */
function emptyGame(): GameState {
  return { ...createGame(ctx, map, ROMAN_WORLD), armies: {} };
}

let next = 0;
function regiments(unit: UnitType, count: number, tier: Tier = 1): Regiment[] {
  return Array.from({ length: count }, () => ({
    id: `t${next++}`,
    unit,
    tier,
    soldiers: regimentSize(unit),
    movementLeft: 12,
    pinned: false,
  }));
}

function withArmy(state: GameState, id: string, owner: string, tile: string, regs: Regiment[]): GameState {
  const army: Army = { id, owner, tile, destination: null, regiments: regs };
  return { ...state, armies: { ...state.armies, [id]: army } };
}

/** Tiles within `radius` steps of a tile. */
function around(tile: string, radius: number): string[] {
  const seen = new Set([tile]);
  let edge = [tile];
  for (let i = 0; i < radius; i++) {
    edge = edge.flatMap((t) => topo.neighbors(t)).filter((t) => !seen.has(t) && seen.add(t));
  }
  return [...seen];
}

/** Open land with no city and no sea within `radius` tiles. */
function openGround(state: GameState, radius = 5): string {
  return topo.allTiles().find((t) =>
    around(t, radius).every((u) => TERRAIN[state.tiles[u].terrain].passable && !cityAt(state, u)),
  )!;
}

function attack(state: GameState, armyId: string, target: string): GameState {
  const army = state.armies[armyId];
  const result = applyAction(ctx, state, army.owner, { type: "attack", armyId, regimentIds: army.regiments.map((r) => r.id), target });
  assert.ok(result.ok, result.ok ? "" : result.reason);
  return result.state;
}

const soldiersOf = (army: Army | undefined) => army?.regiments.reduce((sum, r) => sum + r.soldiers, 0) ?? 0;
const lastBattle = (state: GameState) => state.battles[state.battles.length - 1];

describe("rout losses", () => {
  it("take a share of the survivors, plus half a soldier for each of the winner's horsemen", () => {
    assert.equal(routLosses(500, [{ unit: "spearmen", soldiers: 400 }]), Math.round(500 * COMBAT.routLoss));
    assert.equal(routLosses(500, [{ unit: "cavalry", soldiers: 200 }]), Math.round(500 * COMBAT.routLoss + 200 * COMBAT.cavalryPursuit));
    // Elite horsemen count 1.6 each.
    assert.equal(routLosses(500, [{ unit: "cavalry", soldiers: 100, tier: 3 }]), Math.round(500 * COMBAT.routLoss + 160 * COMBAT.cavalryPursuit));
    assert.equal(routLosses(100, [{ unit: "cavalry", soldiers: 1000 }]), 100);
  });
});

describe("fleeTile", () => {
  it("flees up to three tiles, away from the enemy", () => {
    const state = emptyGame();
    const here = openGround(state);
    const enemy = topo.neighbors(here)[0];
    const tile = fleeTile(ctx, state, "carthage", here, 3, enemy)!;
    assert.equal(topo.distance(here, tile), COMBAT.fleeTiles);
    assert.equal(topo.distance(enemy, tile), COMBAT.fleeTiles + 1);
  });

  it("makes for its own city if one is in reach", () => {
    const state = emptyGame();
    const carthago = Object.values(state.cities).find((c) => c.name === "Carthago")!;
    const here = around(carthago.tile, 2).find((t) => topo.distance(t, carthago.tile) === 2 && TERRAIN[state.tiles[t].terrain].passable && !cityAt(state, t))!;
    assert.equal(fleeTile(ctx, state, "carthage", here, 2, topo.neighbors(here).find((t) => t !== carthago.tile)!), carthago.tile);
  });

  it("never passes an enemy army, and with enemies all round has nowhere to go", () => {
    let state = emptyGame();
    const here = openGround(state);
    topo.neighbors(here).forEach((t, i) => (state = withArmy(state, `ring${i}`, "rome", t, regiments("militia", 1))));
    assert.equal(fleeTile(ctx, state, "carthage", here, 1, topo.neighbors(here)[0]), null);
  });

  it("never takes a sea crossing", () => {
    const state = emptyGame();
    const straits = topo.allTiles().filter((t) => topo.neighbors(t).some((n) => topo.distance(t, n) > 1));
    assert.ok(straits.length > 0, "the map has sea crossings");
    for (const here of straits) {
      const enemy = topo.neighbors(here).find((n) => topo.distance(here, n) === 1 && TERRAIN[state.tiles[n].terrain].passable) ?? here;
      const tile = fleeTile(ctx, state, "carthage", here, 1, enemy);
      if (tile) assert.ok(topo.distance(here, tile) <= COMBAT.fleeTiles, `from ${here} to ${tile}`);
    }
  });

  it("joins one of its own armies only if there's room", () => {
    let state = emptyGame();
    const here = openGround(state);
    const enemy = topo.neighbors(here)[0];
    const best = fleeTile(ctx, state, "carthage", here, 2, enemy)!;
    state = withArmy(state, "full", "carthage", best, regiments("militia", 9));
    const tile = fleeTile(ctx, state, "carthage", here, 2, enemy)!;
    assert.notEqual(tile, best);
    assert.equal(fleeTile(ctx, state, "carthage", here, 1, enemy), best);
  });
});

describe("a beaten army", () => {
  it("flees with its survivors, which have no movement left", () => {
    let state = emptyGame();
    const here = openGround(state);
    const from = topo.neighbors(here)[0];
    state = withArmy(state, "punic", "carthage", here, regiments("militia", 3));
    state = withArmy(state, "roman", "rome", from, regiments("spearmen", 8));
    state = attack(state, "roman", here);

    const report = lastBattle(state);
    assert.equal(report.attackerWon, true);
    assert.equal(report.loserFled, true);
    const fled = state.armies.punic;
    assert.ok(fled, "the beaten army still exists");
    assert.ok(topo.distance(here, fled.tile) <= COMBAT.fleeTiles && fled.tile !== here);
    assert.ok(fled.regiments.every((r) => r.movementLeft === 0));
    assert.equal(soldiersOf(fled), 660 - report.defenderLosses);
    assert.ok(report.defenderLosses > 660 * COMBAT.breakPoint, "the rout costs more than the battle");
  });

  it("fights to the death with nowhere to flee", () => {
    let state = emptyGame();
    const here = openGround(state);
    const [from, ...rest] = topo.neighbors(here);
    state = withArmy(state, "punic", "carthage", here, regiments("militia", 3));
    state = withArmy(state, "roman", "rome", from, regiments("spearmen", 8));
    rest.forEach((t, i) => (state = withArmy(state, `ring${i}`, "rome", t, regiments("militia", 1).map((r) => ({ ...r, movementLeft: 0 })))));
    state = attack(state, "roman", here);
    assert.equal(lastBattle(state).loserFled, false);
    assert.equal(state.armies.punic, undefined);
    assert.equal(lastBattle(state).defenderLosses, 660);
  });

  it("is destroyed defending its city, which falls", () => {
    let state = emptyGame();
    const carthago = Object.values(state.cities).find((c) => c.name === "Carthago")!;
    const from = topo.neighbors(carthago.tile).find((t) => TERRAIN[state.tiles[t].terrain].passable && !cityAt(state, t))!;
    state = withArmy(state, "punic", "carthage", carthago.tile, regiments("militia", 2));
    state = withArmy(state, "roman", "rome", from, regiments("spearmen", 10));
    state = attack(state, "roman", carthago.tile);
    assert.equal(lastBattle(state).loserFled, false);
    assert.equal(state.cities[carthago.id].owner, "rome");
    assert.equal(armyAt(state, carthago.tile)?.owner, "rome");
  });

  it("falls back into its own city if it attacked from there", () => {
    let state = emptyGame();
    const roma = Object.values(state.cities).find((c) => c.name === "Roma")!;
    const target = topo.neighbors(roma.tile).find((t) => TERRAIN[state.tiles[t].terrain].passable && !cityAt(state, t))!;
    state = withArmy(state, "roman", "rome", roma.tile, regiments("militia", 2));
    state = withArmy(state, "punic", "carthage", target, regiments("spearmen", 10));
    state = attack(state, "roman", target);
    assert.equal(lastBattle(state).attackerWon, false);
    assert.equal(lastBattle(state).loserFled, true);
    assert.equal(state.armies.roman?.tile, roma.tile);
  });

  it("is destroyed sallying from a besieged city", () => {
    let state = emptyGame();
    const roma = Object.values(state.cities).find((c) => c.name === "Roma")!;
    state = { ...state, cities: { ...state.cities, [roma.id]: { ...roma, besiegedBy: "carthage" } } };
    const target = topo.neighbors(roma.tile).find((t) => TERRAIN[state.tiles[t].terrain].passable && !cityAt(state, t))!;
    state = withArmy(state, "roman", "rome", roma.tile, regiments("militia", 2));
    state = withArmy(state, "punic", "carthage", target, regiments("spearmen", 10));
    state = attack(state, "roman", target);
    assert.equal(lastBattle(state).attackerWon, false);
    assert.equal(lastBattle(state).loserFled, false);
    assert.equal(state.armies.roman, undefined);
  });

  it("never leaves more than ten regiments on a tile when several armies flee", () => {
    let state = emptyGame();
    const here = openGround(state);
    const from = topo.neighbors(here)[0];
    state = withArmy(state, "punicA", "carthage", here, regiments("militia", 6));
    state = withArmy(state, "punicB", "carthage", topo.neighbors(here).find((t) => t !== from && topo.distance(t, from) > 1)!, regiments("militia", 6));
    state = withArmy(state, "roman", "rome", from, regiments("spearmen", 10, 3));
    state = attack(state, "roman", here);
    const tiles = new Map<string, number>();
    for (const army of Object.values(state.armies)) tiles.set(army.tile, (tiles.get(army.tile) ?? 0) + 1);
    assert.ok([...tiles.values()].every((n) => n === 1), "one army per tile");
    assert.ok(Object.values(state.armies).every((a) => a.regiments.length <= 10));
  });
});
