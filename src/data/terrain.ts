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
   * Bonus to the defender's strength in battle, e.g. 0.15 = +15%. In a city
   * it's added to the city bonus (data/combat.ts) and the walls
   * (data/buildings.ts): a hill city with stone walls gets 15% + 10% + 30% = +55%.
   */
  defenseBonus: number;
  /**
   * People this tile can support. A city's capacity is the total over its
   * territory, plus 1,000 (the sea's value) for each sea tile within its reach:
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
}

export const TERRAIN: Record<TerrainType, TerrainDef> = {
  water:     { name: "Sea",       moveCost: Infinity, passable: false, defenseBonus: 0,    capacity: 1000, growth: 0.035, mineable: false },
  plains:    { name: "Plains",    moveCost: 2,        passable: true,  defenseBonus: 0,    capacity: 3200, growth: 0.05,  mineable: false },
  forest:    { name: "Forest",    moveCost: 3,        passable: true,  defenseBonus: 0.1,  capacity: 1600, growth: 0.035, mineable: false },
  hills:     { name: "Hills",     moveCost: 3,        passable: true,  defenseBonus: 0.15, capacity: 1300, growth: 0.025, mineable: true },
  mountains: { name: "Mountains", moveCost: 4,        passable: true,  defenseBonus: 0.25, capacity: 400,  growth: 0.01,  mineable: true },
  desert:    { name: "Desert",    moveCost: 3,        passable: true,  defenseBonus: 0,    capacity: 150,  growth: 0.01,  mineable: false },
};

/**
 * Movement points to enter a tile of a city's land, by the level of its
 * roads (index = level; 0 means no roads, so the terrain's own moveCost).
 * Roads help every army, enemies included. Tracks ease rough ground, Roads
 * the mountains too, and Paved roads halve even the plains.
 */
export const ROAD_MOVE_COST: readonly (Partial<Record<TerrainType, number>> | null)[] = [
  null,
  { plains: 2, forest: 2, hills: 2, desert: 2, mountains: 4 },
  { plains: 2, forest: 2, hills: 2, desert: 2, mountains: 2 },
  { plains: 1, forest: 1, hills: 1, desert: 1, mountains: 1 },
];
