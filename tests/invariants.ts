import { armiesOf, citiesOf, type GameState } from "@/core/state.js";
import { CONSTRUCTION_QUEUE_SIZE } from "@/data/buildings.js";
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
      if (!(r.soldiers > 0 && r.soldiers <= regimentSize(r.unit))) {
        broken.push(`${at}: regiment ${r.id} has ${r.soldiers} ${r.unit}`);
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

  for (const faction of state.factions) {
    if (!Number.isInteger(faction.gold)) broken.push(`${at}: ${faction.id} has ${faction.gold} gold, not a whole number`);
    if (faction.alive && citiesOf(state, faction.id).length === 0) broken.push(`${at}: ${faction.id} is alive with no cities`);
    if (!faction.alive && armiesOf(state, faction.id).length > 0) broken.push(`${at}: fallen ${faction.id} still has armies`);
  }
  return broken;
}
