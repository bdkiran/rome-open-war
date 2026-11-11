/**
 * Sea crossings: armies step and attack across them, so each shore sees the
 * other; but only the two armies fighting face each other across one, and
 * no one else joins the battle from the far shore.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GameContext } from "@/core/context.js";
import { createGame } from "@/core/setup.js";
import { cityAt, type Army, type GameState, type Regiment } from "@/core/state.js";
import { ROMAN_WORLD } from "@/data/scenarios/romanWorld.js";
import { TERRAIN } from "@/data/terrain.js";
import { regimentSize, type UnitType } from "@/data/units.js";
import { attackOptions } from "@/systems/armies.js";
import { battleSides } from "@/systems/combat.js";
import { fogged, visibleTiles } from "@/systems/vision.js";

const map = ROMAN_WORLD.mapEngine.createMap();
const ctx: GameContext = { topology: map.topology };
const topo = ctx.topology;

/** A new game with no armies, scouts or watchtowers on the map. */
function emptyGame(): GameState {
  return { ...createGame(ctx, map, ROMAN_WORLD), armies: {}, scouts: {}, watchtowers: {} };
}

let next = 0;
function regiments(unit: UnitType, count: number): Regiment[] {
  return Array.from({ length: count }, () => ({
    id: `x${next++}`, unit, tier: 1 as const, soldiers: regimentSize(unit), experience: 0, movementLeft: 12, pinned: false,
  }));
}

function withArmy(state: GameState, id: string, owner: string, tile: string, unit: UnitType = "spearmen"): GameState {
  const army: Army = { id, owner, tile, destination: null, regiments: regiments(unit, 2) };
  return { ...state, armies: { ...state.armies, [id]: army } };
}

/** Land next to `tile` (not across a crossing), passable and with no city. */
function landNextTo(state: GameState, tile: string, not: readonly string[] = []): string {
  const found = topo.neighbors(tile).find((n) =>
    topo.distance(tile, n) === 1 && TERRAIN[state.tiles[n].terrain].passable && !cityAt(state, n) && !not.includes(n),
  );
  if (!found) throw new Error(`no open land next to ${tile}`);
  return found;
}

/** A crossing whose two shores are open land with no city: [near shore, far shore]. */
function crossing(state: GameState): [string, string] {
  const open = (t: string) => TERRAIN[state.tiles[t].terrain].passable && !cityAt(state, t);
  const link = (topo.links?.() ?? []).find(([a, b]) => open(a) && open(b));
  assert.ok(link, "the map has a crossing between two open shores");
  return [link[0], link[1]];
}

describe("sight across a crossing", () => {
  it("shows an army on the far shore to an army on the near shore, as a target", () => {
    const [near, far] = crossing(emptyGame());
    let state = withArmy(emptyGame(), "r", "rome", near);
    state = withArmy(state, "c", "carthage", far);
    const visible = visibleTiles(ctx, state, "rome");
    assert.ok(visible.has(far), "the far shore is in sight");
    const seen = fogged(state, "rome", visible);
    assert.ok(seen.armies.c, "the enemy there is not hidden");
    const army = seen.armies.r;
    assert.ok(attackOptions(ctx, seen, army, army.regiments.map((r) => r.id)).has(far), "it can be attacked");
  });

  it("works from either shore", () => {
    const [near, far] = crossing(emptyGame());
    let state = withArmy(emptyGame(), "r", "rome", far);
    state = withArmy(state, "c", "carthage", near);
    assert.ok(visibleTiles(ctx, state, "rome").has(near));
  });
});

describe("battles at a crossing", () => {
  it("is fought by the two armies facing each other across it", () => {
    const [near, far] = crossing(emptyGame());
    let state = withArmy(emptyGame(), "r", "rome", near);
    state = withArmy(state, "c", "carthage", far);
    const r = state.armies.r;
    const { attackers, defenders } = battleSides(ctx, state, r, r.regiments.map((x) => x.id), far);
    assert.deepEqual(attackers.map((s) => s.army.id), ["r"]);
    assert.deepEqual(defenders.map((s) => s.army.id), ["c"]);
  });

  it("isn't joined by an attacker's army on the far shore", () => {
    const base = emptyGame();
    const [near, far] = crossing(base);
    const target = landNextTo(base, far);
    let state = withArmy(base, "r", "rome", far);
    state = withArmy(state, "helper", "rome", near);
    state = withArmy(state, "c", "carthage", target);
    const r = state.armies.r;
    const { attackers } = battleSides(ctx, state, r, r.regiments.map((x) => x.id), target);
    assert.deepEqual(attackers.map((s) => s.army.id), ["r"]);
  });

  it("isn't joined by a defender's army on the far shore", () => {
    const base = emptyGame();
    const [near, far] = crossing(base);
    const from = landNextTo(base, far);
    let state = withArmy(base, "r", "rome", from);
    state = withArmy(state, "c", "carthage", far);
    state = withArmy(state, "helper", "carthage", near);
    const r = state.armies.r;
    const { defenders } = battleSides(ctx, state, r, r.regiments.map((x) => x.id), far);
    assert.deepEqual(defenders.map((s) => s.army.id), ["c"]);
  });

  it("is still joined by armies on land next to either side", () => {
    const base = emptyGame();
    const [, far] = crossing(base);
    const target = landNextTo(base, far);
    const beside = landNextTo(base, far, [target]);
    let state = withArmy(base, "r", "rome", far);
    state = withArmy(state, "helper", "rome", beside);
    state = withArmy(state, "c", "carthage", target);
    const r = state.armies.r;
    const { attackers } = battleSides(ctx, state, r, r.regiments.map((x) => x.id), target);
    assert.deepEqual(attackers.map((s) => s.army.id).sort(), ["helper", "r"]);
  });
});
