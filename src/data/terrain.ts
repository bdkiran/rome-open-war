/**
 * Terrain rules. All tunable numbers live here so balancing never means
 * hunting through game logic.
 */
export type TerrainType = "water" | "plains" | "forest" | "hills" | "mountains" | "desert";

export interface TerrainDef {
  name: string;
  /**
   * Movement points needed to enter the tile. A plains step costs 2, rough
   * ground (forest, hills, desert) 3 and mountains 4. With 12 movement,
   * infantry cover 6 tiles of plains, 4 of rough ground or 3 of mountains in a
   * turn (see data/units.ts).
   */
  moveCost: number;
  /** Whether land armies can enter at all. Impassable tiles are never claimed as territory. */
  passable: boolean;
  /**
   * Bonus to the defender's strength in battle, e.g. 0.1125 = +11.25%. In a
   * city it's added to the city bonus (data/combat.ts) and the walls
   * (data/buildings.ts): a hill city with stone walls gets 11.25% + 10% + 30%
   * = +51.25%.
   */
  defenseBonus: number;
  /**
   * People this tile can support. A city's capacity is the total over its
   * territory, plus 500 (the sea's value) for each sea tile within its reach:
   * the sea is never claimed as land, but it feeds coastal cities as fishing
   * grounds, and counts toward their growth rate too.
   */
  capacity: number;
  /**
   * Population growth per turn this terrain contributes, e.g. 0.03 = 3%.
   * A city's base growth rate is the average over its territory.
   */
  growth: number;
  /** Whether a mine (data/buildings.ts) earns gold from this tile. */
  mineable: boolean;
  /** Open ground, where attacking cavalry can charge (see data/units.ts). */
  openGround: boolean;
}

export const TERRAIN: Record<TerrainType, TerrainDef> = {
  water:     { name: "Sea",       moveCost: Infinity, passable: false, defenseBonus: 0,    capacity: 500,   growth: 0.03675, mineable: false, openGround: false },
  plains:    { name: "Plains",    moveCost: 2,        passable: true,  defenseBonus: 0,    capacity: 1600,  growth: 0.0525, mineable: false, openGround: true },
  forest:    { name: "Forest",    moveCost: 3,        passable: true,  defenseBonus: 0.075, capacity: 800,   growth: 0.03675, mineable: false, openGround: false },
  hills:     { name: "Hills",     moveCost: 3,        passable: true,  defenseBonus: 0.1125, capacity: 650,   growth: 0.02625, mineable: true,  openGround: false },
  mountains: { name: "Mountains", moveCost: 4,        passable: true,  defenseBonus: 0.1875, capacity: 200,   growth: 0.0105, mineable: true,  openGround: false },
  desert:    { name: "Desert",    moveCost: 3,        passable: true,  defenseBonus: 0,    capacity: 75,    growth: 0.0105, mineable: false, openGround: true },
};

/**
 * Movement points to enter a road tile, whatever its terrain, by the level of
 * the roads of the city whose land it's in (index = level; 0 means no roads
 * built, so the terrain's own moveCost). Only the roads themselves are
 * faster (`GameState.roads`); the rest of a city's land costs what its
 * terrain does. Roads serve every army, enemies included. Halves and
 * quarters only, so sums stay exact.
 */
export const ROAD_MOVE_COST: readonly number[] = [Infinity, 1.5, 1, 0.5];
