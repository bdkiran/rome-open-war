/** Watchtowers: where they can be built, what they see, and who sees through them. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAction } from "@/core/actions.js";
import type { GameContext } from "@/core/context.js";
import { createGame } from "@/core/setup.js";
import { cityAt, type GameState } from "@/core/state.js";
import { ROMAN_WORLD } from "@/data/scenarios/romanWorld.js";
import { VISION } from "@/data/vision.js";
import { WATCHTOWER } from "@/data/watchtowers.js";
import { captureCity, tilesWithin } from "@/systems/cities.js";
import { visibleTiles } from "@/systems/vision.js";
import { canBuildWatchtower, towerOwner, towerSighter } from "@/systems/watchtowers.js";

const map = ROMAN_WORLD.mapEngine.createMap();
const ctx: GameContext = { topology: map.topology };
const newGame = (): GameState => createGame(ctx, map, ROMAN_WORLD);
const ROME = "rome";
const CARTHAGE = "carthage";

/** A tile of Rome's region outside every territory, far enough out that a tower there sees new land. */
function outerRomanTile(state: GameState): string {
  const seen = visibleTiles(ctx, state, ROME);
  const tile = Object.keys(state.regions).find(
    (t) =>
      towerOwner(state, t) === ROME &&
      !state.territory[t] &&
      !Object.values(state.armies).some((a) => a.tile === t) &&
      tilesWithin(ctx.topology, t, VISION.watchtower).some((n) => !seen.has(n)),
  );
  assert.ok(tile, "Rome has outer land to watch");
  return tile;
}

function build(state: GameState, tile: string): GameState {
  const result = applyAction(ctx, state, ROME, { type: "buildWatchtower", tile });
  assert.ok(result.ok, result.ok ? "" : result.reason);
  return result.state;
}

describe("building a watchtower", () => {
  it("costs its price and is finished at once", () => {
    const state = newGame();
    const tile = outerRomanTile(state);
    const next = build(state, tile);
    assert.equal(next.watchtowers[tile], true);
    assert.equal(next.factions[0].gold, state.factions[0].gold - WATCHTOWER.cost);
    assert.equal(towerSighter(next, tile), ROME);
  });

  it("is refused off your own land, on a city, twice on one tile, or without the gold", () => {
    const state = newGame();
    const carthaginian = Object.keys(state.regions).find((t) => towerOwner(state, t) === CARTHAGE && !cityAt(state, t))!;
    assert.ok(carthaginian, "Carthage has land");
    assert.equal(canBuildWatchtower(state, ROME, carthaginian).ok, false);
    const roma = Object.values(state.cities).find((c) => c.name === "Roma")!;
    assert.equal(canBuildWatchtower(state, ROME, roma.tile).ok, false);
    const tile = outerRomanTile(state);
    assert.equal(canBuildWatchtower(build(state, tile), ROME, tile).ok, false);
    const poor: GameState = { ...state, factions: state.factions.map((f) => (f.id === ROME ? { ...f, gold: WATCHTOWER.cost - 1 } : f)) };
    assert.equal(canBuildWatchtower(poor, ROME, tile).ok, false);
  });
});

describe("watchtower sight", () => {
  it("shows its owner the land around it", () => {
    const state = newGame();
    const tile = outerRomanTile(state);
    const before = visibleTiles(ctx, state, ROME);
    const after = visibleTiles(ctx, build(state, tile), ROME);
    for (const t of tilesWithin(ctx.topology, tile, VISION.watchtower)) assert.ok(after.has(t), `${t} unseen`);
    assert.ok(after.size > before.size);
  });

  it("goes to an enemy army standing on it, and blinds the owner meanwhile", () => {
    const state = newGame();
    const tile = outerRomanTile(state);
    const before = visibleTiles(ctx, state, ROME);
    const onlyTower = tilesWithin(ctx.topology, tile, VISION.watchtower).filter((t) => !before.has(t) && t !== tile);
    assert.ok(onlyTower.length > 0, "the tower sees land nothing else does");
    const built = build(state, tile);
    const enemy = Object.values(built.armies).find((a) => a.owner === CARTHAGE && !cityAt(built, a.tile))
      ?? Object.values(built.armies).find((a) => a.owner === CARTHAGE)!;
    const occupied: GameState = { ...built, armies: { ...built.armies, [enemy.id]: { ...enemy, tile } } };
    assert.equal(towerSighter(occupied, tile), CARTHAGE);
    const rome = visibleTiles(ctx, occupied, ROME);
    const carthage = visibleTiles(ctx, occupied, CARTHAGE);
    for (const t of onlyTower) {
      assert.ok(!rome.has(t), `Rome still sees ${t}`);
      assert.ok(carthage.has(t), `Carthage can't see ${t}`);
    }
  });

  it("changes hands with the city whose region it stands in", () => {
    const state = newGame();
    const tile = outerRomanTile(state);
    const built = build(state, tile);
    const taken = captureCity(built, built.regions[tile], CARTHAGE);
    assert.equal(towerOwner(taken, tile), CARTHAGE);
    assert.equal(towerSighter(taken, tile), CARTHAGE);
  });
});
