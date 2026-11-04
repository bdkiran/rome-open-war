/** Scouts: lone riders outside all the army rules. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAction } from "@/core/actions.js";
import type { GameContext } from "@/core/context.js";
import { createGame } from "@/core/setup.js";
import type { Army, GameState, Scout } from "@/core/state.js";
import { ROMAN_WORLD } from "@/data/scenarios/romanWorld.js";
import { SCOUT } from "@/data/scouts.js";
import { UNITS, regimentSize } from "@/data/units.js";
import { VISION } from "@/data/vision.js";
import { factionUpkeep, reachableTiles, refreshMovement, zoneOfControl } from "@/systems/armies.js";
import { captureCity, eliminateIfDefeated, tilesWithin } from "@/systems/cities.js";
import { processRecruitment } from "@/systems/recruitment.js";
import { reachableScoutTiles, scoutsOf } from "@/systems/scouts.js";
import { fogged, visibleTiles } from "@/systems/vision.js";

const map = ROMAN_WORLD.mapEngine.createMap();
const ctx: GameContext = { topology: map.topology };
const newGame = (): GameState => createGame(ctx, map, ROMAN_WORLD);
const roma = (s: GameState) => Object.values(s.cities).find((c) => c.name === "Roma")!;
const apply = (s: GameState, faction: string, action: Parameters<typeof applyAction>[3]) => {
  const r = applyAction(ctx, s, faction, action);
  assert.ok(r.ok, r.ok ? "" : r.reason);
  return r.state;
};
function withScout(state: GameState, tile: string, owner = "rome", id = "s1", movementLeft: number = SCOUT.movement): { state: GameState; scout: Scout } {
  const scout: Scout = { id, owner, tile, movementLeft };
  return { state: { ...state, scouts: { ...state.scouts, [id]: scout } }, scout };
}
/** A plains tile with nothing on it or around it, and an empty neighbour. */
function openGround(state: GameState): { tile: string; next: string } {
  const taken = new Set([...Object.values(state.cities).map((c) => c.tile), ...Object.values(state.armies).map((a) => a.tile)]);
  const clear = (t: string) => map.tiles[t].terrain === "plains" && !taken.has(t);
  const tile = ctx.topology.allTiles().find((t) => clear(t) && ctx.topology.neighbors(t).every((n) => ctx.topology.distance(t, n) === 1 && clear(n)))!;
  return { tile, next: ctx.topology.neighbors(tile)[0] };
}

describe("training a scout", () => {
  it("needs a level 2 city and the gold, and takes a turn", () => {
    const state = newGame();
    const city = Object.values(state.cities).find((c) => c.owner === "rome" && c.buildings.government < SCOUT.cityLevel)!;
    assert.equal(applyAction(ctx, state, "rome", { type: "trainScout", cityId: city.id }).ok, false);

    const raised = { ...city, buildings: { ...city.buildings, government: SCOUT.cityLevel } };
    const able: GameState = { ...state, cities: { ...state.cities, [city.id]: raised } };
    const before = able.factions[0].gold;
    const queued = apply(able, "rome", { type: "trainScout", cityId: city.id });
    assert.equal(queued.factions[0].gold, before - SCOUT.cost);
    assert.equal(scoutsOf(queued, "rome").length, 0);

    const trained = processRecruitment(queued, "rome");
    const [scout] = scoutsOf(trained, "rome");
    assert.equal(scout.tile, city.tile);
    assert.equal(scout.movementLeft, 0);
    assert.equal(trained.cities[city.id].population, city.population, "takes nobody from the city");
    assert.equal(refreshMovement(trained, "rome").scouts[scout.id].movementLeft, SCOUT.movement);
  });

  it("waits if another of its faction's scouts is on the city, and refunds when cancelled", () => {
    const state = newGame();
    const city = roma(state);
    const { state: occupied } = withScout(state, city.tile);
    const queued = apply(occupied, "rome", { type: "trainScout", cityId: city.id });
    const after = processRecruitment(queued, "rome");
    assert.equal(scoutsOf(after, "rome").length, 1);
    assert.equal(after.cities[city.id].recruitQueue.length, 1);
    assert.equal(apply(queued, "rome", { type: "cancelRecruit", cityId: city.id, index: 0 }).factions[0].gold, state.factions[0].gold);
  });
});

describe("moving a scout", () => {
  it("goes farther than cavalry", () => {
    assert.ok(SCOUT.movement > UNITS.cavalry.movement);
  });

  it("walks through enemy armies, cities and zones of control", () => {
    const state = newGame();
    const { tile, next } = openGround(state);
    const blocker: Army = { id: "e", owner: "carthage", tile: next, destination: null, regiments: [
      { id: "er", unit: "militia", tier: 1, soldiers: regimentSize("militia"), experience: 0, movementLeft: 12, pinned: false }] };
    const { state: s, scout } = withScout({ ...state, armies: { ...state.armies, e: blocker } }, tile);
    const reach = reachableScoutTiles(ctx, s, scout);
    assert.ok(reach.has(next), "can stop on an enemy army's tile");
    const beyond = ctx.topology.neighbors(next).find((n) => ctx.topology.distance(tile, n) === 2 && map.tiles[n].terrain === "plains");
    if (beyond) assert.ok(reach.has(beyond), "and goes on past it");
    const city = Object.values(state.cities).find((c) => c.owner !== "rome")!;
    const { state: s2, scout: s2scout } = withScout(state, ctx.topology.neighbors(city.tile).find((n) => map.tiles[n].terrain !== "water")!);
    assert.ok(reachableScoutTiles(ctx, s2, s2scout).has(city.tile), "can stop in an enemy city");
    const moved = apply(s, "rome", { type: "moveScout", scoutId: scout.id, to: next });
    assert.equal(moved.scouts[scout.id].tile, next);
    assert.ok(moved.scouts[scout.id].movementLeft < SCOUT.movement);
  });

  it("can't share a tile with its own faction's scout, or go without movement", () => {
    const state = newGame();
    const { tile, next } = openGround(state);
    const one = withScout(state, tile);
    const two = withScout(one.state, next, "rome", "s2");
    assert.equal(reachableScoutTiles(ctx, two.state, one.scout).has(next), false);
    const enemy = withScout(state, next, "carthage", "s3");
    const mine = withScout(enemy.state, tile);
    assert.equal(reachableScoutTiles(ctx, mine.state, mine.scout).has(next), true, "an enemy scout is no obstacle");
    const tired = withScout(state, tile, "rome", "s4", 0);
    assert.equal(reachableScoutTiles(ctx, tired.state, tired.scout).size, 0);
  });
});

describe("a scout among armies", () => {
  it("has no zone of control and doesn't block an army", () => {
    const state = newGame();
    const { tile, next } = openGround(state);
    const { state: s } = withScout(state, next, "carthage");
    assert.equal(zoneOfControl(ctx, s, "rome").has(tile), false);
    const army: Army = { id: "m", owner: "rome", tile, destination: null, regiments: [
      { id: "mr", unit: "militia", tier: 1, soldiers: regimentSize("militia"), experience: 0, movementLeft: 12, pinned: false }] };
    const armed = { ...s, armies: { ...s.armies, m: army } };
    assert.ok(reachableTiles(ctx, armed, army, ["mr"]).has(next), "the army can walk onto it");
    const moved = apply(armed, "rome", { type: "moveArmy", armyId: "m", regimentIds: ["mr"], to: next });
    assert.equal(moved.scouts.s1.tile, next, "and it survives");
  });

  it("survives its city being taken, and goes only when its faction falls", () => {
    const state = newGame();
    const city = roma(state);
    const { state: s } = withScout(state, city.tile);
    assert.equal(captureCity(s, city.id, "carthage").scouts.s1.tile, city.tile);
    let conquered: GameState = s;
    for (const c of Object.values(s.cities)) if (c.owner === "rome") conquered = captureCity(conquered, c.id, "carthage");
    assert.equal(Object.keys(eliminateIfDefeated(conquered, "rome").scouts).length, 0);
  });
});

describe("what a scout costs and sees", () => {
  it("adds its upkeep until it's dismissed, with no refund", () => {
    const state = newGame();
    const { state: s, scout } = withScout(state, roma(state).tile);
    assert.equal(factionUpkeep(s, "rome"), factionUpkeep(state, "rome") + SCOUT.upkeep);
    const gone = apply(s, "rome", { type: "dismissScout", scoutId: scout.id });
    assert.equal(Object.keys(gone.scouts).length, 0);
    assert.equal(gone.factions[0].gold, s.factions[0].gold);
    assert.equal(applyAction(ctx, s, "carthage", { type: "dismissScout", scoutId: scout.id }).ok, false);
  });

  it("sees around it, and enemies only see it within their sight", () => {
    const state = newGame();
    const { tile } = openGround(state);
    const { state: s } = withScout(state, tile);
    const seen = visibleTiles(ctx, s, "rome");
    for (const t of tilesWithin(ctx.topology, tile, VISION.scout)) assert.ok(seen.has(t), `${t} unseen`);
    assert.equal(fogged(s, "rome", seen).scouts.s1?.id, "s1");
    assert.equal(fogged(s, "carthage", new Set()).scouts.s1, undefined);
    assert.equal(fogged(s, "carthage", new Set([tile])).scouts.s1?.id, "s1");
  });
});
