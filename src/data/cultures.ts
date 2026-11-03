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
