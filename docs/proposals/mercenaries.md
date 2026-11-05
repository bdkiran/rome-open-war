# Decision: mercenaries

- **Status:** Proposed. Not implemented yet.
- **Decides:** whether gold can buy regiments at once, past the one-a-turn training limit,
  and on what terms.
- **Where it goes once agreed:** this answers the backlog item "Late-game spending: a city
  still trains only one regiment a turn". When it's built, that item comes out of
  `docs/DECISIONS.md` and a short entry goes in under Armies and recruitment with the
  measured numbers. `README.md` gets the rules under Armies.

## Context

A city trains **one new regiment a turn** (`trainNext` in `src/systems/recruitment.ts`), and
each soldier costs a person from the city. So gold can't turn into an army quickly, however
much a faction has: a besieged ally waits for its relief force one regiment at a time, and a
rich late-game treasury has little to buy. Recruitment slots by city level were proposed
once and dropped, because unit buildings and tiers already gate units (DECISIONS, Backlog).

Mercenaries are the other way to spend: dear regiments, hired at once, that take no people.
The queue, the unit buildings and the one-a-turn rule all stay as they are.

## Choices to make

| Question | Options | Recommended |
|---|---|---|
| Where they're hired | Any city. A level-2 city. A city with a Market. | **A city with a Market**, not besieged. Merchants hire them, and 29 of 55 cities have one by turn 25. |
| How many a turn | No limit (army size only). One per city. The Market's level (1/2/3). | **The Market's level**, per city per turn. It's the old "slots by level" idea, kept for mercenaries only. |
| Which units | Basic tier of any unit, no building needed. Basic tier of what the city could train. Every tier the city could train. | **Basic tier of what the city could train** (militia anywhere). The unit buildings stay the only way to new units ("Unit buildings and tiers replaced the Barracks"). |
| When they arrive | At once, with full movement. At once, with no movement. End of turn, like training. | **At once, with no movement.** They hold the city now and march next turn. Full movement would let gold buy a surprise attack. |
| Price | ×1.5, ×2 or ×3 the gold and upkeep of the basic regiment. | **×2 gold and ×2 upkeep.** No people taken pays for some of it. |
| Debt | Hiring blocked while in debt. That, plus mercenaries desert while in debt. | **Both.** Their high upkeep could otherwise send a treasury spiralling. |
| Retraining and merging | No retraining. Retrained at the hire price with no people. | **Retrained at the hire price, no people**; merged only with other mercenaries. |

## Baseline (current code, AI-vs-AI, passive Rome)

| Measure | Value |
|---|---|
| Training per city | 1 regiment a turn, from a queue of 6. The AI keeps one order at a time per city (`affordableTier`) |
| AI treasuries | turn 25: 54–401 (seed 2); turn 50: 72–486 (seed 2); turn 101: mostly 400–800, a few ~1,450 (seed 1) |
| AI income per turn | turn 25: 35–180 (seed 1), 64–219 (seed 2); turn 50: 86–275 (seed 2); turn 101: 230–610 net (seed 1) |
| AI upkeep per turn | turn 25: 11–49; turn 50: 16–52 (seed 2): 10–25% of income, well under the 75% cap (`AI.upkeepHeadroom`) |
| Actions in a game | trainRegiment 328, build 560 (seed 1); trainRegiment 378, build 576, replenish 106 (seed 2) |
| Factions in debt | none |
| Cities with a Market | 29 of 55 at turn 25 (28 at level 1); 36 at turn 50 (31 at level 1) |

What this tells us:

- Treasuries aren't overflowing (the target since the economy retuning was "~1k"), so
  mercenaries are a tool for emergencies and the late game, not a sink the AI needs every turn.
- The AI's upkeep sits far below its cap. What holds its army back is the queue (one
  order per city), the people (`AI.minRecruitPopulation`) and saving for buildings.
  Mercenaries get round the first two, so the AI's rules for them must be tight.

## Proposal

These are starting numbers, to be tuned against the measurements.

| Unit (basic) | Trained: gold / upkeep | Hired: gold / upkeep | People |
|---|---|---|---|
| Militia (220) | 110 / 2.2 | 220 / 4.4 | none |
| Spearmen (180) | 180 / 3.6 | 360 / 7.2 | none |
| Archers (160) | 320 / 5 | 640 / 10 | none |
| Cavalry (120) | 360 / 6 | 720 / 12 | none |

| Rule | Starting number |
|---|---|
| Where | A city of yours with a Market, not besieged |
| Hires per city per turn | Its Market level: 1 / 2 / 3 |
| Units | Basic tier of any unit the city can train (militia anywhere) |
| Arrive | At once, in the city's army, with no movement this turn (room for 10 regiments as usual) |
| Debt | No hiring while in debt. A faction still in debt after paying upkeep loses one mercenary regiment (the dearest) each turn until it's out of debt |
| Retraining | At the hire price per missing soldier, no people |
| Merging | Mercenaries merge only with mercenaries of the same unit |
| Experience | As any regiment |

**The AI** hires only when the gold is there and the upkeep after hiring still leaves its
income above its upkeep (so it can't go into debt even in an emergency):

1. **Relief:** its muster city hires against the besiegers when its queue already holds an
   order, keeping `AI.buildReserve` in hand.
2. **Emergency garrison:** an empty or threatened city short of its garrison, whose queue
   is busy or which hasn't the people to train.
3. **Never for the field campaign** at first. If treasuries still pile up past ~1,000 at
   turn 100, a later step adds "hire at the muster city while gold > 1,000".

## How it would be built

1. **`src/data/units.ts`**: `MERCENARIES` (gold and upkeep multipliers, hires per Market
   level, `requires: "market"`). All the numbers live here.
2. **State** (`src/core/state.ts`): `mercenary: boolean` on `Regiment`; `mercenariesHired:
   number` on `City`, reset for a faction's cities in `startFactionTurn`
   (`src/systems/turn.ts`). Both plain data.
3. **New `src/systems/mercenaries.ts`**:
   - `canHire(state, factionId, cityId, unit)`: reuses `unitUnlocked` and the checks in
     `canTrain` (room in the army, not besieged, gold), minus the people check.
   - `hire(...)`: builds the regiment as `trainNext` does (id from `nextRegimentNumber`,
     `movementLeft: 0`) and adds it to the army or calls `placeNewArmy`.
   - `mercenariesDesert(state, factionId)`: runs after `payUpkeep` in `endFactionTurn`.
     Logs through `addLog(..., { kind: "recruitment", factions: [owner] })`.
4. **Costs**: `upkeepFor` and `retrainCost` (`systems/armies.ts`, `systems/recruitment.ts`)
   take the regiment's `mercenary` flag; `queuedPeople` counts none for mercenaries;
   `canMerge` / `mergeRegiments` key on unit, tier and the flag.
5. **Action**: `{ type: "hireMercenaries"; cityId; unit }` in `src/core/actions.ts`.
6. **AI** (`src/ai/ai.ts`): in `trainingAction`'s "defense" phase, try a hire where
   `affordableTier` returns null only because the queue is busy (relief muster first, then
   emergency garrisons). It decides on the fogged view, as now, and checks `canHire` on it.
7. **UI** (kept short):
   - Recruitment tab (`src/ui/infoPanel.ts`): a "Hire" row under the unit cards, with
     hires left this turn; greyed with the reason when blocked.
   - Regiment boxes (`src/ui/boxes.ts`) get a small coin mark; tooltip "Mercenaries:
     double upkeep, desert in debt".
   - Money breakdown (`src/ui/turnPanel.ts`): mercenary upkeep shown on its own line.
8. **Tests**:
   - `tests/recruitment.test.ts`: limits per Market level, no people taken, blocked in debt
     and while besieged, the price and upkeep, desertion order.
   - `tests/invariants.ts`: every mercenary regiment is basic tier; no city has hired more
     than its Market level this turn.

## Consequences and risks

- **AI debt is the main risk**, and `npm test` fails on it. The AI's guard (income must
  still cover upkeep after hiring) and desertion are both needed: desertion alone would
  let the AI hire, slip into debt and lose them every turn.
- **Sieges get shorter or fail more.** A relief force raised in one turn breaks sieges
  sooner, so cities taken may fall (sieges were already the AI's weak spot: 1 of 448 ended
  in surrender). If cities taken drop by more than ~20%, limit relief hiring to one a turn.
- **Gold leaves buildings.** As with watchtowers, gold spent here isn't spent on the Senate:
  watch level-3 cities.
- **Scouts:** the AI dismisses scouts when income doesn't cover upkeep. Mercenary upkeep
  could trigger that more often.
- **Rome** is passive in sims, so the player's use (a late-game treasury turned into an
  army) can only be judged by playing.
- **Culture traits (note only):** the separate culture-traits proposal gives the Punic
  factions cheaper cavalry and better ports. A Punic mercenary discount fits their history
  but they already lead (+65% cities), so it should replace one of their edges, not add one.

## How we'll know it works

- `npm run build` is clean, and `npm test` passes: no invalid AI action, no AI debt, and the
  new invariants hold.
- `npm run compare -- --base master --seeds 8`, with and without `--garrison`, with a
  "Mercenaries hired" row added to `tools/compare.ts`.
  **Target:** 10–60 hires a game; median AI treasury at turn 100 down 10–30% (the gold gets
  spent); median AI income within ±10%; cities taken and factions fallen within ±20%;
  level-3 cities down by no more than 2.
- `npm run levers` is unchanged (mercenaries aren't in the peacetime model), as a check that
  nothing else moved.
- A browser check: hire in a Market city, see the regiment at once, unable to move until
  next turn; the Hire row's limits and reasons; desertion in debt.

## Open questions for review

- Is ×2 gold and ×2 upkeep the right price, or should mercenaries cost more to keep than to
  hire (e.g. ×1.5 gold, ×3 upkeep) so they're bought for a war and let go after?
- Should there be a way to dismiss mercenaries (no refund), as there is for scouts?
- Should the AI ever hire for the field campaign, or only to defend?
