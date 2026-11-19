/**
 * Rebels: whoever holds a city whose people beat its garrison in a revolt
 * (systems/order.ts). One faction entry holds every rebel city. It's never
 * alive (no turns, no part in victory or elimination), its cities are frozen
 * (no growth, gold, building or training), and every faction may attack it.
 */
import type { Culture } from "@/data/cultures.js";

export const REBELS = {
  id: "rebels",
  name: "Rebels",
  shortName: "Rebels",
  color: "#7a7a7a",
  /** How their militia look on the map. No effect on the rules. */
  culture: "celtic" as Culture,
  /**
   * A rebel city raises a militia regiment every so many turns after its
   * revolt, up to the size of the revolt (ORDER.rebels in data/order.ts).
   */
  raiseEvery: 3,
};

/** Whether a faction id is the rebels'. */
export function isRebels(factionId: string | null | undefined): boolean {
  return factionId === REBELS.id;
}
