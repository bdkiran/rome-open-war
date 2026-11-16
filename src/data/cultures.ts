/**
 * Cultures: how a faction's soldiers are equipped on the map. Purely a look,
 * with no effect on the rules. Each culture has its own helmet, shield and
 * weapon on the army figure (see tools/buildArmyModel.ts).
 */
export const CULTURES = ["roman", "hellenistic", "punic", "celtic", "thracian"] as const;

export type Culture = (typeof CULTURES)[number];

/** What each culture's soldiers carry, in a few words (for docs and tooltips). */
export const CULTURE_KITS: Record<Culture, string> = {
  roman: "Crested bronze helmet, curved rectangular shield, short sword",
  hellenistic: "Corinthian helmet with a coloured crest, round shield, long spear",
  punic: "Conical helmet, oval shield, spear",
  celtic: "Bare-headed, tall oval shield, long sword",
  thracian: "Forward-curving cap, crescent shield, curved blade",
};

/**
 * How a general's figure stands out on the map, by culture: a cloak a shade
 * darker than his colour on every one, and on his helmet a white crest across
 * it (replacing the culture's own crest) or a gold plume. A bronze cuirass
 * replaces armour in his colour where `bronze` is set, so his cloak carries the colour.
 */
export const GENERAL_LOOKS: Record<Culture, { headdress: "crest" | "plume"; bronze: boolean }> = {
  roman: { headdress: "crest", bronze: false },
  hellenistic: { headdress: "crest", bronze: true },
  punic: { headdress: "plume", bronze: false },
  celtic: { headdress: "plume", bronze: false },
  thracian: { headdress: "crest", bronze: false },
};
