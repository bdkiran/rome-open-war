# Decision: public order

- **Status:** Proposed. Not implemented yet.
- **Decides:** whether cities have public order, what raises and lowers it, and what low
  order costs, up to revolt.
- **Where it goes once agreed:** this replaces the backlog line "Public order / unrest was
  discussed, not built". When it's built, an entry goes into `docs/DECISIONS.md` (Cities and
  economy) with the measured numbers, and `README.md` gets a Public order section and
  changes to Taking cities and Your opponents.

## Context

Today the economic levers cost something only when you pull them. High taxes slow growth
while they last. Exterminating halves a city once. After that, a conquered city is as loyal
as the capital, so a faction that wins wars keeps every city at full value and snowballs.
Public order gives taxes and conquest a cost that lasts, and it works as a brake on large
empires. It mustn't make the AI fall into debt or leave a lever with no point in using it
(`tests/balance.test.ts`).

## Choices to make

| Question | Options | Recommended |
|---|---|---|
| How order moves | A running score that every cause pushes each turn. A **target** worked out from the city's situation, with order moving toward it. | **Target.** A target can't run away. A tooltip can show its breakdown, like the money breakdown. Recovery over time comes for free. |
| What sets off a revolt | A dice roll each turn while order is low. A fixed threshold. | **Fixed threshold.** It uses no RNG, the city is warned the turn before, and the AI can plan for it. |
| What a revolt does | Rebel militia fight the garrison, and if they win the city goes back to its former owner. The city always goes back. A new rebel faction. | **Rebels fight the garrison.** If they win, the city goes to its former owner if that faction is alive; otherwise it's left empty. A rebel faction would hold no capital, and victory and `eliminateIfDefeated` would need exceptions for it. Always going back does nothing once the former owner has fallen. |
| Foreign culture | Ignore it. A small, permanent malus. | **A small malus (−10).** It needs `City.culture` stamped at setup. This is the first rule that reads a city's own culture: cultures are "only a look" today, and the culture-traits proposal uses the owner's culture. |
| A building that raises order | A new Temple. Government levels. None. | **None in this round.** Taxes and garrisons are the levers. A new building changes the AI's build order, the levers model and the Town cards. A Temple can come later. |
| Who sees a city's order | Its owner. Anyone who can see the city. | **Its owner only.** The AI's fogged view needs no change. |
| Brake on large empires | None. A malus per city held. | **−2 per city beyond 7, at most −20.** Rome starts with 7, so no faction pays anything at the start. |

## Baseline (current code, seed 1, 100 turns, passive Rome)

| Measure | Value |
|---|---|
| AI city-turns on normal / high / low taxes | 77% / 23% / 0% (3,907 / 1,154 / 0 of 5,061) |
| Taxes at turn 100 | 48 cities normal, 7 high |
| City-turns under siege | 2.4% (121) |
| Cities taken (`settleCity`) | 51 |
| Cities that changed hands at least once | 27 of 55 (one of them 6 times) |
| Cities not with their first owner at turn 100 | 26 of 55 |
| Factions alive at turn 100 | 12 of 15 |
| City levels at turn 100 (1 / 2 / 3) | 33 / 21 / 1 |
| Levers (DECISIONS) | "grow, then tax" overtakes all-high at about turn 70. Exterminating is best for about 10 turns, enslaving for about 25, occupying after that. |

What this tells us:

- The AI never uses low taxes. Its high taxes are war taxes (every city at once while it
  relieves a besieged one) and full cities. So a high-tax malus hits the AI's war chest
  first, and `aiTaxRate` has to know about order.
- Half the map changes hands in a game, so a conquest malus touches many cities, and a brake
  has plenty to act on.
- Sieges are short and rare per city, so a siege malus matters little on its own.

## Proposal

These are starting numbers, to be tuned against the measurements.

Order runs from 0 to 100 and moves **10 points a turn** toward its target. A captured city
starts at 30.

| Cause | Change to the target (base 60) |
|---|---|
| Taxes | Low +15, normal 0, high −20 |
| Garrison | +5 per regiment in the city, at most +15 |
| Capital | +10 |
| Conquered | Occupied −20, enslaved −30, exterminated −40, fading by 1 a turn |
| Under siege | −15 while besieged |
| Foreign culture (not the owner's) | −10 |
| Empire size | −2 per city beyond 7, at most −20 |

| Order | Band | Effect |
|---|---|---|
| 50–100 | Content | None |
| 30–49 | Restless | Gold ×0.8, growth ×0.75 |
| 10–29 | Unrest | Gold ×0.5, no growth, no training |
| Under 10 at the end of the owner's turn | **Revolt** | See below. The city panel warns once the target is under 10. |

**Revolt.** Rebels rise: 1 militia regiment per 2,000 people, at most 5. They attack the
garrison, which keeps the city's defense bonus.
- **The garrison wins:** the rebels come out of the city's people, and order is set to 30.
- **The rebels win, or there's no garrison:** the garrison is destroyed, as a garrison
  defending its city always is. If the city's former owner is alive, the city goes back to
  it as its own (no fate to decide, order 50, conquered malus cleared). If not, the city is
  left empty, at order 30, for whoever walks in.

Worked examples (normal taxes, 2-regiment garrison, unless stated):

| City | Target | Band |
|---|---|---|
| Home city | 70 | Content |
| Home city, war taxes | 50 | Content (just) |
| Home city, war taxes, 12-city empire | 40 | Restless |
| Just occupied, foreign | 40 | Restless; Content after 10 turns |
| Just exterminated, foreign | 20 | Unrest; Restless after 10 turns |
| Just exterminated, foreign, high taxes | 0 | Revolts within 3 turns |

## How it would be built

1. **`src/data/order.ts`** (new): `ORDER` holds every number above (base, step per turn,
   start after capture, band edges and effects, tax and garrison terms, conquest malus by
   choice, fade, siege, culture, empire size, revolt threshold, rebels per people, order
   after a revolt). The conquest malus could instead be an `unrest` field on each
   `SETTLEMENT` entry in `src/data/conquest.ts`.
2. **`City`** (`core/state.ts`) gets `order: number`, `culture: Culture` (stamped in
   `createCity` from the founding faction), `formerOwner: FactionId | null` and
   `conquestUnrest: number` (the fading malus). All plain numbers and strings.
3. **`src/systems/order.ts`** (new):
   - `orderTarget(state, city)` returns a breakdown, like `IncomeBreakdown`.
   - `orderBand(city)`.
   - `processOrder(ctx, state, factionId)`, called in `endFactionTurn`
     (`systems/turn.ts`) after `processSieges` and before `payUpkeep`. It moves order,
     fades the malus and resolves revolts.
   - The revolt battle reuses `resolveBattle`, `battlefieldAt` and `applyLosses`
     (`systems/combat.ts`). A city going back uses `captureCity`, then clears `unsettled`.
     `eliminateIfDefeated` runs for the loser.
4. **Effects:**
   - `cityStats` (`systems/cities.ts`) applies the gold and growth multipliers and adds
     `order` to `IncomeBreakdown`, so the money breakdown shows it.
   - `canTrain` and `processRecruitment` (`systems/recruitment.ts`) stop training in
     Unrest.
5. **Conquest:** `captureCity` sets order 30 and `formerOwner`. `settleCity`
   (`systems/conquest.ts`) sets the malus for the chosen fate.
6. **AI** (`ai/ai.ts`, numbers in `data/ai.ts`):
   - `aiTaxRate` doesn't tax a city high if that would put its target under 30, even at
     war or in debt. It sets low taxes where order is under 30.
     `tools/economy.ts` uses `aiTaxRate` for "the AI" policy, so the levers report picks
     this up.
   - Defense training adds a regiment to any city under 40, within
     `minRecruitPopulation` and the upkeep headroom. `launchAction` doesn't draw a
     garrison below that.
   - `settleAction` exterminates only if the city's target would stay at 10 or more with
     the garrison it has.
7. **UI** (kept short):
   - The city panel fact reads "Order 42 · Restless", with the breakdown in a `title`.
   - A plate marker shows Restless or Unrest.
   - Reports: "Tarsus is close to revolt" (kind `city`, the owner). A revolt is major
     world news.
8. **Tests:**
   - `tests/invariants.ts`: order stays in 0–100, `formerOwner` is never the owner, and
     `culture` is a known culture.
   - New `tests/order.test.ts`: the target breakdown, each band's effect, and both
     revolt outcomes.
   - `tools/economy.ts` assumes a garrison of `AI.baseGarrison` regiments, since it has
     no armies.
9. **Tooling** (`tools/compare.ts`): rows for revolts, Restless and Unrest city-turns,
   and cities returned by revolt.

## Consequences and risks

- **Taxes lever.** In conquered cities "grow, then tax" costs more. Home cities with a
  garrison stay Content at high taxes. `balance.test.ts` should still see "grow, then tax"
  overtake all-high within 30–90 turns.
- **Conquest lever.** Exterminating loses long-run value: a halved city in Unrest earns
  half for about 10 turns. The test's "rarely best in the long run" check (≤15% / ≤10%) gets
  easier to pass. "Best after 5 turns for ≥90% of cities" should hold, since plunder is
  unchanged. Occupying overtakes exterminating sooner. That's still inside 8–40 turns, but
  it needs checking.
- **War taxes are weaker.** At war, the AI's far cities go Restless, so high taxes pay ×1.2
  instead of ×1.5. Relief forces get less money, and more cities may fall to sieges.
- **AI debt** (`npm test` fails on it). Less gold, plus "high taxes when in debt", could
  spiral into revolts. That's why `aiTaxRate` never taxes a city into Restless.
- **Militia are the cheapest order.** +5 costs about 2 gold a turn. Counting soldiers
  instead of regiments would stop a skeleton garrison counting the same as a full one.
- **A brake, not a stop.** The player wants factions to keep conquering each other
  (AGENTS, Testing). If wars stall, the conquest malus and the empire-size term are the
  numbers to soften first.
- **Ping-pong.** A city could revolt, be retaken and revolt again (Samarobriva already
  changed hands 4 times in 40 turns). A revolt clears the conquest malus, which limits it.
- **Fallen factions stay fallen.** A revolt never revives a faction, so
  `eliminateIfDefeated` and victory are unchanged.
- No RNG is used. Rome is passive in sims, so its side is judged by playing.

## How we'll know it works

- `npm run build` is clean, and `npm test` passes: no invalid AI action, no AI debt, and the
  new invariants hold.
- `npm run compare -- --base master --seeds 8`, with and without `--garrison`.
  **Targets:**
  - 3–15 revolts a game.
  - The AI's high-tax city-turns don't rise.
  - Cities not with their first owner at turn 100 fall by 15–35% (from about 26 of 55).
  - At least one faction falls in a median game.
  - Median AI income within −15%.
  - City levels still spread across 1–3.
- `npm run levers` and `tests/balance.test.ts`: every trade-off still holds. The
  before/after table is reported.
- A browser check: Rome exterminates a city, taxes it high, leaves it empty, then sees the
  warning, the revolt, the breakdown tooltip and the Order line in the money breakdown.

## Open questions for review

- Rebels that hand the city back, or rebels that only empty it?
- Is −2 per city beyond 7 the right brake, or should distance from the capital count
  instead?
- Garrison by regiment or by soldiers?
- A Temple (or other building) in a later round?
- Should enemy cities' order show when they're in sight?
