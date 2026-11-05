# Decision: events

- **Status:** Proposed. Not implemented yet.
- **Decides:** whether occasional random events happen (plague, a good harvest, a city
  offering to change sides, a migrating horde), how often, and how they're rolled and
  decided.
- **Where it goes once agreed:** when it's built, an entry goes into `docs/DECISIONS.md`
  with the measured numbers, and `README.md` gets an Events section (and Your opponents,
  for how the AI answers offers).

## Context

Today the only luck in the game is in battles. Given a seed and the players' orders,
everything else is certain, and long games settle into a pattern. A few events give
turning points and stories without becoming the main game. They must keep the rules that
can't break:
- Seeded RNG only (`core/rng.ts`).
- State changes only through `applyAction` (events run inside the end of a turn).
- Log entries through `addLog`.
- Any decision that blocks ending a turn is also made by the AI.

## Choices to make

| Question | Options | Recommended |
|---|---|---|
| Which events first | All four. Plague, harvest and offers first, the horde after. | **Plague, good harvest and a city's offer first. The horde second.** The horde brings a free army with upkeep, which risks AI debt, and it needs the most AI care. |
| When they're rolled | Per city, per turn. Per faction. One world event every N turns. | **Per city, at the end of its owner's turn** (in `endFactionTurn`, like income), so each faction gets one tick a round. |
| Where the randomness comes from | `state.rngState`, shared with battles. A second stored stream. A **stateless roll** from (seed, turn, city, event). | **Stateless roll:** `createRng(mix(seed, turn, cityNumber, eventIndex))`. Rolls don't depend on how many battles came before or on the order of AI actions, so the same seed gives the same plague years even after the AI changes, and battle luck doesn't shift. |
| Decisions | Block ending the turn, like a captured city's fate. Expire at the end of the turn. | **Block, as `settleCity` does.** An offer can't be missed, and the AI answers it in the same place as `settleAction`. |
| Who hears about it | Only the owner. World news. | **Plague and harvest go to the owner. Offers, changes of side and hordes are world news.** |
| Overall effect | Net good. Net bad. **Roughly neutral.** | **Roughly neutral** in people and gold over a game. Events add swings, not a trend. |
| Early game | Events from turn 1. A grace period. | **None before turn 10**, so an early plague can't wreck an opening. |

## Baseline (current code, seed 1, 100 turns, passive Rome)

| Measure | Value |
|---|---|
| City-turns in a game | About 5,700 (5,061 AI, the rest Rome) |
| Median city at turn 100 | 7,174 people, about 33 gold a turn before taxes and market |
| Growth of a small plains city | About 5% a turn |
| Cities taken / that changed hands at least once | 51 / 27 of 55 |
| City-turns under siege | 2.4% |
| AI garrisons | At least 2 regiments a city (`AI.baseGarrison`), 3 in a capital |
| Luck today | Battles only (±90% per round) |

What this tells us:

- At 2% of city-turns, a game would see about 110 events, or one per faction every 13
  turns. That's frequent enough to notice and rare enough not to run the game.
- AI cities are almost never empty, so "a city with no garrison offers to defect" would
  never fire. The condition has to allow a weak garrison.

## Proposal

These are starting numbers, to be tuned against the measurements.

| Event | Chance per city per turn | Which cities | Effect |
|---|---|---|---|
| **Plague** | 0.4%, ×2 over 15,000 people, ×2 while besieged | 3,000 people or more | −15% people (never below 1,000), and its garrison −10% soldiers |
| **Good harvest** | 1% | Not besieged | +5% people (up to capacity) and 20 gold per city level |
| **A city offers to change sides** | 0.5% | Not a capital, not besieged, garrison of at most 1 regiment, taken in the last 30 turns | Offered to its former owner if alive and bordering, otherwise to the bordering faction with the most soldiers within 6 tiles. Price: 15 gold per 1,000 people. |
| **Migrating horde** (second step) | At most one per 40 turns, from turn 30 | Given to a living faction with a city within 4 tiles of the north or east edge | 4 militia and 2 basic cavalry regiments appear on a free land tile of its region at the edge, with 20 turns of their upkeep in gold |

**An offer** waits for the receiving faction's next turn, like a city that surrenders at the
end of a turn.
- **Accept:** pay the price. The city changes hands as if occupied: no plunder and no fate
  to choose. `captureCity` empties its queues, its garrison is destroyed, and both factions
  are told.
- **Refuse:** nothing happens.
- An offer whose city has since been garrisoned, besieged or taken, or whose receiver has
  fallen, is dropped at once, so it can never block a turn forever.

**The horde** joins an existing faction ("Cimbri join the Germanic Tribes"). A neutral horde
was considered and rejected for now: every army has an owner who takes turns, and victory,
the turn order and `nextAction` all assume factions.

Expected per game: about 30 plagues, 55 harvests, 3–6 offers and at most 2 hordes.

## How it would be built

1. **`src/data/events.ts`** (new): `EVENTS` holds every chance, effect and condition
   above, plus the grace period.
2. **The roll:**
   - `core/rng.ts` gets a `mix(...numbers)` hash.
   - `systems/events.ts` rolls `createRng(mix(state.mapSeed, turn, cityNumber, index))`.
   - `mapSeed` holds the scenario seed, which `tools/simulation.ts` sets per `--seed`, so
     each seed rolls its own events. It may want renaming to `seed`.
   - No `Math.random` anywhere.
3. **`src/systems/events.ts`** (new): `processEvents(ctx, state, factionId)`, called in
   `endFactionTurn` (`systems/turn.ts`) after `processSieges`, before `payUpkeep`. The
   end of a turn only ever runs through `applyAction({ type: "endTurn" })`.
   - Plague and harvest change the city and the garrison (`applyLosses` from
     `systems/combat.ts`) and the faction's gold.
   - Offers are added to `GameState.offers: Offer[]`, each `{ id, cityId, to, price,
     turn }`: plain data.
   - The horde uses `placeNewArmy` (`systems/armies.ts`).
   - Stale offers are dropped here.
4. **Action:** `{ type: "answerOffer"; offerId; accept: boolean }` in `core/actions.ts`,
   checked by `canAnswerOffer`. The `endTurn` case refuses while an offer to the faction
   is pending ("Answer Tarsus's offer before ending your turn."), next to the unsettled-city
   check.
5. **AI** (`ai/ai.ts`): `offerAction` runs right after `settleAction`. It accepts when
   gold ≥ price + `AI.buildReserve` and it isn't in debt; otherwise it refuses. It decides
   from the offer, which fog doesn't hide, and validates against the real state. The horde
   goes only to a faction whose income after upkeep can carry it (`AI.upkeepHeadroom`).
6. **Log:** `addLog` with kind `city` for plague and harvest (the owner only), `city` and
   `major` for offers accepted, and `war` and `major` for hordes. No new report icons are
   needed.
7. **UI:** an offer panel modelled on `ui/settlementPanel.ts`, opened at the start of the
   player's turn as `main.ts` opens the settlement panel. Accept / Refuse, with the price.
8. **Tests:**
   - `tests/invariants.ts`: every offer's city exists and isn't owned by the receiver;
     the receiver is alive; at most one offer per city.
   - New `tests/events.test.ts`: the roll is stable, each event applies, accept and
     refuse work, a stale offer is dropped, and `endTurn` is blocked while an offer waits.
   - The determinism and JSON checks in `simulation.test.ts` cover the rest.
9. **Tooling** (`tools/compare.ts`): rows for events by kind, and offers accepted.

## Consequences and risks

- **AI debt.** Plague cuts income and garrisons. The horde adds upkeep, which is why it
  comes with gold and goes only to a faction that can afford it. `npm test` fails on any
  AI debt.
- **Snowballing.** Offers to the strongest neighbour feed winners. Offering to the former
  owner first undoes conquests instead, so offers work as a brake.
- **Noise.** Single games get noisier. Judge by the medians of 8 seeds. The stateless roll
  gives both versions the same event schedule only while cities and turns match.
- **The conquest balance test changes.** `tests/balance.test.ts` samples a real turn-50
  game (`simulate`), so events change the mid-game it reads. The peacetime model in
  `tools/economy.ts` has no events and is unaffected. If the conquest limits slip, that's
  the cause.
- **The player can be hurt by luck.** No event before turn 10, and no plague under 3,000
  people.
- **It works with public order.** If that proposal is built, offers come from cities in
  Unrest instead of "taken in the last 30 turns", and plague lowers order. Each proposal
  can be built without the other.
- **Fits DECISIONS.** Reports still last one turn: an offer is a pending choice, not a
  report.

## How we'll know it works

- `npm run build` is clean, and `npm test` passes: no invalid AI action, no AI debt, the
  same seed plays the same game twice, and the new invariants hold.
- `npm run compare -- --base master --seeds 8`, with and without `--garrison`.
  **Targets:**
  - 80–150 events a game.
  - 2–8 offers a game, most of them accepted.
  - Median AI income within ±5%.
  - Cities taken and factions fallen within ±15%.
- `npm run levers` doesn't change (events aren't economic levers). `tests/balance.test.ts`
  still passes.
- A browser check, on a seed and turn a script finds that offers Rome a city: the panel
  opens, ending the turn is blocked, Accept hands the city over, and the reports show
  plague and harvest.

## Open questions for review

- Are these the right four events? Other candidates: fire, a poor harvest, a wealthy
  patron.
- Should the horde be a neutral force instead, even though it needs a faction with no
  cities?
- Should the player be able to pay to end a plague early?
- Should the AI weigh an offer's position (deep in enemy land) as well as its price?
