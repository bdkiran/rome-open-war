# Decision: siege equipment

- **Status:** Proposed. Not implemented yet.
- **Decides:** whether a walled city can be stormed at once, and how besiegers build the
  equipment they need to storm it.
- **Where it goes once agreed:** a new entry under Sieges in `docs/DECISIONS.md` with the
  measured numbers, and the Sieges section of `README.md`.
- **Related:**
  - [Battles](battles.md): a city's frontage is 4 + its wall level, and siege towers could
    add attacker frontage.
  - [Generals](generals.md): their *Besieger* trait would become a faster build rate.
  - [Culture traits](culture-traits.md): Roman engineers, as an open question.

## Context

The player doesn't like that a city can be stormed immediately. Today any army next to
an enemy city can attack it at once (`canAttack` in `systems/combat.ts` has no siege
condition). Walls only add a defense bonus (+15% / +30% / +50%), so a big enough army walks
up and storms on the same turn. The siege screen's "Continue the siege" is mostly waiting
for the garrison to wear down.

The player's two rules:

1. **Taking a walled city needs siege equipment, and building it takes turns.** How many
   depends on the size of the besieging army.
2. **More equipment gives a better chance**, so there's a reason to wait and build more
   before storming.

## Baseline (current code, seeds 1 and 2, 100 turns, passive Rome)

| Measure | Seed 1 | Seed 2 |
|---|---|---|
| Cities changing hands | 49 | 42 |
| Battles for a city (storms) | 40 | 24 |
| Storms by wall level (none / palisade / stone / great) | 34 / 5 / 1 / 0 | 24 / 0 / 0 / 0 |
| Storms won: no walls, any walls | 26 of 34, 6 of 6 | 21 of 24, none with walls |
| Storms with no siege first | 28 of 40 (70%) | 18 of 24 (75%) |
| Turns besieged before the storm, when there was a siege | 1: 9, 2: 3 | 1: 4, 3: 1, 4: 1 |
| Surrenders (DECISIONS: 1 of 448 sieges in 8 games) | about 0–1 | 0 |

What this tells us:

- **Almost all storms today are of unwalled cities** (58 of 64). Walled storms are rare, and
  the attackers won all of them. A rule that applies only to walls changes few AI battles,
  and most of the change lands on cities that chose to build walls: AI border cities, and
  the player's. That's where it should land, since walls are an investment.
- **Most storms skip the siege entirely**, and the rest storm after one turn. With this
  rule, walled cities will see sieges of several turns, which brings the supplies countdown
  and relief armies into play.
- The extra turns carry a real cost: attrition, relief armies, sallies that break the siege.
  That's the "should I wait for one more tower?" decision the player wants.

## Choices to make

| Question | Options | Recommended |
|---|---|---|
| Which cities need equipment | Every city. **Walled cities only.** | **Walled only.** An unwalled town can still be rushed, which keeps early wars moving and gives walls a clear job. |
| Without enough equipment | Storming at a big penalty. **Storming not allowed.** | **Not allowed** for the minimum: it's the player's rule, and it's easy to read ("Needs 2 siege works: 1 more turn"). |
| Where equipment is kept | On each army. **On the siege (the city).** | **On the siege.** Every army besieging the city builds, and it's all lost when the siege ends: lifted, broken by a sally or relief force, or the city taken. That makes sallies and relief forces matter more. |
| What builds it | Every soldier alike. **Infantry fully, cavalry at half.** A new engineer unit. | **Infantry fully, cavalry at half.** No new unit or building. Engineers could come later. |
| Cost | **Time only.** Gold per point. | **Time only.** The cost is the turns: attrition, relief, sallies, and the army stuck there. |
| Equipment types | **One number with named steps** (ladders, rams, towers). Separate counts per type. | **One number.** Steps are names for the same scale, which the siege screen shows. |
| Walking into an empty walled city | Needs equipment too. **Still allowed.** | **Still allowed.** Nobody defends the walls. |

## Proposal

These are starting numbers, to be tuned.

### Siege works

| Rule | Starting number |
|---|---|
| Siege works | A number on the besieged city, from 0 to 5. It starts at 0 when the siege starts |
| Built at the end of the besieger's turn | +1 per 500 soldiers next to the city (cavalry count half), kept as a fraction, at most 5 |
| Shown as | 1 ladders, 2 rams, 3 a siege tower, 4 two towers, 5 full siege works |
| Lost | When the siege ends for any reason |
| Needed to storm | At least the wall level: palisade 1, stone walls 2, great walls 3 |
| Each point weakens the walls | −20% of the walls' bonus per point, down to nothing at 5 |

How long building takes (turns to reach the minimum, then to full works):

| Besiegers | Works per turn | Palisade (1) | Stone walls (2) | Great walls (3) | Full (5) |
|---|---|---|---|---|---|
| 2 regiments (~400) | 0.8 | 2 turns | 3 | 4 | 7 |
| 4 regiments (~750) | 1.5 | 1 | 2 | 2 | 4 |
| 7 regiments (~1,300) | 2.6 | 1 | 1 | 2 | 2 |
| 10 regiments (~1,900) | 3.8 | 1 | 1 | 1 | 2 |

What the walls are worth as the works grow:

| Walls (bonus today) | At the minimum | 1 point more | 2 points more | At 5 |
|---|---|---|---|---|
| Palisade (+15%) | +12% | +9% | +6% | 0 |
| Stone walls (+30%) | +18% | +12% | +6% | 0 |
| Great walls (+50%) | +20% | +10% | 0 | 0 |

- The city's own +10% and the terrain bonus stay.
- Waiting always helps until 5, but each turn costs time and gives the defender's relief
  a chance.

### The race against supplies

Supplies are unchanged: 3 / 4 / 5 turns by city level, +1 for a capital.

- **A small army** (2 regiments) can't storm great walls before a level-1 city would
  surrender anyway, so it just starves it out. That's fine: it's a slow siege, not a storm.
- **A real army** (4 or more regiments) reaches the minimum in 1–2 turns. It can storm well
  before the supplies run out, or wait a turn or two for better works.
- That keeps storming as the main way to take a city (DECISIONS, Sieges), now with a wait
  that grows with the walls and shrinks with the army.

### Siege screen and preview

- The siege screen shows:
  - the siege works now and the turns to the next point ("2 rams, 1.4 more next turn")
  - the turns until the city surrenders
  - the odds of storming now, and the odds at full works
- Storm is greyed out below the minimum, with the reason: "Needs 2 siege works: 1 more
  turn."
- On the map, besieging soldiers gain ladders, then a ram, then towers beside the city.

## How it would be built

1. **`src/data/siege.ts`**: soldiers per work point, the cavalry share, the cap (5), the
   minimum by wall level, the weakening per point, and the step names. Every number lives
   here.
2. **State**: `City.siegeWorks: number`. It's 0 when there's no siege and reset in
   `endSiege` (`systems/siege.ts`), the same place supplies are refilled.
3. **Building**: in `processSieges`, after attrition, add works from the soldiers in every
   army of the besieger next to the city (the same armies `besiegerStillThere` checks).
4. **Storming**:
   - `canAttack` (`systems/combat.ts`) refuses an attack on a defended city whose
     `siegeWorks` is below its wall level, with a short reason.
   - `defenseBonusAt` / `cityDefense` take the works into account, so `battlefieldAt`, the
     preview and `battleStrength` all see the weakened walls with no other change.
5. **The AI** (`ai/ai.ts`):
   - It already besieges, waits and storms "once the odds are good". It must now check
     `canAttack` before storming. The rule that the AI never issues an invalid action
     makes this mandatory, and `npm test` catches it.
   - It storms when the odds are good *with the current works*, otherwise it waits.
   - Waiting costs the AI nothing extra to decide.
   - When defending, it treats a siege with high works as more urgent for its relief force.
6. **UI**:
   - `ui/siegePanel.ts`: works, turns to the next point, and odds now and at full.
   - `render/three/town.ts`: the equipment models beside a besieged city.
   - Detail goes in tooltips.
7. **Tests**:
   - `tests/siege.test.ts`:
     - works grow with army size and cap at 5
     - they reset when a siege ends
     - storming is refused below the minimum
     - each point weakens the walls as in the table
     - an empty walled city can still be walked into
   - `tests/invariants.ts`: works are 0 with no siege and within 0–5.

## Consequences and risks

- **Walled cities get much safer from a quick strike**, and walls become a bigger
  investment. The AI builds walls near its borders, so border wars slow down. Watch the
  number of cities taken.
- **Sieges get longer, so relief armies and sallies matter more.** DECISIONS records that
  sallies breaking sieges already made surrender rare (1 of 448). With works lost on a
  break, a successful sally costs the besieger several turns. That's intended, but it may
  cut conquest further.
- **Small armies can't storm walls quickly.** They have to starve the city out or bring
  friends. That's the point, but it could make the AI's small field armies (1–3 regiments
  is typical) stall at walled cities. The AI may need to gather more armies at a siege; a
  follow-up if the numbers show it.
- **Doesn't touch unwalled cities,** which are 90% of today's storms, so early-game pace
  should barely change.
- **Fits the battles proposal:** a city's frontage is 4 + wall level there, so works could
  also lower the defender's frontage bonus. That's left to that doc.

## How we'll know it works

- `npm run build` clean, and `npm test` passes: no invalid storm, the new invariants hold.
- `npm run compare -- --base master --seeds 8`, with and without `--garrison`. Add these
  rows to `tools/compare.ts`:
  - storms of walled cities
  - median siege turns before a walled storm
  - surrenders
  - median siege works at the storm

**Targets:**

- Cities not with their first owner and factions fallen within −25% of the baseline. Some
  slowdown is the point.
- Walled storms happen after a median of 2–3 turns of siege, not 0–1.
- Most walled storms happen above the minimum works, which shows the "wait for more"
  incentive works.
- No more than a quarter of walled sieges are abandoned by the AI.

Playing checks, with `--garrison` and in the browser:

- A Roman city with stone walls can't be stormed the turn an army arrives.
- The siege screen shows the works growing, and the storm odds improve each turn.

## Open questions for review

- Should unwalled cities need a little equipment too (for example ladders: 1 point), or stay
  stormable at once?
- Is 500 soldiers per point a turn the right pace? It makes a 4-regiment army ready for
  stone walls in 2 turns.
- Should siege works cost gold as well as time?
- Should the Romans build faster (+50%), as part of their culture traits?
- Should a successful sally destroy only some of the works instead of ending the siege, as
  it does today?
