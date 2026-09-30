import type { TerrainType } from "@/data/terrain.js";

/** Terrain palette: muted, like a campaign map on a staff officer's table. */
export const TERRAIN_COLORS: Record<TerrainType, string> = {
  water: "#35637a",
  plains: "#a7b46f",
  forest: "#56784a",
  hills: "#b29c6b",
  mountains: "#857d74",
  desert: "#d6bf8c",
};

/** Dark or light text, whichever reads better on the given hex color. */
export function contrastText(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#1b252b" : "#f7f2e4";
}
