import { getFaction, type FactionId, type GameState } from "@/core/state.js";

/** What the banner says about an AI step: while it plays (if it's a battle), and once it's over. */
export interface BannerText {
  during: string | null;
  outcome: string;
}

/**
 * The banner for an AI step the player watches: a battle ("Carthage vs Rome
 * at Capua", then "Capua falls to Carthage", "Capua holds" or "Victory for
 * Carthage near Messana"), a siege laid ("Croton besieged by Carthage") or a
 * city taken without a battle ("Croton falls to Carthage"). Null for a plain
 * move. No verb follows a faction's name: some are plural (Greeks, Gauls) and
 * some only look it (Pontus).
 */
export function describeStep(before: GameState, after: GameState): BannerText | null {
  const name = (id: FactionId) => getFaction(after, id)?.shortName ?? "an enemy";
  const battle = after.battles.filter((b) => b.id >= before.nextBattleNumber).at(-1);
  if (battle) {
    const attacker = name(battle.attacker);
    const during = `${attacker} vs ${name(battle.defender)} ${battle.place}`;
    const cityName = battle.place.startsWith("at ") ? battle.place.slice(3) : null;
    const winner = battle.attackerWon ? attacker : name(battle.defender);
    const outcome = battle.cityCaptured
      ? `${battle.cityCaptured} falls to ${winner}`
      : cityName && !battle.attackerWon
        ? `${cityName} holds`
        : `Victory for ${winner} ${battle.place}`;
    return { during, outcome };
  }
  for (const city of Object.values(after.cities)) {
    const old = before.cities[city.id];
    if (!old) continue;
    if (old.owner !== city.owner) return { during: null, outcome: `${city.name} falls to ${name(city.owner)}` };
    if (!old.besiegedBy && city.besiegedBy) return { during: null, outcome: `${city.name} besieged by ${name(city.besiegedBy)}` };
  }
  return null;
}
