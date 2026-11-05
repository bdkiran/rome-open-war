# Decision: diplomacy

- **Status:** Proposed. Not implemented yet.
- **Decides:** whether factions can stop fighting each other, how, and for how long.
- **Where it goes once agreed:** a new "Diplomacy" section in `README.md`, and an entry in
  `docs/DECISIONS.md` (Factions) with the measured numbers. If AIs can sign treaties with
  each other, the backlog item "The AI doesn't single out the player" gets a note (see
  Consequences).

## Context

Every faction is at war with every other, all game, and nothing can change that. The game
is called *Unlimited War*, so that's partly the point. But with 15 factions it means a
faction fighting on two fronts can't settle one of them, a player who's losing can't buy
time, and a stronger faction can't take gold instead of a city. The idea is basic diplomacy:
a truce for a set number of turns, peace, and tribute. An AI accepts when it's losing or
fighting on two fronts.

## Choices to make

| Question | Options | Recommended |
|---|---|---|
| **Diplomacy at all, in a game called Unlimited War** | **A. None:** war forever, as now. **B. Treaties that run out:** truces and peace end on a set turn and war comes back by itself. **C. Lasting peace** until someone declares war. | **B.** Wars pause but never end, which fits the title. Nobody is safe for good, and "last faction standing" can still be reached. C could freeze the map: today only about 2 factions fall per 100 turns. |
| Who can sign | The player and an AI only. Any two factions. | **Any two factions, by the same rules.** The AI keeps not caring which faction is human (backlog item). |
| Can a treaty be broken | Never. Declare war, taking effect next turn. Any time, with a penalty. | **A truce can't be broken. Peace can be ended by declaring war**, which takes effect at the start of the declarer's next turn, so the other side gets one turn of warning. An AI won't sign with a treaty-breaker for 20 turns. |
| Tribute | None. A lump sum. Gold every turn of the treaty. | **Gold every turn**, paid after upkeep. It never puts the payer in debt: tribute that can't be paid ends the treaty. |
| Vision sharing | None. At peace, you see each other's armies. | **None.** Each faction's fog stays its own. Sharing could come later with alliances. |
| Alliances (fighting side by side) | Now. Later. | **Later.** `battleSides` only joins the two sides' own armies today. Allies would need third parties in battles, and they make ganging up easy. |
| How an offer reaches the player | A dialog that blocks the turn. A report with Accept / Decline. | **A report.** Unanswered, it lapses when the player's turn ends. It never blocks End turn. |

## Baseline (current code, 100 turns, passive Rome)

| Measure | Value |
|---|---|
| Faction pairs at war | all 105 pairs (15 factions), always |
| Factions fallen, 8 test games | 15 (DECISIONS, latest entry): about 2 a game |
| Cities taken, 8 test games | 390 |
| Seed 1 at turn 101 | 3 of 15 fallen (Thrace by turn 75, Gauls, Dacia). Largest factions hold 5–6 of 55 cities |
| Seed 2 at turn 101 | 1 of 15 fallen (passive Rome, between turns 50 and 75). No AI fell. Largest: Spain 7, Carthage 6, Seleucids 6 |
| Two fronts (seed 2, every 10 turns up to turn 50; a rough measure: field armies of 2+ enemy factions within 6 tiles of its cities) | 1–5 of 14 AIs at a time |
| How the AI picks a war | `chooseTarget` (`ai/assess.ts`): the enemy city that's cheapest to take (defending soldiers + 40 per tile of distance), whoever owns it |

What this tells us:

- Wars are already slow. Anything that pauses them can stall the map, so treaties have to
  run out, and the AI should sign mainly when it's in trouble.
- Two-front trouble is not common (5 of 14 AIs at most), so AI-to-AI truces should come in
  small numbers if the AI only accepts then.
- The AI has no idea of "an enemy". It has a target city this turn, so a treaty only has
  to take some cities out of its choice.

## Proposal

These are starting numbers, to be tuned against the measurements.

| Rule | Starting number |
|---|---|
| **Truce** | 10 turns. Can't be broken. War resumes when it ends. |
| **Peace** | 30 turns. Either side can renew it in its last 5 turns. Ended early only by a declaration of war, which takes effect at the start of the declarer's next turn. |
| While a treaty holds | No attacks, sieges or zone of control between the two. Their armies and cities still block each other's moves (one army per tile). A siege between them is lifted when it's signed. |
| **Tribute** | Gold a turn, set in the offer, for the length of the treaty. At most 2 gold per 1,000 of the payer's people. |
| Offers | One pending offer per pair. It lasts until the end of the receiver's next turn. An AI makes at most 1 offer a turn. |
| Cooldown | After a refusal, or after a treaty ends, the pair waits 5 turns before a new offer. 20 turns after a broken peace. |
| **AI accepts** (from its fogged view and the public scoreboard) | **Two fronts:** field armies of 2+ factions at war with it within 6 tiles of its cities (`AI.threatRadius`), or one of its cities besieged by a faction other than its target's owner. **Or losing to the proposer:** the proposer took one of its cities in the last 10 turns, or has 1.5× its soldiers. |
| **AI refuses** | It's besieging one of the proposer's cities, or the proposer broke a treaty with it in the last 20 turns. |
| AI tribute | When accepting because it's losing, it pays tribute if asked, up to 25% of its income after upkeep. It asks for tribute (the cap) when the proposer is losing to it. |
| AI offers | When on two fronts, it offers a truce to the enemy that isn't its target's owner. |

## How it would be built

1. **`src/data/diplomacy.ts`**: `DIPLOMACY` with every number above.
2. **State** (`src/core/state.ts`), plain data:
   - `Treaty { factions: [FactionId, FactionId]; kind: "truce" | "peace"; until: number; tribute?: { from: FactionId; gold: number }; endsOnTurn?: number }`.
   - `Offer { from; to; kind; tribute?; expires }`.
   - `GameState.treaties: Treaty[]`, `offers: Offer[]`, and `cooldowns: Record<string, { until: number; brokenBy?: FactionId }>`, keyed by the pair.
   - Helper `atWar(state, a, b)`: true unless `a === b` or a treaty holds.
3. **`src/systems/diplomacy.ts`**:
   - `canPropose` / `propose`, `canAnswer` / `answer`, `canDeclareWar` / `declareWar`.
   - `processTreaties(state, factionId)`, called from `endFactionTurn` in `systems/turn.ts`, after `payUpkeep`. It pays tribute, ends expired treaties, starts declared wars, and lapses the faction's unanswered offers.
   - Signing lifts any siege between the two with `liftSiege` (`systems/siege.ts`), so supplies refill as they do for any ended siege.
   - Every change is logged with `addLog(…, { kind: "diplomacy", factions: [a, b], major: true })`. That's a new `LogKind`.
4. **Actions** (`src/core/actions.ts`): `proposeTreaty`, `answerOffer`, `declareWar`.
   - An offer is answered only on the receiver's own turn, through `applyAction`.
   - A player's offer to an AI is answered during that AI's turn. The reply is waiting at the start of the player's next turn.
5. **Hostility checks**: about 70 `owner !==` / `owner ===` checks in 13 files under `systems/` and `ai/`. Those that mean "enemy" become `atWar`:
   - `zoneOfControl` and `reachableTiles` (`systems/armies.ts`). Armies and cities of factions not at war still block the tile, but put out no zone of control.
   - `attackTargets` and `canAttack` (`systems/combat.ts`). `battleSides` already joins only the two sides' own armies.
   - `besiegeTargets` (`systems/siege.ts`).
   - `towerSighter` (`systems/watchtowers.ts`): only an enemy at war blinds a tower.
6. **AI** (`src/ai/`):
   - A `diplomacyAction` right after `settleAction` in `nextAction`. It answers every offer first (the AGENTS rule: the AI handles any decision the player can face), then maybe makes one.
   - `assess.ts`: `chooseTarget` and `committedTargets` skip cities of factions not at war. `enemyRegimentsNear` counts armies of factions at war, plus those whose treaty ends within 3 turns, so garrisons are ready when war comes back. A new `fronts()` returns the factions at war with armies near its cities.
   - "Took one of its cities" is read from `state.battles` (`cityCaptured`, `turn`). Cities that surrender aren't in it, so `processSieges` logs who took them.
7. **UI** (kept short):
   - `ui/turnPanel.ts`: each scoreboard row shows War / Truce 7 / Peace 23. Its tooltip offers Offer truce, Offer peace and Declare war.
   - `ui/reports.ts`: an offer report with Accept / Decline.
   - Attack and siege highlights skip factions not at war.
8. **Tests and tools**:
   - `tests/diplomacy.test.ts`: signing, expiry, tribute, lapsed offers, declared war one turn later.
   - `tests/invariants.ts`: one treaty per pair; no siege or army in a city between factions not at war; tribute never puts a payer below 0.
   - `tools/simulation.ts`: passive Rome declines every offer, so sims stay comparable.
   - `tools/compare.ts` gets new rows: treaties signed, tribute paid, and pairs at truce or peace at the last turn.

## Consequences and risks

- **Stalling.** Fewer cities may change hands. That's the main number to watch. If it
  falls, AIs sign too readily, so tighten the "accept" rules before touching truce length.
- **The siege reset.** Signing lifts a siege and refills supplies. A city on its last turn
  could buy a reset with a truce. The AI refuses while it's besieging the proposer, which
  closes that for the AI. The player can still use it against an AI besieged by a third
  faction, which is fine: it's that faction's siege, and it isn't touched.
- **The backlog item "The AI doesn't single out the player".** Diplomacy doesn't change
  that rule: the AI weighs Rome exactly like anyone else. But AIs that sign truces with
  each other turn on whoever is still at war with them. A player who refuses everything
  will feel more targeted. That's the player's choice, and the report says so in numbers
  (sieges on Rome before and after, with `--garrison`).
- **DECISIONS: "The AI commits to a siege".** A treaty now overrides that commitment: the
  siege is lifted and the city is no longer a target.
- **Fog.** The AI judges "losing" from soldiers and cities on the scoreboard (public, like
  the player's top-right panel) and "two fronts" from armies it can see. It must not read
  unseen armies from the real state.
- **AI debt.** Tribute is paid after upkeep and only from gold above 0. The AI never agrees
  to more than its headroom (`AI.upkeepHeadroom`). `npm test` catches any debt.
- **Victory.** With lasting peace (option C), "last faction standing" could become
  unreachable. Treaties that run out avoid that. See also `victory-conditions.md`.
- **Speed.** `fronts()` runs for every AI action. Work it out once per `nextAction`, with
  the assessment.

## How we'll know it works

- `npm run build` is clean, and `npm test` passes: no invalid AI action, no AI debt, and the
  new invariants hold.
- `npm run compare -- --base master --seeds 8`, with and without `--garrison`.
  **Targets:**
  - factions fallen and cities taken each within about 25% of the baseline (15 and 390);
  - 5–20 treaties signed a game;
  - at the last turn, no more than a quarter of the pairs are at truce or peace;
  - no faction is at peace with all its neighbours.
- A browser check:
  - offer Carthage a truce from the scoreboard, and see it answered by the next turn;
  - see a refusal while Carthage besieges a Roman city;
  - see that an AI's offer lapses without blocking End turn;
  - see no attack or siege highlights on a truce partner.

## Open questions for review

- Are 10 turns for a truce and 30 for peace right? Should peace exist at all, or only truces?
- Should the player be able to demand tribute without a treaty ("pay, or it's war")?
- Should a truce partner's armies have to leave your land?
- Alliances and shared vision: a later step, or never?
