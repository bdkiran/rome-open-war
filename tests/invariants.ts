import { armiesOf, citiesOf, type GameState } from "@/core/state.js";
import { CONSTRUCTION_QUEUE_SIZE } from "@/data/buildings.js";
import { MAX_EXPERIENCE } from "@/data/experience.js";
import { SCOUT } from "@/data/scouts.js";
import { TERRAIN } from "@/data/terrain.js";
import { ARMY_RULES, UNITS, regimentSize } from "@/data/units.js";

/**
 * Everything that must hold in any game state, whatever has happened.
 * Returns what's wrong, or an empty list.
 */
export function brokenRules(state: GameState): string[] {
  const broken: string[] = [];
  const at = `turn ${state.turn}`;
  const alive = new Set(state.factions.filter((f) => f.alive).map((f) => f.id));

  const armyOnTile = new Map<string, string>();
  for (const army of Object.values(state.armies)) {
    const other = armyOnTile.get(army.tile);
    if (other) broken.push(`${at}: ${army.id} and ${other} share tile ${army.tile}`);
    armyOnTile.set(army.tile, army.id);

    if (!alive.has(army.owner)) broken.push(`${at}: ${army.id} belongs to fallen ${army.owner}`);
    if (!TERRAIN[state.tiles[army.tile].terrain].passable) broken.push(`${at}: ${army.id} stands on impassable ${army.tile}`);
    if (army.regiments.length === 0) broken.push(`${at}: ${army.id} has no regiments`);
    if (army.regiments.length > ARMY_RULES.maxRegiments) {
      broken.push(`${at}: ${army.id} has ${army.regiments.length} regiments`);
    }
    for (const r of army.regiments) {
      if (![1, 2, 3].includes(r.tier) || (r.unit === "militia" && r.tier !== 1)) {
        broken.push(`${at}: regiment ${r.id} is ${r.unit} of tier ${r.tier}`);
      }
      if (!(r.soldiers > 0 && r.soldiers <= regimentSize(r.unit))) {
        broken.push(`${at}: regiment ${r.id} has ${r.soldiers} ${r.unit}`);
      }
      if (!Number.isInteger(r.experience) || r.experience < 0 || r.experience > MAX_EXPERIENCE) {
        broken.push(`${at}: regiment ${r.id} has ${r.experience} experience`);
      }
      if (!(r.movementLeft >= 0 && r.movementLeft <= UNITS[r.unit].movement)) {
        broken.push(`${at}: regiment ${r.id} has ${r.movementLeft} movement`);
      }
    }
  }

  const regimentIds = Object.values(state.armies).flatMap((a) => a.regiments.map((r) => r.id));
  if (new Set(regimentIds).size !== regimentIds.length) broken.push(`${at}: a regiment is in two armies`);

  for (const city of Object.values(state.cities)) {
    if (!alive.has(city.owner)) broken.push(`${at}: ${city.name} belongs to fallen ${city.owner}`);
    if (!(city.population > 0)) broken.push(`${at}: ${city.name} has ${city.population} people`);
    if (city.recruitQueue.length > ARMY_RULES.recruitQueueSize) broken.push(`${at}: ${city.name}'s recruitment queue overflows`);
    if (city.constructionQueue.length > CONSTRUCTION_QUEUE_SIZE) broken.push(`${at}: ${city.name}'s construction queue overflows`);
    const level = city.buildings.government;
    if (!(level >= 1 && level <= 3)) broken.push(`${at}: ${city.name} is level ${level}`);
  }

  const scoutSpots = new Set<string>();
  for (const scout of Object.values(state.scouts)) {
    if (!alive.has(scout.owner)) broken.push(`${at}: ${scout.id} belongs to fallen ${scout.owner}`);
    if (!TERRAIN[state.tiles[scout.tile].terrain].passable) broken.push(`${at}: ${scout.id} stands on impassable ${scout.tile}`);
    if (!(scout.movementLeft >= 0 && scout.movementLeft <= SCOUT.movement)) broken.push(`${at}: ${scout.id} has ${scout.movementLeft} movement`);
    const spot = `${scout.owner}@${scout.tile}`;
    if (scoutSpots.has(spot)) broken.push(`${at}: two of ${scout.owner}'s scouts on ${scout.tile}`);
    scoutSpots.add(spot);
  }

  for (const tile of Object.keys(state.watchtowers)) {
    if (!TERRAIN[state.tiles[tile].terrain].passable) broken.push(`${at}: watchtower on impassable ${tile}`);
    if (!state.regions[tile]) broken.push(`${at}: watchtower at ${tile} is in no city's region`);
    if (Object.values(state.cities).some((c) => c.tile === tile)) broken.push(`${at}: watchtower on a city at ${tile}`);
  }

  for (const faction of state.factions) {
    if (!Number.isInteger(faction.gold)) broken.push(`${at}: ${faction.id} has ${faction.gold} gold, not a whole number`);
    if (faction.alive && citiesOf(state, faction.id).length === 0) broken.push(`${at}: ${faction.id} is alive with no cities`);
    if (!faction.alive && armiesOf(state, faction.id).length > 0) broken.push(`${at}: fallen ${faction.id} still has armies`);
  }
  return broken;
}
