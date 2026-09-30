import type { UnitType } from "@/data/units.js";

/**
 * The unit figures shown in the panels (regiment boxes, recruitment). Each is
 * described as drawing calls on a 64 x 64 box (ground at y = 62) and turned
 * into an SVG string.
 */
interface Painter {
  /** An SVG path in the figure's 64 x 64 box. */
  path(d: string, fill: string | null, stroke?: string | null, width?: number): void;
  circle(cx: number, cy: number, r: number, fill: string | null, stroke?: string | null, width?: number): void;
  ellipse(cx: number, cy: number, rx: number, ry: number, fill: string, stroke?: string | null, width?: number): void;
  line(x1: number, y1: number, x2: number, y2: number, stroke: string, width: number): void;
}

const INK = "#1b252b";
const SKIN = "#e3c29b";
const METAL = "#c9ccd1";
const WOOD = "#7d5530";
const HORSE = "#6f4a2c";
const STRING = "#efe6cf";

/** Draws a unit's figure. `color` is the faction's color, worn as tunic, shield or saddle cloth. */
function drawFigure(p: Painter, unit: UnitType, color: string): void {
  if (unit === "cavalry") drawRider(p, color, 0);
  else drawFootSoldier(p, unit, color, 0);
}

function drawFootSoldier(p: Painter, unit: "spearmen" | "archers", color: string, stride: number): void {
  const swing = 6 * stride;
  // Legs
  p.line(29, 44, 29 + swing, 61, INK, 4);
  p.line(35, 44, 35 - swing, 61, INK, 4);

  if (unit === "archers") {
    // Quiver on the back, arrows showing
    p.line(24, 20, 21, 14, WOOD, 1.2);
    p.line(26, 20, 25, 13, WOOD, 1.2);
    p.path("M21 21 L27 20 L28 38 L23 39 Z", WOOD, INK, 1.2);
  }

  // Tunic and belt
  p.path("M23 25 Q32 21 41 25 L43 47 L21 47 Z", color, INK, 1.6);
  p.line(22.5, 38, 41.5, 38, INK, 2);
  // Head and helmet
  p.circle(32, 16, 6, SKIN, INK, 1.4);
  if (unit === "spearmen") {
    p.path("M25.3 15.5 A6.7 6.7 0 0 1 38.7 15.5 Z", METAL, INK, 1.2);
    p.line(32, 9, 32, 6.5, color, 2.2);
  } else {
    p.path("M25.5 15 Q32 5 38.5 15 Q32 12 25.5 15 Z", color, INK, 1.2);
  }

  if (unit === "spearmen") {
    // Spear and round shield
    p.line(45, 8, 45, 60, WOOD, 2.2);
    p.path("M45 1 L47.8 9 L42.2 9 Z", METAL, INK, 1);
    p.line(39, 29, 45, 33, SKIN, 3.4);
    p.circle(24, 34, 8.5, shade(color, -0.25), INK, 1.8);
    p.circle(24, 34, 2.2, METAL, INK, 0.8);
  } else {
    // Bow held out in front, string drawn
    p.path("M43 12 Q56 32 43 52", null, WOOD, 2.6);
    p.line(43, 12, 43, 52, STRING, 0.9);
    p.line(38, 29, 44, 31, SKIN, 3.4);
  }
}

function drawRider(p: Painter, color: string, stride: number): void {
  const swing = 5 * stride;
  // Horse legs, tail, body, neck and head
  p.line(22, 44, 19 - swing, 61, HORSE, 3.4);
  p.line(26, 45, 26 + swing, 61, HORSE, 3.4);
  p.line(40, 45, 40 - swing, 61, HORSE, 3.4);
  p.line(44, 44, 47 + swing, 61, HORSE, 3.4);
  p.path("M17 36 Q10 43 13 53", null, HORSE, 3);
  p.ellipse(32, 39, 16, 7.5, HORSE, INK, 1.5);
  p.path("M42 35 L49 21 L57 23 L56 28 L50 29 L47 41 Z", HORSE, INK, 1.5);
  // Saddle cloth
  p.path("M25 33 L39 33 L38 45 L26 45 Z", color, INK, 1.4);
  // Rider: leg, body, head, helmet, lance
  p.line(33, 34, 31, 45, INK, 3.2);
  p.path("M28 18 L38 18 L39 34 L27 34 Z", color, INK, 1.4);
  p.circle(33, 12, 5.2, SKIN, INK, 1.3);
  p.path("M27.2 11.5 A5.8 5.8 0 0 1 38.8 11.5 Z", METAL, INK, 1.1);
  p.line(42, 2, 36, 40, WOOD, 2);
  p.path("M42.6 -2 L44.4 5 L39.8 4.3 Z", METAL, INK, 1);
  p.line(36, 22, 40, 20, SKIN, 3);
}

/** Lightens (amount > 0) or darkens (amount < 0) a hex color. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (c: number) => Math.round(Math.min(255, Math.max(0, amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));
  const r = channel((n >> 16) & 255);
  const g = channel((n >> 8) & 255);
  const b = channel(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// ---- Drawing into SVG -----------------------------------------------------

/** A figure as an inline SVG string, for the panels. */
export function figureSvg(unit: UnitType, color: string, className = "figure"): string {
  const parts: string[] = [];
  const attrs = (fill: string | null, stroke?: string | null, width?: number) =>
    `fill="${fill ?? "none"}"${stroke ? ` stroke="${stroke}" stroke-width="${width ?? 1}"` : ""} stroke-linecap="round" stroke-linejoin="round"`;
  const painter: Painter = {
    path: (d, fill, stroke, width) => parts.push(`<path d="${d}" ${attrs(fill, stroke, width)}/>`),
    circle: (cx, cy, r, fill, stroke, width) => parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" ${attrs(fill, stroke, width)}/>`),
    ellipse: (cx, cy, rx, ry, fill, stroke, width) =>
      parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" ${attrs(fill, stroke, width)}/>`),
    line: (x1, y1, x2, y2, stroke, width) =>
      parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${attrs(null, stroke, width)}/>`),
  };
  drawFigure(painter, unit, color);
  return `<svg class="${className}" viewBox="0 -4 64 68" aria-hidden="true">${parts.join("")}</svg>`;
}
