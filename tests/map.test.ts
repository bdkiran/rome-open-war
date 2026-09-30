/** The starting map: every city can grow into a level-3 city, and no two cities touch. */
import assert from "node:assert/strict";
import { it } from "node:test";
import type { GameContext } from "@/core/context.js";
import { createGame } from "@/core/setup.js";
import { LEVEL_POPULATION, MAX_CITY_LEVEL } from "@/data/buildings.js";
import { ROMAN_WORLD } from "@/data/scenarios/romanWorld.js";
import { cityStats } from "@/systems/cities.js";

/**
 * Growth slows to nothing near a city's capacity, so a city whose land holds
 * barely the people a Senate needs would take forever to get there. Ask for
 * this much room above it.
 */
const HEADROOM = 1.1;

it("gives every starting city enough land to reach the top level", () => {
  const map = ROMAN_WORLD.mapEngine.createMap();
  const ctx: GameContext = { topology: map.topology };
  const state = createGame(ctx, map, ROMAN_WORLD);
  const needed = LEVEL_POPULATION[MAX_CITY_LEVEL] * HEADROOM;
  const tooPoor = Object.values(state.cities)
    .map((city) => ({ city: city.name, land: cityStats(state, city).landCapacity }))
    .filter(({ land }) => land < needed);
  assert.deepEqual(tooPoor, [], `a city's land holds fewer than ${needed} people`);
});

it("never puts two cities next to each other, not even across a sea crossing", () => {
  const map = ROMAN_WORLD.mapEngine.createMap();
  const ctx: GameContext = { topology: map.topology };
  const state = createGame(ctx, map, ROMAN_WORLD);
  const cityTiles = new Map(Object.values(state.cities).map((c) => [c.tile, c.name]));
  const touching = Object.values(state.cities).flatMap((city) =>
    ctx.topology.neighbors(city.tile).filter((t) => cityTiles.has(t)).map((t) => `${city.name} and ${cityTiles.get(t)}`),
  );
  assert.deepEqual(touching, []);
});
