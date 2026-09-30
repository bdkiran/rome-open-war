import type { BuildingType } from "@/data/buildings.js";

/** Small line drawings for each building, in the panel's colours. */
const ART: Record<BuildingType, string> = {
  government: `
    <path d="M8 24 L32 10 L56 24 Z" fill="var(--roof)"/>
    <rect x="10" y="24" width="44" height="4" fill="var(--stone)"/>
    ${[14, 23, 32, 41, 50].map((x) => `<rect x="${x - 2}" y="28" width="4" height="20" fill="var(--stone)"/>`).join("")}
    <rect x="8" y="48" width="48" height="4" fill="var(--stone)"/>
    <rect x="5" y="52" width="54" height="5" fill="var(--stone-dark)"/>`,
  walls: `
    <path d="M6 56 V24 H12 V18 H18 V24 H24 V18 H30 V24 H34 V18 H40 V24 H46 V18 H52 V24 H58 V56 Z" fill="var(--stone)"/>
    <path d="M26 56 V42 A6 6 0 0 1 38 42 V56 Z" fill="var(--ink)"/>
    <path d="M6 34 H58 M6 45 H26 M38 45 H58" stroke="var(--stone-dark)" stroke-width="1.5"/>`,
  farms: `
    <path d="M4 50 L60 50 L52 36 L12 36 Z" fill="#8fa35a"/>
    <path d="M10 46 L54 46 M14 42 L50 42 M17 39 L47 39" stroke="#6b7f3c" stroke-width="1.5"/>
    <path d="M32 34 V14 M32 20 L25 13 M32 20 L39 13 M32 26 L24 19 M32 26 L40 19 M32 31 L26 25 M32 31 L38 25" stroke="#d9b24a" stroke-width="2.4" stroke-linecap="round"/>`,
  market: `
    <path d="M8 22 H56 L52 30 H12 Z" fill="var(--roof)"/>
    <path d="M16 22 L14 30 M26 22 L25 30 M38 22 L39 30 M48 22 L50 30" stroke="#f1e3c4" stroke-width="3"/>
    <rect x="14" y="30" width="3" height="22" fill="var(--wood)"/>
    <rect x="47" y="30" width="3" height="22" fill="var(--wood)"/>
    <rect x="12" y="40" width="40" height="5" fill="var(--wood)"/>
    <circle cx="22" cy="37" r="3" fill="#d9b24a"/><circle cx="31" cy="37" r="3" fill="#c0392b"/><circle cx="40" cy="37" r="3" fill="#8fa35a"/>
    <rect x="6" y="52" width="52" height="4" fill="var(--stone-dark)"/>`,
  mine: `
    <path d="M4 56 L24 18 L34 30 L42 22 L60 56 Z" fill="var(--stone-dark)"/>
    <path d="M24 18 L30 29 L27 30 Z M42 22 L47 32 L44 32 Z" fill="var(--stone)"/>
    <path d="M22 56 V42 A8 8 0 0 1 38 42 V56 Z" fill="var(--ink)"/>
    <path d="M21 56 V41 M39 56 V41 M20 41 H40" stroke="var(--wood)" stroke-width="3"/>
    <rect x="42" y="47" width="12" height="6" fill="var(--wood)"/>
    <circle cx="45" cy="54" r="2" fill="var(--ink)"/><circle cx="51" cy="54" r="2" fill="var(--ink)"/>
    <circle cx="45" cy="46" r="2" fill="#d9b24a"/><circle cx="50" cy="45.5" r="2.2" fill="#d9b24a"/>`,
};

export function buildingSvg(building: BuildingType): string {
  return `<svg class="building-art" viewBox="0 0 64 64" aria-hidden="true">${ART[building]}</svg>`;
}
