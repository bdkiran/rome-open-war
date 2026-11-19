# Decision: moving the capital by choice

- **Status:** Proposed. Not implemented yet. This replaces the "Moving the capital"
  backlog line in `docs/DECISIONS.md`.
- **Decides:** how a faction moves its capital to another of its cities, what it costs,
  and when the AI does it.
- **Where it goes once agreed:** the Public order entry in `docs/DECISIONS.md`, and the
  Cities and Public order sections of `README.md`.
- **Related:** [Rebels](rebels.md) (far-flung conquests revolt less if the capital
  follows them).

## Context

What being the capital does today:

| Effect | Where | Amount |
|---|---|---|
| Order | `ORDER.capital` | +10 in the capital |
| Distance malus | `ORDER.distance`, measured from the capital | −1 per 2 tiles beyond 10, at most −20 |
| Siege supplies | `SIEGE.capitalExtraTurns` | extra turns of stores |
| AI garrison | `AI.capitalGarrison` | 3 regiments, not 2 |
| Look | town model and plate | a capital's town |

The capital moves only when it falls, to the largest remaining city (`moveCapital` in
`systems/cities.ts`). That happened 9–10 times a game in the public-order measurements.

The **six great capitals** for the key-cities win are fixed cities (Roma, Carthago,
Pella, …). Moving a faction's capital doesn't change them.

The reason to move it: distance is the brake on big empires. Rome conquering Iberia or
the East pays up to −20 order there for good. Moving the capital trades that malus
between the old heartland and the new frontier.

## Choices

| # | Question | Options | Recommended |
|---|---|---|---|
| 1 | What it costs | **a)** Gold. **b)** A wait: the move takes N turns, with no capital bonus anywhere meanwhile. **c)** An order hit in the old capital. **d)** A mix. | **a) + a cooldown**: one click, a clear price, and no new "in transit" state to show. The old capital loses its +10 and gains its distance malus, which is already a real cost. |
| 2 | The price | Flat, or by the new seat's size | **Proposed 300 gold**: about 2–3 turns of a mid-game faction's income. It's a light, proposed or strong lever (150 / 300 / 600) for the variant runs. |
| 3 | How often | Cooldown | **20 turns** between moves, by choice or by losing the capital. The same as the conquest fade. |
| 4 | Which city may become the capital | Restrictions | Not besieged; owned for at least `conquestFadeTurns` (its conquest malus gone); order Content. That stops a fresh conquest becoming a capital the turn it's taken. |
| 5 | Siege stores | Does the new capital fill its stores at once? | **Yes**, as `moveCapital` does today. The old capital's stores are trimmed to its new maximum. |
| 6 | Does the AI do it? | **a)** Never. **b)** When it pays clearly. | **b)**, using the rule below. Without it, the player alone gets the lever. |

## Proposed rules

- **"Make capital"** goes on the Town tab of an eligible city. It shows the price and,
  in its tooltip, the change in order across the faction ("+8 order in 4 cities, −6 in
  3").
- **The move:**
  - costs `CAPITAL.moveCost` (300) gold;
  - sets `isCapital` on the new city and clears it on the old one;
  - the new capital gets its stores at once, and the old one's are trimmed;
  - log: "Rome moves its capital to Carthago Nova".
- **Cooldown:** `faction.capitalMovedOn` records the turn. It's checked by choice, and
  set too when a fallen capital passes on.
- **The AI** considers a move at the start of its turn, if:
  - it's off cooldown;
  - it can pay the price and keep its usual reserve;
  - some eligible city would raise the summed order target of all its cities by at
    least `AI.capitalMoveGain` (proposed 20 points).

  It picks the city with the largest gain.
- Everything else (order, supplies, AI garrison, look) already reads `isCapital`, so it
  follows on its own.

The numbers go in a new `CAPITAL` block in `src/data/order.ts`, or in `src/data/cities`
if that reads better: `moveCost`, `cooldownTurns`. `AI.capitalMoveGain` goes in
`src/data/ai.ts`.

## How it would be built

- **State:** `Faction.capitalMovedOn: number | null` (the JSON round trip test covers
  it).
- **Action:** `{ type: "moveCapital", factionId, cityId }` in `core/actions.ts`, checked
  by:
  - `canMoveCapital(state, factionId, cityId)`, which returns the blocking reason for the
    UI;
  - a rule in `systems/cities.ts`, reusing today's `moveCapital` for the stores and log.
- **AI:** in `ai/ai.ts`, before building. It works out the gain with `orderTarget` for
  each candidate seat.
- **UI:** the Town tab button with the reason when it's blocked ("Besieged", "Taken 6
  turns ago", "Moved 12 turns ago"), and the tooltip with the order change.
- **Tests:**
  - the move costs gold, sets the cooldown and moves the bonuses;
  - every blocked case is refused;
  - a fallen capital passing on starts the cooldown;
  - the AI never issues an invalid move;
  - `tests/invariants.ts`: exactly one capital per faction with cities.

## How we'd measure it

- `npm run compare -- --base master --seeds 8 --garrison` with the AI rule on:
  - capital moves a game (by choice and by loss);
  - AI cities Restless;
  - AI income and treasury.

  Expect few moves: the AI's empires are rarely big enough to gain 20 points.
- A player-facing check: Rome holding Italy and Iberia sees which seat maximises order,
  and that the tooltip's numbers match what happens.
