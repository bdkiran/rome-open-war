/** Formatting shared by the map and the UI. */

/** 12345 -> "12,345" */
export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Short form for tight spaces: 950 -> "950", 5400 -> "5.4k", 12345 -> "12k", 1250000 -> "1.3M". */
export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${trim(n / 1000)}k`;
  return String(Math.round(n));
}

/** 0.0234 -> "2.3%" */
export function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function trim(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}
