# Decision: generals

- **Status:** Proposed. Not implemented yet.
- **Decides:** whether armies can be led by named generals, what they do, how they're
  gained and lost, and how the AI uses them.
- **Where it goes once agreed:** a new section in `docs/DECISIONS.md` (under Armies and
  recruitment) with the measured numbers, and `README.md` gets the rules (Armies, Battles,
  Sieges).

## Context

Every strength in the game today can be bought with gold: regiments, tiers, buildings.
Experience is the only exception, and it's spread thin over regiments that merge, retrain
and die. A general is a named character who leads one army. He has a trait or two, improves
by winning, and can be killed or captured when his army is routed. That gives each faction
a few scarce pieces that gold can't make, and gives the reports stories ("Hanno captured at
Saguntum"). State must stay plain data, and nothing may break one army per tile, joint
battles, flight or the fogged AI.

## Choices to make

| Question | Options | Recommended |
|---|---|---|
| What he's attached to | (a) The army (`Army.generalId`). (b) A regiment (`General.regimentId`), found with `armyHolding`. | **(b).** Regiments keep their ids when armies split, join, flee and march (`relocate`, `placeRegiments`), so he follows them without new rules. Army ids are reissued too often. |
| How a faction gets them | (a) Bought. (b) Rise from winning regiments by chance. (c) A **cap by cities**, with vacancies filled after a wait. | **(c).** Every faction starts with one in its capital army. The cap is 1 + 1 per 4 cities, at most 3, and a vacancy fills after 8 turns at the capital. No gold, and nothing to tune per battle. |
| Traits | Chosen by the player. Rolled. | **Rolled** (seeded RNG): one at the start, a second, different one at rank 2. They're for stories, and the AI needs no choice code. |
| Capture | (a) Captured is just lost. (b) **Ransom**: the captor holds him, and his owner may buy him back. (c) Captor can recruit him. | **(b)**, as a non-blocking action, so no `settleAction`-style decision is forced. It's the only gold link, and it only buys back what you earned: flagged below. |
| Two generals meeting | Merge one away. Refuse. | **Refuse.** A move, march step or attack-via that would put two generals in one army is refused with a reason. Flight treats such a tile as full. |
| Joint battles | Each army's general applies to his own army. The senior one commands the side. | **The senior general** (highest rank, then experience) gives his traits to the whole side. The others still gain experience and face their army's fate. |
| Bonus shape | Flat (like experience levels). Percent. | **Percent.** A flat +0.5 attack army-wide is +25% for militia. DECISIONS (Experience) chose flat for *regiments* on purpose, so this is a deliberate difference for an army-wide effect. |

## Baseline (current code, seed 1, 100 turns, passive Rome)

| Measure | Value |
|---|---|
| Battles, and those that aren't chases of remnants (smaller side at least 25%) | 396, and 258 (about 20 per AI faction) |
| AI attacks won | 91% |
| Non-chase losers that fled / fought to the death | 196 / 62 |
| AI armies at turn 100: in cities / in the field | 53 / 9 (median 2 regiments; none of 5+) |
| AI regiments at turn 100 by level 0 / 1 / 2 / 3+ | 99 / 22 / 23 / 10 |
| Even fight (2 militia, 1 spearmen, 1 archers each), attacker wins | 50%; 5% more soldiers 63%, 10% more 76% |

What this tells us:

- Field armies are few and short-lived at any moment, so a general will often sit in a
  garrison. His traits must help there too, and the AI must take him along when it
  launches an army.
- A regiment rarely reaches level 3 (8 points). A general fights every battle his army
  does, so his ranks can ask a little more.
- Most AI battles are won, so the AI's generals will mostly be lost in storms and failed
  defenses, not in its own attacks.

## Proposal

Starting numbers, to be tuned. All live in a new `src/data/generals.ts`.

| Trait | Rank 1 | Rank 2 | Rank 3 |
|---|---|---|---|
| **Fierce** | melee losses dealt +10% (even fight: 58%) | +15% (63%) | +20% (66%) |
| **Stubborn** | losses taken when defending −10% (61%) | −15% (66%) | −20% (72%) |
| **Swift** | army movement +2 | +3 | +4, never above 16 |
| **Besieger** | when he storms a city, walls count 10 points less | 15 less | 20 less (never below 0) |
| **Drillmaster** | his regiments earn +1 point per battle that counts | +1 | +2 |
| **Wary** | if beaten: rout losses ×0.75, and his death or capture chance halved | ×0.5 | ×0.5, and his chance quartered |

- **Ranks**: rank 1 when he appears, 2 at 6 points, 3 at 14. He earns points as regiments
  do: 2 for a win, 1 for a loss, none against under a quarter of his side's soldiers
  (`EXPERIENCE`). At rank 2 he gains a second trait. Rank 3 brings both traits to their
  top value.
- **His fate** is rolled after the battle, with the battle's seeded RNG:

| His army | Killed | Captured |
|---|---|---|
| Won (even if his regiment died: he moves to the largest survivor) | 0% | 0% |
| Beaten and got away | 10% | 10% |
| Destroyed (fought to the death, every regiment scattered, or the city surrendered) | 50% | 50% |

- **Ransom**: 150 gold × rank, paid to the captor at any time. He comes back at his owner's
  capital the next turn. Unransomed after 10 turns, he dies in captivity. The captor gains
  nothing else.

## How it would be built

1. **State** (`core/state.ts`):
   - `General { id, owner, name, traits, experience, regimentId: RegimentId | null,
     captiveOf: FactionId | null, capturedTurn: number | null }`.
   - `GameState.generals: Record<GeneralId, General>` and `nextGeneralNumber`.
   - `Faction.generalDueTurn: number | null`.
   - Rank is derived from experience, like `experienceLevel`.
   - Names come from per-culture lists in `data/generals.ts`, picked with `core/rng.ts`.
2. **Following his regiment**:
   - `mergeRegiments` can fold his regiment's id away. He then moves to the kept regiment
     of the same unit and tier.
   - `rout` and `attack()`: when his regiment is gone, he moves to his army's largest
     survivor, or his fate is rolled.
   - `siege.ts` `surrender`: he's captured.
   - `eliminateIfDefeated`: his faction's generals are removed, and captives it held go
     home.
3. **Battle maths** (`systems/combat.ts`):
   - A per-side `Leadership` (`meleeDealt`, `takenWhenDefending`, `wallsCut`) is passed to
     `resolveBattle`, `estimateBattle` and `battleStrength`, built by a new
     `leadershipOf(state, regiments)`. If battle stances are also agreed, both go in one
     options argument.
   - `wallsCut` lowers the `Battlefield.defenseBonus` from `battlefieldAt`.
   - Wary goes in `routLosses`, Drillmaster in `gainExperience`, and Swift in
     `refreshMovement` (capped at 16).
4. **Actions**:
   - `assignGeneral { generalId, regimentId }`: free, within his army.
   - `ransomGeneral { generalId }`: refused if the owner can't pay.
   - `canMove`, `march` steps and `fleeTile` respect one general per army.
   - At the start of a faction's turn (`turn.ts`), the vacancy timer and captivity clock
     advance.
5. **Fog** (`systems/vision.ts` `fogged`): another faction's general is kept only if his
   regiment is in sight.
6. **AI** (`ai/ai.ts`, numbers in `data/ai.ts`):
   - `battleStrength` includes leadership, so attack, retreat and relief decisions adjust
     with no new logic.
   - `launchAction` takes the general along when he's in the muster city (an
     `assignGeneral` first, if his regiment isn't among the launched).
   - It ransoms when its gold is at least the ransom plus `AI.buildReserve`, never into
     debt.
7. **UI**:
   - Army card (`ui/selectionBar.ts`): "Led by Hanno: Fierce II, Swift", with a tooltip
     giving the numbers and points to the next rank.
   - `ui/boxes.ts`: a laurel on his regiment's box.
   - Battle panel: a "Led by" note on each side.
   - Battle result and reports: his fate, `major` for owner and captor.
   - Turn panel: captives, each with a Ransom button.
   - 3D: `ArmyLook.general` (his rank) draws a laurel on the banner in `bannerTexture`.
     The figure model is unchanged in the first pass.
8. **Tests**:
   - `tests/invariants.ts`: each general has a regiment of his own faction, or is a
     captive with none, and there's at most one per army.
   - New `tests/generals.test.ts`: each trait's number, the fate table, merging and
     splitting, ransom.
   - `tests/flight.test.ts`: fleeing with a general.

## Consequences and risks

- **Snowball.** Winners keep and season generals, and losers lose theirs. Since the cap
  grows with cities, big factions get more. Keep the cap at 3 and the bonuses small (rank 3
  Fierce is worth about 6% more soldiers). Watch the cities-held spread in `compare`.
- **Conflict with DECISIONS, Movement**: cavalry was cut to 16 so it couldn't strike from
  anywhere. Swift is capped at 16, so cavalry gain nothing and Swift infantry at most
  match cavalry.
- **Conflict with "gold can't buy him"**: ransom is gold. It only buys back a general
  already earned, and it's dear (300 gold at rank 2, close to a basic cavalry regiment's 360).
  An alternative is (a), lost for good.
- **Storms decide most fates.** Garrisons defending their city fight to the death, so a
  general in a stormed city is lost every time. That's a reason to keep him in the field,
  and a reason for the AI rule above.
- **Rome is passive in sims**, so the player's experience of generals is judged by playing.
  The AI can be measured.
- Save/load: one more record. Every field is a string, number or array.

## How we'll know it works

- `npm run build` clean, and `npm test` passes: no invalid `assignGeneral` or
  `ransomGeneral`, no AI debt from ransoms, and the invariants hold.
- `npm run compare -- --base master --seeds 8`, with and without `--garrison`. **Target:**
  median cities taken, factions fallen and battles within about 15% of the baseline.
- New `compare` rows: generals alive at turn 100, killed, captured, ransomed, and top rank.
  **Target:** 1–5 rank-3 generals a game, a median AI general lifetime of at least 30
  turns, and some generals killed and some captured in every game.
- Browser check: the "Led by" line, the laurel on the banner and box, the battle panel's
  note, a fate in the battle result, and the Ransom button.

## Open questions for review

- Are these six traits the right set? Should Rome's generals come from a different
  (Roman-flavoured) list?
- Ransom (b), or simply lost (a)?
- Should the player choose the second trait at rank 2? It would be a non-blocking choice,
  with the AI rolling.
- Should a general's death or capture also shake his army (for example a worse rout)?
