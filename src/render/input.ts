import type { Point, TileId } from "@/map/topology.js";
import type { MapCamera } from "@/render/mapView.js";

export interface InputHandlers {
  /** A tile was clicked, or null for empty space / Escape. */
  onSelect(tile: TileId | null): void;
  onHover(tile: TileId | null): void;
  /** The camera moved or zoomed. */
  onViewChange(): void;
  /** A tile was right-clicked: an order for the selected army. */
  onCommand(tile: TileId | null): void;
}

export interface InputController {
  /** Apply held-key panning. Returns true if the camera moved. */
  update(dtSeconds: number): boolean;
}

/** Pixels the pointer must move before a press counts as a drag, not a click. */
const DRAG_THRESHOLD = 5;
const KEY_PAN_SPEED = 700; // screen pixels per second

const PAN_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, 1], KeyW: [0, 1],
  ArrowDown: [0, -1], KeyS: [0, -1],
  ArrowLeft: [1, 0], KeyA: [1, 0],
  ArrowRight: [-1, 0], KeyD: [-1, 0],
};

/**
 * Turns raw browser events into camera moves and tile clicks. In later phases,
 * clicks here become game Actions.
 */
export function attachInput(
  canvas: HTMLCanvasElement,
  camera: MapCamera,
  pick: (screenPoint: Point) => TileId | null,
  handlers: InputHandlers,
): InputController {
  let pressStart: Point | null = null;
  let lastPointer: Point | null = null;
  let dragging = false;
  const heldKeys = new Set<string>();

  const localPoint = (e: MouseEvent): Point => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const tileAt = (screen: Point): TileId | null => pick(screen);

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    pressStart = lastPointer = localPoint(e);
    dragging = false;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
    const p = localPoint(e);
    if (pressStart && lastPointer) {
      if (!dragging && Math.hypot(p.x - pressStart.x, p.y - pressStart.y) > DRAG_THRESHOLD) {
        dragging = true;
        canvas.classList.add("dragging");
      }
      if (dragging) {
        camera.panBy(p.x - lastPointer.x, p.y - lastPointer.y);
        handlers.onViewChange();
      }
      lastPointer = p;
    }
    if (!dragging) handlers.onHover(tileAt(p));
  });

  const endPress = (e: PointerEvent, cancelled: boolean) => {
    if (!pressStart) return;
    if (!dragging && !cancelled) handlers.onSelect(tileAt(localPoint(e)));
    pressStart = lastPointer = null;
    dragging = false;
    canvas.classList.remove("dragging");
  };
  canvas.addEventListener("pointerup", (e) => endPress(e, false));
  canvas.addEventListener("pointercancel", (e) => endPress(e, true));
  canvas.addEventListener("pointerleave", () => {
    if (!pressStart) handlers.onHover(null);
  });

  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    handlers.onCommand(tileAt(localPoint(e)));
  });

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      camera.zoomAt(localPoint(e), Math.exp(-e.deltaY * 0.0015));
      handlers.onViewChange();
    },
    { passive: false },
  );

  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.code in PAN_KEYS) {
      heldKeys.add(e.code);
      e.preventDefault();
    } else if (e.code === "Escape") {
      handlers.onSelect(null);
    }
  });
  window.addEventListener("keyup", (e) => heldKeys.delete(e.code));
  window.addEventListener("blur", () => heldKeys.clear());

  return {
    update(dt) {
      if (heldKeys.size === 0) return false;
      let dx = 0;
      let dy = 0;
      for (const key of heldKeys) {
        dx += PAN_KEYS[key][0];
        dy += PAN_KEYS[key][1];
      }
      if (dx === 0 && dy === 0) return false;
      camera.panBy(dx * KEY_PAN_SPEED * dt, dy * KEY_PAN_SPEED * dt);
      return true;
    },
  };
}
