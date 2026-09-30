import type { FactionId, LogEntry, LogKind } from "@/core/state.js";
import { escapeHtml } from "@/ui/html.js";

/**
 * The reports tray. At the start of each of the player's turns, what happened
 * since their last one arrives as notifications: events involving them, and
 * world news (cities changing hands, factions falling). Each can be opened
 * to read in full and dismissed. They last only that turn.
 */

export interface ReportElements {
  root: HTMLElement;
  count: HTMLElement;
  list: HTMLOListElement;
  dismissAll: HTMLButtonElement;
}

export interface ReportView {
  /** Notifications not yet dismissed, oldest first. */
  unread: readonly LogEntry[];
  /** Notifications opened to read in full. */
  expanded: ReadonlySet<number>;
}

/** Whether the player hears about a log entry: it concerns them, or it's world news. */
export function concerns(entry: LogEntry, playerId: FactionId): boolean {
  return entry.factions.includes(playerId) || entry.major;
}

/** Draws this turn's notifications. */
export function renderReports(el: ReportElements, view: ReportView): void {
  el.count.textContent = view.unread.length > 0 ? `${view.unread.length} new` : "";
  el.dismissAll.hidden = view.unread.length === 0;

  if (view.unread.length === 0) {
    el.list.innerHTML = `<li class="report-empty">No new reports.</li>`;
    return;
  }
  el.list.innerHTML = view.unread
    .map((entry) => {
      const open = view.expanded.has(entry.id);
      return `
        <li class="report report-${entry.kind}${open ? " open" : ""}">
          <button type="button" class="report-body" data-report="${entry.id}" aria-expanded="${open}">
            ${ICONS[entry.kind]}
            <span class="report-text">${escapeHtml(entry.text)}</span>
            <span class="report-turn">T${entry.turn}</span>
          </button>
          <button type="button" class="report-dismiss" data-dismiss="${entry.id}" aria-label="Dismiss">&times;</button>
        </li>`;
    })
    .join("");
}

/** A small icon for each kind of report. */
const ICONS: Record<LogKind, string> = {
  battle: icon(`<path d="M3 3 L13 13 M13 3 L3 13 M2 11 L5 14 M11 14 L14 11"/>`),
  siege: icon(`<path d="M4 14 V6 H6 V4 H8 V6 H10 V4 H12 V6 V14 Z M7 14 V11 H9 V14"/>`),
  city: icon(`<path d="M4 14 V2 M4 3 H12 L10 5.5 L12 8 H4"/>`),
  construction: icon(`<path d="M3 13 L9 7 M8 3 L13 8 L11 10 L6 5 Z"/>`),
  recruitment: icon(`<path d="M4 9 A4 4 0 0 1 12 9 V11 H4 Z M8 5 V2 M3 13 H13"/>`),
  war: icon(`<path d="M3 12 L2 5 L5.5 8 L8 3 L10.5 8 L14 5 L13 12 Z M3 14 H13"/>`),
};

function icon(paths: string): string {
  return `<svg class="report-icon" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">${paths}</svg>`;
}
