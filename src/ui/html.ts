import { formatNumber } from "@/render/format.js";

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

/** 250 -> "+250", -40 -> "-40" */
export function signed(n: number): string {
  return n > 0 ? `+${formatNumber(n)}` : formatNumber(n);
}

/** A faction color chip followed by text. */
export function ownerLine(name: string, color: string, detail = ""): string {
  const suffix = detail ? `, ${escapeHtml(detail)}` : "";
  return `<p class="owner"><span class="swatch" style="background:${color}"></span>${escapeHtml(name)}${suffix}</p>`;
}
