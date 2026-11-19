# Decision: a rebel faction for revolted cities

- **Status:** Proposed. Not implemented yet.
- **Decides:** where a city goes when its people win a revolt, and what that holder does
  afterwards.
- **Where it goes once agreed:** the Public order entry in `docs/DECISIONS.md` (it
  replaces "No rebel faction") and the Public order section of `README.md`.
- **Related:** [Events](events.md) (its "a city offers to change sides" event),
  [Moving the capital](moving-the-capital.md).

## Context

Today (`revolt` in `systems/order.ts`), rebel militia attack the garrison: 1 regiment per
2,000 people, from 1 to 5. If they win:

- the city goes back to its **former owner**, if that faction still stands (order 50, no
  fate to choose);
- otherwise **the owner keeps an empty city** at order 30. The rebels win and then vanish.

The second case is odd: the people beat the garrison, and then hand the city back. A rebel
faction gives them somewhere to go. A revolt then loses you the city, and you have to
retake it.

The DECISIONS entry chose "no rebel faction", so that victory and elimination stay
unchanged. This proposal keeps both unchanged: rebels never count as a faction that's
alive.

## Current numbers

8 seeds, 100 turns, measured when public order shipped:

| Measure | Garrisoned / open |
|---|---|
| Revolts in AI cities | 0 / 0 |
| AI cities Restless | 3% / 2% of city-turns |
| AI cities in Unrest | never |

The AI never lets a city reach Unrest, so this is mostly about the **player**. It decides
what happens when you over-tax or under-garrison a conquest. It also matters if events
or other rules later push the AI's order down.

## Choices

| # | Question | Options | Recommended |
|---|---|---|---|
| 1 | Who takes a city whose revolt wins? | **a)** Always the rebels. **b)** Its former owner if alive, otherwise the rebels. | **b)**: a conquered people going home is the better story, and it's today's rule. Rebels replace only the "owner keeps an empty city" case. Pick **a)** if revolts should always cost the owner a fight. |
| 2 | Is it one faction or one per city? | **a)** One "Rebels" faction holding every rebel city. **b)** Each rebel city on its own. | **a)**: one faction entry, one colour, no new state type. Its cities still don't help each other (choice 3). |
| 3 | What do rebels do? | **a)** Nothing: they hold the city with what's left. **b)** They hold and slowly raise militia, but never march out. **c)** They attack nearby. | **b)**: a rebel city that never grows back is a free city for whoever walks in first, and attacking rebels would need a whole AI. |
| 4 | What happens to their cities? | **a)** They're frozen: no growth, no buildings, no gold. **b)** They grow like any city. | **a)** for growth and building. Rebel cities don't pay into a treasury; militia come free from choice 3. |
| 5 | Taking a rebel city | **a)** The usual fate choice (occupy, enslave, exterminate), with the conquest malus. **b)** No malus: it's "liberated". | **a)**: the same rule as any city, so revolts don't become a way round the malus. |
| 6 | Can a fallen faction come back? | **a)** No. **b)** A rebel city whose former owner fell restores that faction. | **a)** for now (DECISIONS: "a fallen faction never returns"). **b)** goes in the backlog. |
| 7 | Key cities (victory) | Do rebels holding one block a key-city win? | **Yes**: nobody holds it, so you have to retake it. |

## Proposed rules (with the recommended picks)

- **Rebels** are a faction in `state.factions` with id `rebels`:
  - grey colour, no culture kit (militia look);
  - `alive` is always false for victory and elimination (`lastFactionStanding`,
    `outcomeFor` and the scoreboard skip them);
  - no turns: the controller skips them, and so does `nextAction`;
  - at war with everyone: any faction may attack or besiege them.
- **A won revolt:**
  - if the former owner stands, the city goes back to them, as today;
  - otherwise it goes to the rebels, with the surviving rebel militia as its garrison;
  - log: "X revolted against Y and declared for no one".
  - The owner can lose their last city this way and be eliminated, as when the city goes
    back to a former owner.
- **Rebel cities:**
  - every `REBELS.raiseEvery` turns (proposed 5), a rebel city gains a militia regiment;
  - the garrison stops growing at its revolt size (1 per 2,000 people, at most 5);
  - no growth, no income, no building or training queues;
  - order isn't used (shown as "—").
- **Sieges:** rebel cities have the usual supplies and can be starved out. They never
  sally.
- **The AI** treats rebel cities like any weakly held target in `assess`. It never
  counts the rebels as a threat.

New numbers live in a new `src/data/rebels.ts`: `raiseEvery`, plus the colour in
`romanWorld.ts`.

## How it would be built

- **Data:** `src/data/rebels.ts`; a rebels entry added to the scenario setup in
  `core/setup.ts`.
- **Systems:**
  - `systems/order.ts` `revolt`: the rebels branch.
  - `systems/turn.ts`: a rebels step at the end of each round, raising militia. Rebels
    have no turn of their own, so it runs after the last faction.
  - `systems/victory.ts`: skip rebels.
- **AI:** `ai/assess.ts` targets them. Check that the fogged view and threats skip rebel
  field armies (they have none).
- **Controller:** skip rebels in the turn order.
- **UI:**
  - the plate and colour;
  - the info panel shows "Rebels" and no order;
  - the scoreboard leaves them out;
  - reports go to the former owner and to neighbours who can see the city.
- **Tests:**
  - a won revolt with no former owner gives the city to the rebels, with the surviving
    garrison;
  - rebels raise militia up to the cap, and never act;
  - victory ignores rebels;
  - `tests/invariants.ts`: rebel cities never grow or queue; no rebel army off a city
    tile.

## How we'd measure it

- `npm test` with a forced-revolt test game: the AI must take a rebel city without an
  invalid action.
- `npm run compare -- --base master --seeds 8 --garrison`, expecting no change: the AI
  never revolts.
- A player-facing check: a player city at high taxes and no garrison revolts and goes
  to the rebels. Then check how long its neighbours leave it alone.
