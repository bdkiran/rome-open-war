import type { Culture } from "@/data/cultures.js";

/**
 * A general's portrait for the panels: a head-and-shoulders bust, drawn in
 * the same inked, flat style as the unit figures (figures.ts) on a 64 x 64
 * box. His face is picked from his name, so the same general always looks the
 * same and nothing about his looks needs saving: skin, age, hair, beard, nose,
 * brows and the shape of his face. His culture sets which of those are likely
 * (Celts fair and moustached, Carthaginians bearded, Romans clean-shaven).
 * He wears a bronze cuirass and a cloak in his faction's colour.
 */
export function portraitSvg(name: string, culture: Culture, color: string, className = "portrait"): string {
  const face = faceOf(name, culture);
  const parts: string[] = [];
  draw(parts, face, color);
  return `<svg class="${className}" viewBox="5 3 54 61" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${parts.join("")}</svg>`;
}

const INK = "#1b252b";
const BRONZE = "#c39a52";
const BRONZE_SHADE = "#8f6c34";
const SKINS = ["#f2d2ae", "#e6bf96", "#d6a77b", "#c18d60", "#a06f47", "#80553a"];
const HAIRS = { black: "#2a211c", dark: "#4a3222", brown: "#6e4a2c", auburn: "#8a4a26", fair: "#c49a5a", red: "#a5512a" };
const GREY = "#9a9894";
const WHITE = "#d9d6cf";

type HairStyle = "cropped" | "curly" | "long" | "receding" | "bald";
type Beard = "none" | "stubble" | "short" | "full" | "moustache";
type Nose = "straight" | "hooked" | "broad";

interface Face {
  skin: string;
  hair: string;
  style: HairStyle;
  beard: Beard;
  nose: Nose;
  /** 0 young, 1 in his prime, 2 old (grey, lined). */
  age: 0 | 1 | 2;
  /** Face width and length, as small offsets. */
  wide: number;
  long: number;
  /** Heavy brows. */
  brow: number;
  /** Squarer jaw. */
  jaw: number;
}

/** What's likely for each culture: skin tones (indexes into SKINS), hair colours, styles and beards to pick from. */
const LOOKS: Record<Culture, { skins: number[]; hairs: (keyof typeof HAIRS)[]; styles: HairStyle[]; beards: Beard[] }> = {
  roman: { skins: [1, 2, 2, 3], hairs: ["black", "dark", "dark", "brown"], styles: ["cropped", "cropped", "receding", "curly", "bald"], beards: ["none", "none", "none", "stubble", "short"] },
  hellenistic: { skins: [1, 2, 3, 3], hairs: ["black", "dark", "brown", "brown"], styles: ["curly", "curly", "cropped", "receding"], beards: ["none", "short", "full", "full"] },
  punic: { skins: [2, 3, 4, 4, 5], hairs: ["black", "black", "dark"], styles: ["curly", "curly", "cropped", "bald"], beards: ["full", "full", "short", "short", "none"] },
  celtic: { skins: [0, 0, 1, 1], hairs: ["fair", "red", "auburn", "brown", "fair"], styles: ["long", "long", "cropped", "receding"], beards: ["moustache", "moustache", "full", "short", "none"] },
  thracian: { skins: [0, 1, 1, 2], hairs: ["brown", "dark", "auburn", "fair"], styles: ["long", "curly", "cropped", "receding"], beards: ["full", "full", "short", "moustache"] },
};

/** A face from a name: a hash of it seeds every choice. */
function faceOf(name: string, culture: Culture): Face {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  const next = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(next() * list.length)];
  const look = LOOKS[culture];
  const age = pick([0, 1, 1, 2] as const);
  const base = HAIRS[pick(look.hairs)];
  return {
    skin: SKINS[pick(look.skins)],
    hair: age === 2 ? (next() < 0.5 ? GREY : WHITE) : base,
    style: age === 0 && pick([true, false]) ? pick(look.styles.filter((s) => s !== "bald" && s !== "receding")) : pick(look.styles),
    beard: pick(look.beards),
    nose: pick(["straight", "straight", "hooked", "broad"] as const),
    age,
    wide: next() * 2.4 - 1.2,
    long: next() * 2.4 - 1.2,
    brow: next(),
    jaw: next(),
  };
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));
  return `#${((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, "0")}`;
}

function draw(out: string[], f: Face, color: string): void {
  const path = (d: string, fill: string | null, stroke: string | null = INK, width = 1.2) =>
    out.push(`<path d="${d}" fill="${fill ?? "none"}"${stroke ? ` stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"` : ""}/>`);
  const ellipse = (cx: number, cy: number, rx: number, ry: number, fill: string, stroke: string | null = INK, width = 1.2) =>
    out.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${width}"` : ""}/>`);

  const skinShade = shade(f.skin, -0.16);
  const hairShade = shade(f.hair, -0.3);
  const cx = 32;
  const rx = 10.5 + f.wide * 0.9;
  const top = 12 - f.long * 0.6;
  const chin = 40 + f.long * 0.8;
  const cheekY = 28;
  const jawX = rx - 2.2 + f.jaw * 1.6;

  // Shoulders: cloak in his colour over a bronze cuirass, pinned with a brooch.
  path(`M6 64 Q8 48 22 45 L42 45 Q56 48 58 64 Z`, color, INK, 1.4);
  path(`M44 46 Q55 50 58 64 L50 64 Q48 54 42 47 Z`, shade(color, -0.3), INK, 1);
  path(`M22 46 Q32 50 42 46 L45 64 L19 64 Z`, BRONZE, INK, 1.3);
  path(`M26 52 Q32 55 38 52 M32 49 L32 64`, null, BRONZE_SHADE, 1);
  path(`M8 64 Q10 50 22 46 L26 52 Q20 56 18 64 Z`, color, INK, 1.2);
  ellipse(23.5, 49, 2.2, 2.2, "#e8c35a", INK, 1);
  // Neck
  path(`M${cx - 5} ${chin - 4} L${cx - 5.5} 47 Q${cx} 49 ${cx + 5.5} 47 L${cx + 5} ${chin - 4} Z`, skinShade, INK, 1.2);

  // Long hair falls behind the head.
  if (f.style === "long") path(`M${cx - rx - 1} ${cheekY - 6} Q${cx - rx - 4} ${chin + 2} ${cx - rx + 1} ${chin + 6} L${cx + rx - 1} ${chin + 6} Q${cx + rx + 4} ${chin + 2} ${cx + rx + 1} ${cheekY - 6} Z`, hairShade, INK, 1.2);

  // Ears, then the face.
  ellipse(cx - rx - 0.4, cheekY, 2, 3.2, skinShade);
  ellipse(cx + rx + 0.4, cheekY, 2, 3.2, skinShade);
  path(
    `M${cx - rx} ${cheekY - 6} Q${cx - rx} ${top} ${cx} ${top} Q${cx + rx} ${top} ${cx + rx} ${cheekY - 6} ` +
      `L${cx + rx} ${cheekY + 2} Q${cx + jawX} ${chin - 3} ${cx + 3} ${chin} Q${cx} ${chin + 0.8} ${cx - 3} ${chin} Q${cx - jawX} ${chin - 3} ${cx - rx} ${cheekY + 2} Z`,
    f.skin,
    INK,
    1.4,
  );
  // Shadow on his far cheek.
  path(`M${cx + rx - 0.6} ${cheekY - 4} L${cx + rx - 0.6} ${cheekY + 2} Q${cx + jawX - 0.6} ${chin - 3.4} ${cx + 3} ${chin - 0.6} Q${cx + rx - 4} ${cheekY + 2} ${cx + rx - 3} ${cheekY - 4} Z`, skinShade, null);

  // Beard and moustache.
  const mouthY = chin - 5.5;
  if (f.beard === "full" || f.beard === "short") {
    const drop = f.beard === "full" ? 5 : 1.6;
    path(
      `M${cx - rx} ${cheekY} Q${cx - jawX} ${chin + drop - 2} ${cx} ${chin + drop} Q${cx + jawX} ${chin + drop - 2} ${cx + rx} ${cheekY} ` +
        `L${cx + rx - 1.5} ${cheekY + 1} Q${cx + 5} ${mouthY - 1} ${cx} ${mouthY - 1.6} Q${cx - 5} ${mouthY - 1} ${cx - rx + 1.5} ${cheekY + 1} Z`,
      f.hair,
      INK,
      1.2,
    );
    if (f.beard === "full") path(`M${cx - 4} ${chin} Q${cx - 2} ${chin + 3} ${cx - 3} ${chin + 4} M${cx + 3} ${chin - 1} Q${cx + 2.5} ${chin + 2} ${cx + 3.5} ${chin + 3.5}`, null, hairShade, 0.9);
  } else if (f.beard === "stubble") {
    path(`M${cx - rx + 1} ${cheekY + 2} Q${cx - jawX + 0.5} ${chin - 3} ${cx} ${chin - 0.2} Q${cx + jawX - 0.5} ${chin - 3} ${cx + rx - 1} ${cheekY + 2} Q${cx + 4} ${mouthY + 0.5} ${cx} ${mouthY - 1.5} Q${cx - 4} ${mouthY + 0.5} ${cx - rx + 1} ${cheekY + 2} Z`, shade(f.skin, -0.28), null);
  }
  if (f.beard === "moustache" || f.beard === "full" || f.beard === "short") {
    const droop = f.beard === "moustache" ? 4.5 : 1.2;
    path(`M${cx - 5.5} ${mouthY + droop} Q${cx - 5} ${mouthY - 2.2} ${cx} ${mouthY - 1.8} Q${cx + 5} ${mouthY - 2.2} ${cx + 5.5} ${mouthY + droop} Q${cx + 3} ${mouthY - 0.4} ${cx} ${mouthY - 0.6} Q${cx - 3} ${mouthY - 0.4} ${cx - 5.5} ${mouthY + droop} Z`, f.hair, INK, 1);
  }
  // Mouth
  path(`M${cx - 2.8} ${mouthY + 0.3} Q${cx} ${mouthY + (f.age === 2 ? 0 : 1)} ${cx + 2.8} ${mouthY + 0.3}`, null, INK, 1.1);

  // Nose
  const noseTop = cheekY - 4;
  const noseTip = cheekY + 3.5 + f.long * 0.3;
  if (f.nose === "hooked") path(`M${cx - 0.6} ${noseTop} Q${cx + 2.8} ${noseTip - 3} ${cx + 1.6} ${noseTip} Q${cx} ${noseTip + 1} ${cx - 1.8} ${noseTip}`, null, INK, 1.1);
  else if (f.nose === "broad") path(`M${cx - 0.8} ${noseTop} L${cx - 1} ${noseTip - 1.5} M${cx - 3.2} ${noseTip - 0.4} Q${cx} ${noseTip + 1.6} ${cx + 3.2} ${noseTip - 0.4}`, null, INK, 1.1);
  else path(`M${cx - 0.4} ${noseTop} L${cx + 1.2} ${noseTip - 0.6} Q${cx} ${noseTip + 0.8} ${cx - 1.8} ${noseTip - 0.2}`, null, INK, 1.1);

  // Eyes and brows.
  const eyeY = cheekY - 4.5;
  for (const side of [-1, 1]) {
    const ex = cx + side * 4.4;
    ellipse(ex, eyeY, 1.7, 1.1, "#f4efe6", INK, 0.8);
    ellipse(ex + 0.3, eyeY + 0.1, 0.8, 0.9, INK, null);
    const lift = 2.6 + f.brow * 0.4;
    const heavy = 0.9 + f.brow * 1.1;
    path(`M${ex - 2.6 * side} ${eyeY - lift + 0.4} Q${ex} ${eyeY - lift - 1} ${ex + 2.6 * side} ${eyeY - lift + 0.8 * (1 - f.brow)}`, null, f.age === 2 ? GREY : hairShade, heavy);
    if (f.age === 2) path(`M${ex + 2.8 * side} ${eyeY + 0.4} l${1.4 * side} 0.6 M${ex + 2.6 * side} ${eyeY + 1.6} l${1.2 * side} 0.9`, null, skinShade, 0.7);
  }
  if (f.age >= 1) path(`M${cx - 4} ${mouthY - 3.6} Q${cx - 5.6} ${mouthY - 1} ${cx - 5} ${mouthY + 1.4} M${cx + 4} ${mouthY - 3.6} Q${cx + 5.6} ${mouthY - 1} ${cx + 5} ${mouthY + 1.4}`, null, skinShade, f.age === 2 ? 0.9 : 0.6);
  if (f.age === 2) path(`M${cx - 4} ${top + 5} Q${cx} ${top + 4} ${cx + 4} ${top + 5} M${cx - 3} ${top + 7} Q${cx} ${top + 6.2} ${cx + 3} ${top + 7}`, null, skinShade, 0.7);

  // Hair on top.
  const hairTop = top - 1.6;
  const temple = cheekY - 7;
  switch (f.style) {
    case "cropped":
      path(`M${cx - rx - 0.6} ${temple + 1} Q${cx - rx - 1} ${hairTop} ${cx} ${hairTop} Q${cx + rx + 1} ${hairTop} ${cx + rx + 0.6} ${temple + 1} L${cx + rx - 1} ${temple - 1} Q${cx + 4} ${top + 3.5} ${cx} ${top + 4.2} Q${cx - 4} ${top + 3.5} ${cx - rx + 1} ${temple - 1} Z`, f.hair, INK, 1.2);
      path(`M${cx - 5} ${top + 3.4} l-1 2 M${cx - 1} ${top + 4} l-0.6 2 M${cx + 3} ${top + 3.6} l-0.8 2`, null, hairShade, 0.9);
      break;
    case "curly":
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * (0.05 + (i / 6) * 0.9);
        ellipse(cx - Math.cos(a) * (rx + 0.2), top + 7 - Math.sin(a) * 8.5, 3.4, 3, f.hair, INK, 1);
      }
      ellipse(cx - 3, top + 4.2, 3, 2.6, f.hair, INK, 0.9);
      ellipse(cx + 3, top + 4.2, 3, 2.6, f.hair, INK, 0.9);
      break;
    case "long":
      path(`M${cx - rx - 1.4} ${cheekY + 4} Q${cx - rx - 2} ${hairTop} ${cx} ${hairTop} Q${cx + rx + 2} ${hairTop} ${cx + rx + 1.4} ${cheekY + 4} L${cx + rx - 0.6} ${temple + 1} Q${cx + 5} ${top + 2.6} ${cx - 1} ${top + 4.4} Q${cx - 6} ${top + 4} ${cx - rx + 0.6} ${temple + 1} Z`, f.hair, INK, 1.2);
      path(`M${cx - 2} ${hairTop + 1.4} Q${cx - 6} ${top + 2} ${cx - rx + 0.5} ${temple + 3} M${cx + 2} ${hairTop + 1.4} Q${cx + 6} ${top + 2} ${cx + rx - 0.5} ${temple + 3}`, null, hairShade, 0.8);
      break;
    case "receding":
      path(`M${cx - rx - 0.6} ${temple + 2} Q${cx - rx - 1} ${top + 1} ${cx - rx + 3} ${top + 1.4} L${cx - rx + 2.6} ${temple + 1.6} Z M${cx + rx + 0.6} ${temple + 2} Q${cx + rx + 1} ${top + 1} ${cx + rx - 3} ${top + 1.4} L${cx + rx - 2.6} ${temple + 1.6} Z`, f.hair, INK, 1.1);
      path(`M${cx - rx + 3} ${top + 1.2} Q${cx} ${hairTop - 0.6} ${cx + rx - 3} ${top + 1.2} Q${cx} ${top + 2.4} ${cx - rx + 3} ${top + 1.2} Z`, f.hair, INK, 1);
      break;
    case "bald":
      path(`M${cx - rx - 0.6} ${temple + 3} Q${cx - rx - 0.4} ${temple - 2} ${cx - rx + 2} ${temple - 2.4} L${cx - rx + 1.6} ${temple + 2.4} Z M${cx + rx + 0.6} ${temple + 3} Q${cx + rx + 0.4} ${temple - 2} ${cx + rx - 2} ${temple - 2.4} L${cx + rx - 1.6} ${temple + 2.4} Z`, f.hair, INK, 1);
      path(`M${cx - 4} ${top + 2.6} Q${cx - 1} ${top + 1.6} ${cx + 1} ${top + 2.4}`, null, shade(f.skin, 0.35), 1);
      break;
  }
}
