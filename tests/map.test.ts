/** The starting map: where cities stand, the land they claim, and the islands and crossings. */
import assert from "node:assert/strict";
import { it } from "node:test";
import type { GameContext } from "@/core/context.js";
import { createGame } from "@/core/setup.js";
import { LEVEL_POPULATION, MAX_CITY_LEVEL } from "@/data/buildings.js";
import { GAME_SETUP } from "@/data/gameSetup.js";
import { ROMAN_WORLD } from "@/data/scenarios/romanWorld.js";
import { SEA_CROSSINGS } from "@/map/europe/europeMapEngine.js";
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

const map = ROMAN_WORLD.mapEngine.createMap();
const ctx: GameContext = { topology: map.topology };
const state = createGame(ctx, map, ROMAN_WORLD);
const cityNamed = (name: string) => Object.values(state.cities).find((c) => c.name === name)!;

it("places every faction's listed cities, however many each has", () => {
  for (const faction of ROMAN_WORLD.factions) {
    const placed = Object.values(state.cities).filter((c) => c.owner === faction.id).map((c) => c.name).sort();
    assert.deepEqual(placed, faction.cities.map((c) => c.name).sort(), faction.id);
  }
  const counts = new Set(ROMAN_WORLD.factions.map((f) => f.cities.length));
  assert.ok(counts.size > 1, "factions start with different numbers of cities");
});

it("moves a city no more than a few tiles from where it really stood", () => {
  for (const faction of ROMAN_WORLD.factions) {
    for (const listed of faction.cities) {
      const real = map.locate!(listed.lon, listed.lat)!;
      const city = cityNamed(listed.name);
      // The real spot may be sea: allow the step to the nearest land as well.
      assert.ok(ctx.topology.distance(real, city.tile) <= GAME_SETUP.maxCityShift + 2, `${listed.name} moved ${ctx.topology.distance(real, city.tile)} tiles`);
    }
  }
});

it("gives each claimed tile to the nearest city within the territory radius", () => {
  const cities = Object.values(state.cities);
  for (const [tile, claim] of Object.entries(state.territory)) {
    const own = state.cities[claim.cityId];
    assert.equal(claim.owner, own.owner);
    const d = ctx.topology.distance(own.tile, tile);
    assert.ok(d <= GAME_SETUP.territoryRadius, `${tile} is ${d} from ${own.name}`);
    const nearer = cities.find((other) => ctx.topology.distance(other.tile, tile) < d);
    assert.equal(nearer, undefined, `${tile} belongs to ${own.name} but ${nearer?.name} is nearer`);
  }
  // Uncrowded cities hold far more land than before: the median city has 20+ tiles.
  const sizes = cities.map((c) => Object.values(state.territory).filter((t) => t.cityId === c.id).length).sort((a, b) => a - b);
  assert.ok(sizes[sizes.length >> 1] >= 20, `median ${sizes[sizes.length >> 1]} tiles`);
});

it("draws Sicily round, cut off from Italy", () => {
  const center = map.locate!(14.1, 37.6)!;
  const disc = ctx.topology.allTiles().filter((t) => ctx.topology.distance(t, center) <= 2);
  assert.ok(disc.every((t) => map.tiles[t].terrain !== "water"), "the whole disc is land");
  const ring = ctx.topology.allTiles().filter((t) => ctx.topology.distance(t, center) === 3);
  assert.ok(ring.every((t) => map.tiles[t].terrain === "water"), "sea all round it");
});

it("links Sardinia to Africa by a sea crossing", () => {
  assert.ok(SEA_CROSSINGS.some((c) => c.name === "Sardinia to Africa"));
  const carales = cityNamed("Carales");
  const cirta = cityNamed("Cirta");
  // A path over land and crossings exists from Sardinia to Numidia.
  const seen = new Set([carales.tile]);
  const queue = [carales.tile];
  while (queue.length > 0) {
    const t = queue.shift()!;
    for (const n of ctx.topology.neighbors(t)) {
      if (seen.has(n) || map.tiles[n].terrain === "water") continue;
      seen.add(n);
      queue.push(n);
    }
  }
  assert.ok(seen.has(cirta.tile), "Carales can reach Cirta");
});
