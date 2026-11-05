import type { Tier, UnitType } from "@/data/units.js";

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
const SKIN_SHADE = "#c9a47c";
const BRONZE = "#c39a52";
const BRONZE_SHADE = "#8f6c34";
const IRON = "#c9ccd1";
const WOOD = "#7d5530";
const LEATHER = "#5a3e26";
const LEGS = "#2f3a40";
const BOOTS = "#3b2c1e";
const HAIR = "#5b3b22";
const HORSE = "#7a5232";
const HORSE_SHADE = "#5e3d24";
const MANE = "#2f2219";
const STRING = "#efe6cf";
const SCOUT_CLOAK = "#3f3529";
const SHADOW = "rgba(0, 0, 0, 0.22)";

/**
 * Draws a unit's figure. `color` is the faction's colour, worn as the tunic
 * (shaded darker on its far side), the shield, the crest or cap, and the
 * horse's saddle cloth. One set for every faction; only the colour changes.
 * Better-trained regiments are better equipped: a mail shirt at Advanced, a
 * bronze cuirass, a cloak and a taller crest at Elite.
 */
function drawFigure(p: Painter, unit: UnitType, color: string, tier: Tier): void {
  if (unit === "cavalry") drawRider(p, color, tier);
  else drawFootSoldier(p, unit, color, unit === "militia" ? 1 : tier);
}

/** A cloak hanging behind the shoulders (elite). */
function cloak(p: Painter, color: string, x: number, y: number, length: number): void {
  p.path(`M${x - 9} ${y} Q${x - 14} ${y + length * 0.6} ${x - 12} ${y + length} L${x - 3} ${y + length - 2} L${x + 2} ${y + 1} Z`, shade(color, -0.38), INK, 1.1);
}

/** Armour over the chest: mail (advanced) or a bronze cuirass (elite). Top centre at (x, y). */
function armour(p: Painter, tier: Tier, x: number, y: number, width: number, height: number): void {
  if (tier === 1) return;
  const w = width / 2;
  const d = `M${x - w} ${y + 2} Q${x} ${y - 2} ${x + w} ${y + 2} L${x + w + 1} ${y + height} Q${x} ${y + height + 2} ${x - w - 1} ${y + height} Z`;
  if (tier === 2) {
    p.path(d, "#9ea4aa", INK, 1.2);
    for (let row = 1; row <= 3; row++) {
      const yy = y + (row * height) / 4;
      p.path(`M${x - w + 1} ${yy} Q${x} ${yy + 1.6} ${x + w - 1} ${yy}`, null, "#6f767c", 0.8);
    }
  } else {
    p.path(d, BRONZE, INK, 1.2);
    p.path(`M${x} ${y + 1} L${x} ${y + height - 1}`, null, BRONZE_SHADE, 1);
    p.path(`M${x - w + 2} ${y + height * 0.45} Q${x - w / 2} ${y + height * 0.62} ${x - 0.5} ${y + height * 0.45} M${x + 0.5} ${y + height * 0.45} Q${x + w / 2} ${y + height * 0.62} ${x + w - 2} ${y + height * 0.45}`, null, BRONZE_SHADE, 0.9);
  }
}

/** Legs, boots, tunic, armour, belt and head: what every foot soldier shares. Faces right. */
function body(p: Painter, color: string, tier: Tier): void {
  p.ellipse(32, 61.5, 14, 2.6, SHADOW);
  if (tier === 3) cloak(p, color, 27, 24, 30);
  // Legs and boots
  p.path("M26 46 L24.5 59 L29 59 L30 46 Z", LEGS, INK, 1.2);
  p.path("M34 46 L36 59 L40.5 59 L38.5 46 Z", LEGS, INK, 1.2);
  p.path("M23.5 58 Q23.5 61 26.5 61 L30 61 L29.5 58 Z", BOOTS, INK, 1);
  p.path("M35.5 58 L35.5 61 L41.5 61 Q42 58 40 58 Z", BOOTS, INK, 1);
  // Tunic, its far side in shade, and a belt
  p.path("M21.5 27 Q32 22.5 42.5 27 L44.5 48 Q32 50.5 19.5 48 Z", color, INK, 1.6);
  p.path("M33 24 Q38.5 24.6 42.5 27 L44.5 48 Q39 49.4 34 49.6 Z", shade(color, -0.2), null);
  p.path("M21.5 27 Q32 22.5 42.5 27 L44.5 48 Q32 50.5 19.5 48 Z", null, INK, 1.6);
  armour(p, tier, 32, 24.5, 21, 15);
  p.path("M20.8 40 Q32 42 43.4 40 L43.6 43 Q32 45 20.6 43 Z", LEATHER, INK, 1);
  // Neck and head
  p.path("M29.5 22 L34.5 22 L34 26 L30 26 Z", SKIN_SHADE, null);
  p.circle(32, 16.5, 6.6, SKIN, INK, 1.4);
}

function drawFootSoldier(p: Painter, unit: "militia" | "spearmen" | "archers", color: string, tier: Tier): void {
  if (unit === "spearmen") {
    // The spear stands behind him; the shield hangs on his near arm.
    p.line(47, 4, 47, 60, WOOD, 2.4);
    p.path("M47 -2.5 L50 7 L47 9 L44 7 Z", IRON, INK, 1.1);
  }
  if (unit === "archers") {
    // Quiver across his back, fletchings showing
    p.path("M19 20 L25 18.5 L27.5 40 L22 41.5 Z", LEATHER, INK, 1.2);
    p.path("M19.5 19.5 L18 14.5 L20.5 15 Z M22 19 L21.5 13.5 L24 14.5 Z", "#e9e1cc", INK, 0.8);
  }

  body(p, color, tier);

  if (unit === "militia") {
    // Bare-headed, a tuft of hair; a heavy club over the shoulder
    p.path("M25.4 16 Q25.5 9 32 9 Q38.6 9 38.6 15.5 Q36 12.5 32.5 13.2 Q28.5 12.6 25.4 16 Z", HAIR, INK, 1.1);
    p.line(39.5, 30, 44.5, 25, SKIN, 3.6);
    p.path("M42 28 L50 8 Q52.5 6 54 8 L54.5 12 L45.5 29.5 Z", WOOD, INK, 1.2);
    p.circle(51.5, 10, 1, INK, null);
    p.circle(49.5, 14, 1, INK, null);
    return;
  }

  if (unit === "spearmen") {
    // A bronze helmet with a crest in his colours, cheek guard down
    p.path("M25 17 Q25 8.6 32 8.4 Q39.2 8.6 39.2 17 L37 17 L36.5 13.5 L27.5 13.5 L27 21 L25 20 Z", BRONZE, INK, 1.2);
    if (tier === 3) p.path("M24.5 10 Q29 -3.5 41.5 4.5 Q36.5 4.5 32 8.3 Q28 8.2 24.5 10 Z", color, INK, 1.1);
    else p.path("M26 9.5 Q32 1.5 39.5 6.5 Q36 6 32 8.3 Q28.5 8.2 26 9.5 Z", color, INK, 1.1);
    p.line(39.5, 29, 46.5, 33, SKIN, 3.6);
    // A big round shield, rimmed in bronze, with a boss
    p.circle(23, 35, 11.5, color, INK, 1.6);
    p.path("M23 23.5 A11.5 11.5 0 0 1 23 46.5 A9 11.5 0 0 0 23 23.5 Z", shade(color, -0.22), null);
    p.circle(23, 35, 11.5, null, BRONZE, 2.2);
    p.circle(23, 35, 11.5, null, INK, 0.9);
    p.circle(23, 35, 2.8, BRONZE, INK, 0.9);
    return;
  }

  // Archers: a soft cap in his colours; a bow drawn, an arrow on the string
  if (tier === 3) p.path("M27.5 10.5 Q24 3 27 -0.5 Q28.5 5 30 9.5 Z", "#efe6cf", INK, 0.9);
  p.path("M25.3 16 Q25 8.5 32.5 8.8 Q36 9 38.5 11.5 L42 10 L39.2 15.6 Q32 13.2 25.3 16 Z", color, INK, 1.2);
  p.path("M45 10 Q57 32 45 54", null, WOOD, 2.8);
  p.path("M45 10 Q57 32 45 54", null, INK, 0.6);
  p.line(45, 10, 38.5, 31.5, STRING, 0.9);
  p.line(38.5, 31.5, 45, 54, STRING, 0.9);
  p.line(38.5, 31.5, 58, 31.5, "#c9b48a", 1.3);
  p.path("M58 29.8 L61.5 31.5 L58 33.2 Z", IRON, INK, 0.7);
  p.line(36, 29, 39, 31.5, SKIN, 3.4);
  p.line(41, 31, 50.5, 31.5, SKIN, 3.4);
}

/**
 * A scout: a spy on foot, not a soldier. A long dark cloak with its hood up
 * hides most of him; his tunic shows his colours down the front, one hand
 * holds the cloak shut, and he carries no weapon.
 */
function drawSpy(p: Painter, color: string): void {
  p.ellipse(32, 61.5, 13, 2.6, SHADOW);
  // Legs and boots below the cloak
  p.path("M27 50 L26 59 L30 59 L30.5 50 Z", LEGS, INK, 1.1);
  p.path("M33.5 50 L34 59 L38 59 L37 50 Z", LEGS, INK, 1.1);
  p.path("M25 58 Q25 61 28 61 L30.5 61 L30 58 Z", BOOTS, INK, 1);
  p.path("M33.5 58 L33.5 61 L39 61 Q39.5 58 37.5 58 Z", BOOTS, INK, 1);
  // The cloak behind him, flaring to his shins
  p.path("M22.5 21 Q32 16.5 41.5 21 L46.5 55 Q32 58.5 17.5 55 Z", SCOUT_CLOAK, INK, 1.5);
  // His tunic in his colours, showing where the cloak falls open
  p.path("M28.5 23.5 L35.5 23.5 L37.5 53 L26.5 53 Z", color, INK, 1.2);
  p.path("M32 23.5 L35.5 23.5 L37.5 53 L32.5 53 Z", shade(color, -0.2), null);
  p.path("M27.3 40 L36.7 40 L36.9 42.6 L27.1 42.6 Z", LEATHER, INK, 0.9);
  // The cloak's front edges, drawn over the tunic
  p.path("M22.5 21 L29.5 23.5 L27.5 54.5 L18 55 Z", SCOUT_CLOAK, INK, 1.2);
  p.path("M41.5 21 L34.5 23.5 L36.5 54.5 L46 55 Z", shade(SCOUT_CLOAK, -0.2), INK, 1.2);
  // A hand holding the cloak shut
  p.circle(34.8, 33, 2.4, SKIN, INK, 1);
  // The hood up, his face in its shadow
  p.circle(32, 16.5, 6, SKIN, INK, 1.3);
  p.path("M27 17 Q32 14.2 37 17 L37 19.5 Q32 17.5 27 19.5 Z", "rgba(0, 0, 0, 0.35)", null);
  p.path("M24.6 22.5 Q22.8 6.8 32 6.2 Q41.2 6.8 39.4 22.5 Q37.6 18 37.2 14.2 Q32 11 26.8 14.2 Q26.4 18 24.6 22.5 Z", SCOUT_CLOAK, INK, 1.3);
}

/** A rider on his horse, with a lance and a small shield. */
function drawRider(p: Painter, color: string, tier: Tier): void {
  p.ellipse(33, 61.5, 21, 2.6, SHADOW);
  if (tier === 3) p.path("M27 18 Q18 21 13 30 L19 31 Q23 25 28.5 22 Z", shade(color, -0.38), INK, 1.1);
  // Far legs, in shade
  p.path("M23 44 L20 56 L18 60.5 L21.5 60.5 L24 56 L27.5 45 Z", HORSE_SHADE, INK, 1.1);
  p.path("M41 45 L43.5 55 L42.5 60.5 L46 60.5 L47 55 L45.5 44 Z", HORSE_SHADE, INK, 1.1);
  // Tail
  p.path("M14.5 33 Q8.5 38 10 50 Q12.5 44 16.5 37.5 Z", MANE, INK, 1);
  // Body, chest and neck, head with ears
  p.path("M15 35 Q15.5 28 25 28.5 L42 28 Q46 22 49 15 Q51 11 55 12 L59.5 17.5 Q60.5 20 58 20.5 L53.5 20 Q50 30 49 38 Q48 46 40 46.5 L22 46.5 Q15 45 15 35 Z", HORSE, INK, 1.5);
  p.path("M51 12.5 L52 8.5 L54 12 Z", HORSE, INK, 1);
  p.path("M46.5 21 Q48.5 13 52 11.5 Q49.5 15.5 48.5 24 Z", MANE, null);
  p.circle(55.2, 15.5, 0.9, INK, null);
  // Near legs, with hooves
  p.path("M25 44 L26.5 56 L25.5 60.5 L29.5 60.5 L30.5 56 L30 45 Z", HORSE, INK, 1.1);
  p.path("M38 45 L37 56 L35.5 60.5 L39.5 60.5 L41 56 L42.5 44.5 Z", HORSE, INK, 1.1);
  p.path("M25.3 59 L29.8 59 L29.5 61 L25.2 61 Z M35.8 59 L39.8 59 L39.5 61 L35.3 61 Z", INK, null);
  // Saddle cloth in his colours, with a trim
  p.path("M24 30 L40 30 L39 44 Q32 45.5 25 44 Z", color, INK, 1.3);
  p.path("M25 41.5 Q32 43 39.2 41.5", null, shade(color, 0.45), 1.6);
  // Rider: leg, body, arm, head and helmet
  p.path("M30 33 L33.5 33 L32.5 44 L29.5 44 Z", LEGS, INK, 1);
  p.path("M29.5 43 L33.5 43 L34 46 L28.5 46 Z", BOOTS, INK, 0.9);
  p.path("M26.5 17.5 Q32 15 37.5 17.5 L39 33 L26 33 Z", color, INK, 1.4);
  p.path("M32.5 16 Q36 16 37.5 17.5 L39 33 L33 33 Z", shade(color, -0.2), null);
  p.path("M26.5 17.5 Q32 15 37.5 17.5 L39 33 L26 33 Z", null, INK, 1.4);
  armour(p, tier, 32.5, 16.2, 11, 12);
  p.circle(32.5, 10.5, 5.6, SKIN, INK, 1.3);
  p.path("M26.6 11 Q26.8 4.2 32.5 4 Q38.3 4.2 38.4 11 L36.4 11 L36 8.4 L28.8 8.4 L28.5 14 L26.6 13 Z", BRONZE, INK, 1.1);
  if (tier === 3) p.path("M26.4 5.6 Q30 -6 41 0.4 Q35.8 1.2 32.5 4 Q29.4 3.8 26.4 5.6 Z", color, INK, 1);
  else p.path("M27.6 4.8 Q32.5 -1.5 38.6 2.4 Q35.5 2.4 32.5 4 Q29.8 3.8 27.6 4.8 Z", color, INK, 1);
  // Elite horses wear a bronze face plate.
  if (tier === 3) p.path("M52 13 L57.5 17 L56.5 19 L51 16.5 Z", BRONZE, INK, 0.8);
  // A lance couched under his arm, pennon at the tip
  p.line(20, 40, 47, -1, WOOD, 2.2);
  p.path("M47 -1 L49.5 -4 L48.6 1.2 Z", IRON, INK, 0.8);
  p.path("M45.2 2 L51 3.6 L44 6.4 Z", color, INK, 0.7);
  p.line(36.5, 21, 41, 25.5, SKIN, 3.2);
  // A small round shield on his far side
  p.circle(25, 26, 5.6, shade(color, -0.25), INK, 1.2);
  p.circle(25, 26, 1.4, BRONZE, INK, 0.6);
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
export function figureSvg(unit: UnitType, color: string, tier: Tier = 1, className = "figure"): string {
  return svgOf((p) => drawFigure(p, unit, color, tier), className);
}

/** A scout as an inline SVG string: a spy on foot in a long dark hooded cloak, unarmed. */
export function scoutSvg(color: string, className = "figure"): string {
  return svgOf((p) => drawSpy(p, color), className);
}

function svgOf(draw: (painter: Painter) => void, className: string): string {
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
  draw(painter);
  return `<svg class="${className}" viewBox="0 -4 64 68" aria-hidden="true">${parts.join("")}</svg>`;
}
