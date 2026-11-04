# Decision: morale and frontage in battle

- **Status:** Proposed. Not implemented yet.
- **Decides:** whether battles track morale separately from soldiers, whether the ground
  limits how many regiments fight at once, and the smaller rules that come with that.
- **Where it goes once agreed:** new entries under Combat in `docs/DECISIONS.md`, with the
  measured numbers, and the Battles section of `README.md`.
- **Related:** [Battle stances](battle-stances.md) (the tactics layer: this proposal leaves it
  to that doc), [Generals](generals.md) (could raise morale), and
  [Supply and attrition](supply-and-attrition.md) (rejected, so nothing here depends on supply).

## Context

The player asked for more interesting battles, based on a frontline model of land combat
from another strategy game. That model has five ideas worth taking:

1. **Two bars.** A unit has *organization* (will to fight) and *strength* (men). When
   organization runs out the unit retreats; when strength runs out it's destroyed. Most
   fighting wears down organization, so a beaten unit usually survives, but it's worn out.
2. **Combat width.** The ground limits how many units fight at once: open ground holds the
   most, mountains and marshes the fewest. Attacking from more directions adds width.
3. **Reserves.** Units that don't fit wait, and join as places open up on the line.
4. **Separate block stats for attacking and defending** ("breakthrough" and "defense"), so
   some units are built to break a line and others to hold one.
5. **Tactics, terrain and forts.** Tactics are picked each phase and can counter each other.
   Rivers, mountains and forts each cut the attacker's power.

Supply and air power are left out: supply was rejected, and the game has no air.

Today a battle is one exchange of rounds (`resolveBattle` in `systems/combat.ts`). Two
volleys, then melee rounds of attack ÷ armor, until a side has lost **half its soldiers**
and breaks. So:

- Morale *is* casualties.
- Every regiment in a 10-regiment stack fights from the first round.
- A beaten army is just a smaller army: by its next turn it fights as well as ever.
- Ground matters only through the defender's bonus.

## Baseline (current code, seed 1, 100 turns, passive Rome)

| Measure | Value |
|---|---|
| Battles | 396; 35% chases of fled remnants, 19% end during the volleys (battle-stances baseline) |
| AI attacker won | 91% (it attacks at 1.2 times the defender's strength) |
| Field armies, regiments each (counted every round) | 1: 408, 2: 132, 3: 213, 4: 26, 5: 27, 6: 7 |
| Garrisons, regiments each | 1: 77, 2: 2,466, 3: 1,655, 4: 1,114, 5: 143, 6+: 31 |
| Ground under field armies | plains 354, hills 240, forest 147, mountains 62, desert 10 |

What this tells us:

- AI armies are small. A frontage of 6 on open ground would almost never bind an AI army
  on its own. It binds joint battles, big garrisons in rough ground, and the player's large
  stacks, which is exactly what it's for: a 10-regiment stack shouldn't win just by being
  10 regiments.
- 37% of field armies stand in hills, forest or mountains, so a smaller frontage there
  will matter.
- Battles are nearly always won by the side the AI expected. Morale that carries over
  from turn to turn adds a second question: *how fresh* is that army, not only how big?

## Choices to make

| Question | Options | Recommended |
|---|---|---|
| Morale | (a) Keep "break at half the soldiers". (b) Morale only inside a battle (starts full every time). (c) **Morale that carries over** between turns and recovers with rest. | **(c).** (b) mostly reshuffles today's break point. (c) makes worn armies, pursuit and rest matter. It's one number per regiment: plain data. |
| When a side loses | (a) When its average morale hits 0. (b) Each regiment leaves the line when *its* morale hits 0, and the side loses when no regiment is left on the line or in reserve. | **(b).** Regiments drop out one by one and reserves step in, so frontage and reserves mean something. |
| Frontage | (a) None. (b) A hard cap per tile, extras wait in reserve. (c) A soft cap with a penalty for going over. | **(b).** Easy to read ("hills: 4 regiments on the line"). The over-width penalty formula from the reference is hard to explain in a tooltip. |
| Flanking | (a) No. (b) Each extra tile the attackers come from adds frontage. | **(b).** Joint battles (`battleSides`) already gather armies from several tiles; this rewards surrounding a target. |
| How reserves join | (a) A dice roll each round (the reference uses a 2% chance an hour). (b) As soon as a place on the line is free, in order. | **(b).** Luck is already large (±90% a round). A deterministic order keeps the 200-battle preview readable. |
| Separate attack and defense block stats | (a) No, keep one armor. (b) Split armor into *hold* (defending) and *push* (attacking). | **(a) for now.** It would change the unit triangle, which was fitted carefully (DECISIONS, Combat). It's listed as a later step. |
| Tactics | Per-round tactics chosen by the dice. Player-chosen stances. | **Stances,** as in [battle-stances.md](battle-stances.md). Hidden dice tactics would add luck the player can't see. |
| Battles over several turns | (a) Resolve in one go, as now. (b) A battle that hasn't ended carries over to the next turn. | **(a).** One click, one result. Morale that carries over gives most of the "long fight" feel without a battle being left open. |

## Proposal

These are starting numbers, to be tuned.

### 1. Morale

| Rule | Starting number |
|---|---|
| Morale per regiment | 0–100, stored on `Regiment` |
| Melee and volley blows | Each blow costs soldiers as today, **plus 3 morale per 1% of the regiment's soldiers lost** |
| A regiment leaves the line | At 0 morale. It stops fighting, takes no more blows, and waits behind the line |
| A side loses | When it has no regiment left on the line and none in reserve that can step in |
| Winners' morale | Their survivors keep the morale they ended on |
| Losers | Flee as today (fleeing, routs and fighting to the death are unchanged). They arrive with **10 morale** |
| Recovery, start of the owner's turn | +20 in the field, +35 in their own city, +10 while besieged |
| Better troops | Tiers and experience take less morale damage: ÷ the tier's multiplier (1 / 1.3 / 1.6), and −5% per experience level |
| New and retrained regiments | Full morale; a retrained regiment keeps its own morale |

Roughly, a regiment at full morale leaves the line after losing about a third of its
soldiers. That's close to today's "half the side" on average, but one regiment at a time,
so the line wears thin instead of snapping.

### 2. Frontage and reserves

| Ground | Regiments on the line per side |
|---|---|
| Plains, desert | 6 |
| Forest, hills | 4 |
| Mountains | 3 |
| City (defender's tile) | 4, +1 per wall level |
| Each extra tile the attackers come from (joint battles) | +2 for the attackers only |

- Regiments fill the line in the order of their army: the attacking army's chosen
  regiments first, then joining armies. A player can therefore choose the front line by
  splitting the army.
- Regiments not on the line are **in reserve**. They fight in no rounds and take no blows,
  but the volleys reach them (archers shoot over the line). When a regiment leaves the
  line, the next one in reserve takes its place in the following round.
- Archers in reserve still shoot in the volleys. That makes it worth keeping archers behind
  a line of spearmen, a choice the player can see and make.

### 3. Small terrain rules (cheap, independent)

| Rule | Starting number |
|---|---|
| Attacking across a sea crossing (the reference's river crossing) | Attacker deals ×0.75 |
| Dug in: an army that didn't move on its last turn | +5% defense a turn, up to +15%; lost when it moves |

Walls stay as they are (+15/30/50% defense, which works like the reference's fort penalty).

### 4. Later, if wanted

- *Hold* and *push* instead of one armor (spearmen hold, cavalry push).
- A general's trait that raises morale or speeds up recovery ([generals.md](generals.md)).

## How it would be built

1. **`src/data/combat.ts`**: morale damage, recovery, the leave-the-line threshold,
   frontage by terrain (or a `frontage` field on each terrain in `src/data/terrain.ts`), the
   flanking bonus, the crossing penalty and dig-in. Every number lives here.
2. **State**:
   - `Regiment` gets `morale: number`, and an army gets `stillTurns: number` for digging in.
   - Both are set at setup and at training (`core/setup.ts`, `systems/recruitment.ts`).
   - Merging (`systems/armies.ts`) averages morale by soldiers, as experience already is.
3. **`resolveBattle`**:
   - Each `Kind` gets a morale pool.
   - A side's kinds are split into *line* and *reserve* by frontage (`battlefieldAt` returns
     the frontage).
   - `breaksAt` becomes "no regiment left on the line or in reserve".
   - Survivors come back with their morale. `Troops` gets `morale?`, where no value means
     full, so the existing combat tests keep working.
4. **Turn**: recovery and the dig-in counter go in the start-of-turn step (`systems/turn.ts`,
   next to the movement refill in `systems/armies.ts`).
5. **Flanking**: `battleSides` already knows each joining army's tile; count the distinct
   attacker tiles.
6. **The AI**:
   - `battleStrength` fights the battle once with no luck, so morale and frontage come for
     free.
   - In `ai/ai.ts`, the AI rests armies below 40 morale before attacking, retreats them to a
     city to recover, and prefers targets that fled last turn.
7. **UI**:
   - A morale bar under each regiment's strength bar (bottom bar).
   - The battle panel shows each side's line and reserve, and lists the frontage and
     flanking bonus with the defender's bonuses.
   - Detail goes in `title` tooltips.
8. **Tests**:
   - `tests/combat.test.ts`: the triangle still holds regiment against regiment (frontage
     can't bind with one regiment); a 10-stack in mountains fights 3 at a time; reserves
     step in.
   - `tests/invariants.ts`: morale stays within 0–100.
   - `tests/flight.test.ts`: fleeing armies arrive with 10 morale.

## Consequences and risks

- **This is the biggest change to combat since rounds replaced the single roll.**
  `battleStrength`, the preview, experience and fleeing all touch it. That's why it's split
  into steps: morale first, then frontage, then the terrain rules, each measured on its own.
- **Snowballing could get worse:** a winner keeps fighting at low cost while the loser can't
  recover. Recovery numbers are the main lever, and the AI resting armies is the other.
- **Chases (35% of battles) get even more one-sided,** because fled armies have 10 morale.
  That's arguably right, since they already lose, but battle counts could rise if
  remnants keep being caught. Scattering below a tenth of a regiment (DECISIONS) still
  ends them.
- **Garrisons:** a city's frontage of 4 + walls means a big garrison holds out longer
  (reserves keep stepping in), so storming gets harder. Check cities taken; the siege
  tuning (storming should be the main way to take a city) must still hold.
- **Experience:** morale resistance per level makes veterans worth more. Check that level 6
  stays rare.
- **The preview's 200 battles** cost more per battle (more state per kind). It's a small
  loop, but measure the AI's ms per action.

## How we'll know it works

- `npm run build` is clean, and `npm test` passes: no invalid AI action, no AI debt, the new
  invariants hold, and determinism and the JSON round trip still pass.
- `npm run compare -- --base master --seeds 8`, with and without `--garrison`, after each
  step. Add these rows to `tools/compare.ts`:
  - median morale of field armies
  - battles where reserves joined
  - battles won by the smaller side

**Targets:**

- Cities not with their first owner and factions fallen within ±20% of the baseline.
- Battles won by the smaller side measurably up (the new compare row gives the baseline;
  today AI attackers lose only 9% of battles): fresh, flanking or well-placed armies
  sometimes beat bigger ones.
- Fewer than 30% of battles are chases.
- AI ms per action no more than 25% higher.

Playing checks:

- A 10-regiment stack attacking into mountains fights 3 at a time and visibly brings up
  reserves.
- An army that just fled can be finished off cheaply, but after 3 turns in a city it's back
  to full.

## Open questions for review

- Should morale carry over between turns (recommended), or reset every battle?
- Are the frontage numbers right (6 / 4 / 3, city 4 + walls), and should flanking give +2 per
  extra tile?
- Should archers in reserve still shoot (recommended), or only those on the line?
- Is the sea-crossing penalty wanted, given that sea crossings are also the only way into
  Sicily, Africa and Britain?
- Build it in steps (morale, then frontage, then terrain), or in one go?
