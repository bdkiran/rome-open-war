# Decision: victory conditions

- **Status:** Proposed. Not implemented yet.
- **Decides:** how a game can be won besides being the last faction standing, and whether
  the player picks it when the game starts.
- **Where it goes once agreed:** `README.md` ("The scenario": how the game is won, and the
  roadmap's Phase 7 line). A short entry goes into `docs/DECISIONS.md` (a new "Game
  structure" section) with the measured numbers.

## Context

Today the only way to win is to be the last faction standing (`lastFactionStanding` in
`systems/victory.ts`). The only way to lose is to lose every city. With 15 factions and 55
cities, that means taking most of the map. At the current pace of AI wars it's a very long
game, so a game almost never reaches an ending. This proposal adds shorter goals: hold a set
of key cities, or have the best score at a set turn, perhaps chosen when the game starts.

## Choices to make

| Question | Options | Recommended |
|---|---|---|
| **What can win** | Last faction standing only (as now). Hold key cities. Best score at turn T. Several, picked at setup. | **Several, picked at setup.** Last faction standing always wins too. |
| Which key cities | The six great capitals: Roma, Carthago, Pella, Corinthus, Antiochia, Alexandria. Every capital (15). | **The six**, listed in the scenario. You need **4 of 6**, so Rome must take 3 more: Carthago and two in the east, or the Greek mainland. |
| For how long | The moment you hold them. 5 turns in a row. | **5 turns in a row**, announced to everyone, so a raid can't win and others can react. |
| Can an AI win | Only the player can win. Any faction can. | **Any faction.** Otherwise the key cities put no pressure on the player. An AI win is a defeat for Rome. |
| Does the AI chase key cities | No change. Weight them in `chooseTarget`. Gang up on a faction about to win. | **No change at first.** The AI keeps taking the cheapest city (DECISIONS backlog). Measure how often an AI wins by accident, then decide. |
| Score at turn T | No time limit. Score at turn 150. Score at turn 100. | **Turn 150**, as its own option. Score counts cities, people and key cities, but not gold, so treasuries don't pile up. |
| Where it's chosen | A constant in `data/gameSetup.ts`. A start screen. | **A start screen** with three presets, default *Key cities*. The choice is stored in the game state, so a save remembers it. |

## Baseline (current code, AI-vs-AI, 100 turns, passive Rome)

| Measure | Value |
|---|---|
| Factions fallen, 8 test games | 15 (DECISIONS, latest entry): about 2 a game. Earlier AI versions gave 11–36. |
| Cities taken, 8 test games | 390 |
| Seed 1 at turn 101 | 3 of 15 fallen (Thrace by turn 75, Gauls, Dacia). Largest factions hold 5–6 of 55 cities |
| Seed 2 at turn 101 | 1 of 15 fallen (passive Rome, between turns 50 and 75). No AI fell. Largest: Spain 7, Carthage 6, Seleucids 6. 14 factions alive |
| The six capitals (seed 2) | All still with their first owners at turn 50 (Roma until Rome fell) |
| Sims stop at | turn 100. No sim has ended by last faction standing |

What this tells us:

- At about 2 factions fallen per 100 turns, ending the game needs 14 to fall, which would
  take hundreds of turns. In practice the player would have to take some 48 cities
  themselves.
- No AI comes close to dominating: the biggest holds 7 of 55 cities (13%) at turn 100. So
  4 of 6 key cities is out of an AI's reach by accident in 100 turns, but within reach of a
  player who goes for it.
- Rome is passive in sims and falls in some seeds. Its capital is one of the six, so sims
  with `--garrison` are the fairer test of whether AIs win by accident.

## Proposal

These are starting numbers, to be tuned against the measurements.

| Preset | Rome wins when | Rome loses when |
|---|---|---|
| **Conquest** | It's the last faction standing (as now) | It loses its last city |
| **Key cities** (default) | It holds 4 of the 6 key cities at the end of 5 of its turns in a row, or it's the last standing | It falls, or another faction meets the key-city goal |
| **Time limit** | Key cities or conquest as above, or the best score after turn 150 | It falls, another faction meets the key-city goal, or another faction has the best score after turn 150 |

| Rule | Starting number |
|---|---|
| Key cities | Roma, Carthago, Pella, Corinthus, Antiochia, Alexandria |
| Needed | 4 of 6 |
| Held for | 5 turns in a row, counted at the end of the holder's turn. Losing one resets the count. |
| Warning | A major report to everyone on the first turn a faction holds 4: "Carthage holds 4 key cities: it wins in 5 turns". |
| Score turn | 150 (checked at the end of the round) |
| Score | 100 per city, 10 per 1,000 people, 300 per key city. Ties go to the faction with more cities. |

## How it would be built

1. **Numbers**:
   - `src/data/gameSetup.ts` gets `VICTORY`: `keyCitiesNeeded`, `holdTurns`, `scoreTurn` and the score weights, plus the default preset.
   - `src/data/scenarios/types.ts` gets an optional `keyCities: readonly string[]` (city names) on `Scenario`. `romanWorld.ts` lists the six.
2. **State** (`src/core/state.ts`): `GameState.victory: { preset: "conquest" | "keyCities" | "timeLimit"; keyCities: CityId[]; holding: { factionId: FactionId; since: number } | null }`. `createGame` (`core/setup.ts`) maps names to ids and takes the preset as an option.
3. **Rules** (`src/systems/victory.ts`):
   - `keyCitiesHeld`, `trackKeyCities(state, factionId)` and `score(state, factionId)`, plus `winner(state)`, which `outcomeFor` now uses.
   - `trackKeyCities` runs in `endFactionTurn` (`systems/turn.ts`). It updates `holding` and logs the warning with `addLog(…, { kind: "war", major: true })`.
   - `Outcome` gets a `reason: "conquest" | "keyCities" | "score"`, and defeat can now come from another faction's victory.
4. **Ending the game**:
   - `GameController.runAiTurns` stops once there's a winner, not only when no human is alive.
   - `tools/simulation.ts` stops on a winner too and returns the winning turn and reason.
   - `applyAction` refuses actions after a win, so state can't move on underneath the game-over screen.
5. **UI** (kept short):
   - A start modal in `index.html` / `main.ts` with three buttons. `createGame` currently runs when `main.ts` loads, so the controller is made after the choice.
   - `ui/gameOver.ts` gets one line per reason.
   - `ui/turnPanel.ts` adds a key-city count on each scoreboard row and the score in its tooltip.
   - `render/cityPlate.ts` marks the key cities.
6. **Tests and tools**:
   - `tests/victory.test.ts`: 4 key cities held for 5 turns wins; losing one resets the count; the score after turn 150; last standing still wins.
   - `tests/invariants.ts`: `holding` names a living faction that holds at least 4 key cities.
   - `tests/map.test.ts`: every key city can be reached (it already checks every city).
   - `tools/compare.ts` gets new rows: games won, winning turn, and the most key cities held at the last turn.

## Consequences and risks

- **An AI can win by accident.** That's a defeat the player didn't see coming from an AI
  that wasn't trying. The warning report gives 5 turns to react. If sims show AI wins
  before turn 100, raise `holdTurns` or the number needed before changing the AI.
- **The AI ignores the goal.** Nobody gangs up on a faction that's about to win, Rome
  included. That keeps the backlog item as it is ("targets whoever is cheapest"), but a
  player who's about to win meets no extra resistance. If that feels flat, the follow-up
  is a target weight for key cities held by a leader, which is a balance change and would
  get its own plan.
- **Score and conquest choices.** People count toward the score, so exterminating a city
  costs score. That shifts the occupy / enslave / exterminate levers (`npm run levers`,
  `tests/balance.test.ts`). Gold is left out so hoarding doesn't pay.
- **Diplomacy.** If `diplomacy.md` lands, a race for key cities gives factions a reason for
  truces. With lasting peace, the score preset would reward sitting tight, which is one
  more reason for treaties that run out.
- **Small key factions.** Pella (Macedon, 2 cities) and Corinthus (the Greeks, 1 city by
  turn 100 in seed 2) fall more easily than Carthago or Antiochia, so the east may become
  the obvious route.
- **DECISIONS.** This adds to Phase 7 ("last faction standing"); it doesn't replace it.
  The island cities that couldn't be reached and "the game couldn't end" are why every key
  city must stay reachable, which `map.test.ts` covers.

## How we'll know it works

- `npm run build` is clean, and `npm test` passes, with the new test and invariant.
- `npm run compare -- --base master --seeds 8`, with and without `--garrison`. Until a
  win, the rules change nothing, so every other number should match the baseline up to
  the winning turn. **Target:** with `--garrison`, no AI meets the key-city goal by turn
  100 in more than 1 of 8 games, and the most key cities held by one faction is reported.
- A scripted check in `tests/victory.test.ts`: give Rome 4 key cities, end 5 turns, and the
  outcome is a key-city victory.
- A browser check:
  - the start screen sets the preset;
  - the key cities are marked;
  - the warning report appears;
  - victory and defeat show the right reason;
  - after a win, the map can be viewed but no orders go through.
- Played by hand: an active Rome can win on key cities in roughly 60–120 turns. A sim can't
  measure this, since Rome is passive there.

## Open questions for review

- Are these the right six cities, and is it right to need 4 of them? Should Roma be required?
- Is 5 turns long enough to react, given that relief marches can take 3–5 turns?
- Should the score preset exist at all, and is turn 150 right?
- Should the AI start chasing key cities once someone holds 3?
