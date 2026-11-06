/** Sieges: a garrison is shut in, a beaten siege ends at once, a city restocks fully when one ends, and a dead garrison gives up the city. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAction } from "@/core/actions.js";
import type { GameContext } from "@/core/context.js";
import { createGame } from "@/core/setup.js";
import { armyAt, type Army, type GameState } from "@/core/state.js";
import { ROMAN_WORLD } from "@/data/scenarios/romanWorld.js";
import { regimentSize } from "@/data/units.js";
import { attackOptions, reachableTiles, SHUT_IN, siegeWorksPerTurn, stormBlocked } from "@/systems/armies.js";
import { nextAction } from "@/ai/ai.js";
import { assess } from "@/ai/assess.js";
import { cityDefense } from "@/systems/combat.js";
import { besiege, liftSiege, maxSupplies, processSieges } from "@/systems/siege.js";

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
        regiments: [{ id: "besieger", unit: "spearmen", tier: 1, soldiers: regimentSize("spearmen"), experience: 0, movementLeft: 12, pinned: false }],
      },
    },
  };
  return { ctx, state, garrison: armyAt(state, roma.tile)!, besiegerTile };
}

describe("the wearing down of a city", () => {
  it("starts on the first full turn of a siege, not the turn it's laid", () => {
    const { ctx, state: fixture } = romaBesieged();
    const roma = Object.values(fixture.cities).find((c) => c.name === "Roma")!;
    const soldiers = (s: GameState) => armyAt(s, roma.tile)!.regiments.reduce((n, r) => n + r.soldiers, 0);
    const start = soldiers(fixture);

    const laid = besiege({ ...fixture, cities: { ...fixture.cities, [roma.id]: { ...roma, besiegedBy: null } } }, "carthage", roma.tile);
    const first = processSieges(ctx, laid, "carthage");
    assert.equal(soldiers(first), start, "no soldiers lost the turn it's laid");
    assert.equal(first.cities[roma.id].population, roma.population, "nor people");
    assert.equal(first.cities[roma.id].supplies, roma.supplies, "nor supplies");

    const second = processSieges(ctx, { ...first, turn: first.turn + 1 }, "carthage");
    assert.ok(soldiers(second) < start, "soldiers lost the next turn");
    assert.ok(second.cities[roma.id].population < roma.population, "and people");
    assert.equal(second.cities[roma.id].supplies, roma.supplies - 1, "and a turn of supplies");
  });

  it("lets a city hold out for as many full turns as it has supplies", () => {
    const { ctx, state: fixture } = romaBesieged();
    const roma = Object.values(fixture.cities).find((c) => c.name === "Roma")!;
    let state = processSieges(ctx, besiege({ ...fixture, cities: { ...fixture.cities, [roma.id]: { ...roma, besiegedBy: null } } }, "carthage", roma.tile), "carthage");
    for (let held = 1; held < roma.supplies; held++) {
      state = processSieges(ctx, { ...state, turn: state.turn + 1 }, "carthage");
      assert.equal(state.cities[roma.id].owner, "rome", `still holding after ${held} full turns`);
    }
    state = processSieges(ctx, { ...state, turn: state.turn + 1 }, "carthage");
    assert.equal(state.cities[roma.id].owner, "carthage", `surrendered after ${roma.supplies} full turns`);
  });
});

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
    const reg = (id: string) => ({ id, unit: "spearmen" as const, tier: 1 as const, soldiers: regimentSize("spearmen"), experience: 0, movementLeft: 12, pinned: false });
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
    const reg = (id: string) => ({ id, unit: "spearmen" as const, tier: 1 as const, soldiers: regimentSize("spearmen"), experience: 0, movementLeft: 12, pinned: false });
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
    const reg = (id: string) => ({ id, unit: "spearmen" as const, tier: 3 as const, soldiers: regimentSize("spearmen"), experience: 0, movementLeft: 12, pinned: false });
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

describe("a garrison dying under siege", () => {
  /** Carthage besieging Roma, whose lone militia sallies into three strong regiments and dies. */
  function doomedSally() {
    const setup = romaBesieged();
    const roma = Object.values(setup.state.cities).find((c) => c.name === "Roma")!;
    const reg = (id: string, unit: "militia" | "spearmen", tier: 1 | 3) => ({ id, unit, tier, soldiers: regimentSize(unit), experience: 0, movementLeft: 12, pinned: false });
    const state: GameState = {
      ...setup.state,
      armies: {
        ...setup.state.armies,
        [setup.garrison.id]: { ...setup.garrison, regiments: [reg("g1", "militia", 1)] },
        besiegers: { ...setup.state.armies.besiegers, regiments: [reg("b1", "spearmen", 3), reg("b2", "spearmen", 3), reg("b3", "spearmen", 3)] },
      },
    };
    return { ...setup, roma, state };
  }

  it("hands the city to the besieger at once, on the garrison's own turn", () => {
    const { ctx, state, roma, garrison, besiegerTile } = doomedSally();
    const sally = applyAction(ctx, state, "rome", { type: "attack", armyId: garrison.id, regimentIds: ["g1"], target: besiegerTile });
    assert.ok(sally.ok);
    const city = sally.state.cities[roma.id];
    assert.equal(city.owner, "carthage");
    assert.equal(city.besiegedBy, null);
    assert.equal(city.unsettled, true, "its fate is decided on the conqueror's turn");
    assert.equal(armyAt(sally.state, roma.tile)?.id, "besiegers", "and the besiegers have moved in");
    assert.equal(sally.state.battles[sally.state.battles.length - 1].cityCaptured, "Roma", "the battle's report says so");
  });

  it("does the same when attrition kills the last of it", () => {
    const { ctx, state, roma, garrison } = doomedSally();
    const few: GameState = {
      ...state,
      armies: { ...state.armies, [garrison.id]: { ...garrison, regiments: [{ ...garrison.regiments[0], soldiers: 1 }] } },
    };
    const after = processSieges(ctx, few, "carthage");
    assert.equal(after.cities[roma.id].owner, "carthage");
    assert.equal(armyAt(after, roma.tile)?.id, "besiegers");
  });

  it("leaves alone a besieged city that was already empty", () => {
    const { ctx, state, roma, garrison, besiegerTile } = doomedSally();
    const armies = { ...state.armies };
    delete armies[garrison.id];
    const relief = ctx.topology.neighbors(besiegerTile).find((t) => t !== roma.tile && state.tiles[t].terrain !== "water" && !armyAt(state, t))!;
    armies.relief = { id: "relief", owner: "rome", tile: relief, destination: null, regiments: [{ id: "r1", unit: "militia", tier: 1, soldiers: regimentSize("militia"), experience: 0, movementLeft: 12, pinned: false }] };
    const fought = applyAction(ctx, { ...state, armies }, "rome", { type: "attack", armyId: "relief", regimentIds: ["r1"], target: besiegerTile });
    assert.ok(fought.ok);
    assert.equal(fought.state.cities[roma.id].owner, "rome");
  });

  it("passes play on when a faction loses its last city on its own turn", () => {
    const { ctx, state, roma, garrison, besiegerTile } = doomedSally();
    // Roma is Rome's only city, and the AI is playing Rome.
    const cities = Object.fromEntries(Object.entries(state.cities).map(([id, c]) => [id, c.owner === "rome" && c.id !== roma.id ? { ...c, owner: "carthage" } : c]));
    const factions = state.factions.map((f) => (f.id === "rome" ? { ...f, controller: "ai" as const } : f));
    const armies = Object.fromEntries(Object.entries(state.armies).filter(([id, a]) => a.owner !== "rome" || id === garrison.id));
    const sally = applyAction(ctx, { ...state, cities, factions, armies }, "rome", { type: "attack", armyId: garrison.id, regimentIds: ["g1"], target: besiegerTile });
    assert.ok(sally.ok);
    assert.equal(sally.state.factions.find((f) => f.id === "rome")?.alive, false, "Rome has fallen");

    const action = nextAction(ctx, sally.state, "rome");
    assert.equal(action.type, "endTurn");
    const ended = applyAction(ctx, sally.state, "rome", action);
    assert.ok(ended.ok);
    assert.notEqual(ended.state.factions[ended.state.currentFactionIndex].id, "rome");
  });
});

describe("siege works", () => {
  /** Roma walled to `walls`, under a siege just laid by `soldiers` Carthaginian spearmen or cavalry next to it. */
  function walledRoma(walls: number, soldiers = 180, unit: "spearmen" | "cavalry" = "spearmen") {
    const { ctx, state: fixture, besiegerTile } = romaBesieged();
    const roma = Object.values(fixture.cities).find((c) => c.name === "Roma")!;
    const besiegers = fixture.armies.besiegers;
    const state: GameState = {
      ...fixture,
      turn: 5,
      armies: { ...fixture.armies, besiegers: { ...besiegers, regiments: [{ ...besiegers.regiments[0], unit, soldiers }] } },
      cities: { ...fixture.cities, [roma.id]: { ...roma, besiegedBy: "carthage", besiegedSince: 5, buildings: { ...roma.buildings, walls } } },
    };
    return { ctx, state, cityId: roma.id, tile: roma.tile, besiegerTile };
  }
  const withWorks = (state: GameState, cityId: string, siegeWorks: number): GameState => ({
    ...state,
    cities: { ...state.cities, [cityId]: { ...state.cities[cityId], siegeWorks } },
  });

  it("go up with the soldiers next to the city, from the turn the siege is laid", () => {
    const { ctx, state, cityId } = walledRoma(2);
    const after = processSieges(ctx, state, "carthage");
    assert.ok(Math.abs(after.cities[cityId].siegeWorks - 180 / 500) < 1e-9);
    assert.equal(after.cities[cityId].supplies, state.cities[cityId].supplies, "the laying turn still costs the city nothing");
  });

  it("count horsemen at half", () => {
    const { ctx, state, cityId } = walledRoma(2, 120, "cavalry");
    assert.ok(Math.abs(siegeWorksPerTurn(ctx, state, "carthage", state.cities[cityId]) - 60 / 500) < 1e-9);
  });

  it("stop at the most there can be", () => {
    const { ctx, state, cityId } = walledRoma(2);
    const after = processSieges(ctx, withWorks(state, cityId, 4.9), "carthage");
    assert.equal(after.cities[cityId].siegeWorks, 5);
  });

  it("aren't built around a city with no walls", () => {
    const { ctx, state, cityId } = walledRoma(0);
    assert.equal(processSieges(ctx, state, "carthage").cities[cityId].siegeWorks, 0);
  });

  it("are lost when the siege ends", () => {
    const { state, cityId } = walledRoma(2);
    assert.equal(liftSiege(withWorks(state, cityId, 3), "carthage", cityId).cities[cityId].siegeWorks, 0);
  });

  it("are needed to storm: the walls' level in whole points", () => {
    const { ctx, state, cityId, tile } = walledRoma(2);
    const attack = (s: GameState) =>
      applyAction(ctx, s, "carthage", { type: "attack", armyId: "besiegers", regimentIds: ["besieger"], target: tile });
    const carthageTurn = { ...state, currentFactionIndex: state.factions.findIndex((f) => f.id === "carthage") };
    const refused = attack(withWorks(carthageTurn, cityId, 1.9));
    assert.equal(refused.ok, false);
    if (!refused.ok) assert.match(refused.reason, /Needs 2 siege works/);
    assert.ok(!attackOptions(ctx, withWorks(state, cityId, 1.9), state.armies.besiegers, ["besieger"]).has(tile));
    assert.ok(attackOptions(ctx, withWorks(state, cityId, 2), state.armies.besiegers, ["besieger"]).has(tile));
  });

  it("belong to the besieger: nobody else can storm on them", () => {
    const { ctx, state, cityId, tile } = walledRoma(1);
    assert.equal(stormBlocked(ctx, withWorks(state, cityId, 5), "carthage", tile), null);
    assert.match(stormBlocked(ctx, withWorks(state, cityId, 5), "arverni", tile) ?? "", /lay siege first/);
  });

  it("don't stop anyone walking into an empty walled city", () => {
    const { ctx, state, tile } = walledRoma(3);
    const garrison = armyAt(state, tile)!;
    const armies = { ...state.armies };
    delete armies[garrison.id];
    assert.equal(stormBlocked(ctx, { ...state, armies }, "arverni", tile), null);
  });

  it("don't stop a storm of a city with no walls", () => {
    const { ctx, state, tile } = walledRoma(0);
    assert.equal(stormBlocked(ctx, state, "arverni", tile), null);
  });

  it("take a fifth of the walls' bonus off for each whole point", () => {
    const stone = { buildings: { walls: 2 } };
    const bonus = (siegeWorks: number) => Math.round(cityDefense({ ...stone, siegeWorks }) * 100);
    assert.equal(bonus(0), 40, "city 10 + walls 30");
    assert.equal(bonus(1.9), 34);
    assert.equal(bonus(2), 28);
    assert.equal(bonus(5), 10, "only the city's own bonus is left");
  });
});
