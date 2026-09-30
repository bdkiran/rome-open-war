import type { Point, TileId } from "@/map/topology.js";

/** UI-only state the map needs to draw. Not part of the game state. */
export interface ViewState {
  selected: TileId | null;
  hovered: TileId | null;
  /** Tiles the selected army can move to. */
  reachable: ReadonlySet<TileId>;
  /** Tiles the selected army can attack. */
  attackable: ReadonlySet<TileId>;
  /** This faction's armies are drawn faded once they've used up their movement. */
  activeFaction: string | null;
  /** Tiles the player can see; others are dimmed and enemy armies there are hidden. Null shows everything. */
  visible: ReadonlySet<TileId> | null;
  /** The selected army's march route, ending at its destination. */
  route: readonly TileId[];
  /** For each tile of the route, the turn it's reached on (0 = this turn). */
  routeTurns: readonly number[];
}

/** Moving the view: what the mouse, keyboard and "go to" buttons need. */
export interface MapCamera {
  /** Move the view by a distance in screen pixels (e.g. a mouse drag). */
  panBy(dxScreen: number, dyScreen: number): void;
  /** Zoom by a factor, keeping the point under the cursor in place. */
  zoomAt(screenPoint: Point, factor: number): void;
  /** Look at a point on the map, optionally at a zoom level (1 is the default scale). */
  centerOn(worldPoint: Point, zoom?: number): void;
  /** Show the whole map. */
  fitToBounds(): void;
}
