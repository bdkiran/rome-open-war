# Decision: battles — morale, frontage and how armies are set up to fight

- **Status:** Proposed. Not implemented yet.
- **Decides:** how battles get deeper while staying auto-resolved: morale separate from
  soldiers, frontage by terrain with reserves, and a few layers of setup (formation,
  doctrine, standing orders) that decide which tactics an army uses.
- **Replaces:** the *battle stances* and *morale and frontage* proposals, now merged.
  Stances survive as the tactics (section 5), and their measured findings are kept below.
- **Where it goes once agreed:** new entries under Combat in `docs/DECISIONS.md` with the
  measured numbers, and the Battles section of `README.md`.
- **Related:** [Generals](generals.md) (a general's traits feed the choice of tactics),
  [Culture traits](culture-traits.md) (a culture's default doctrine). Supply and
  attrition was rejected (`docs/DECISIONS.md`, Movement), so nothing here depends on supply.

## Context

The player wants more interesting battles, **without a battle map**: battles stay
simulated (`resolveBattle` in `systems/combat.ts`), with a preview and a result. The
reference is a frontline model of land combat from another strategy game. There, the depth
comes less from a choice per battle than from **how armies are set up before they fight**:

- what a unit is made of, and how it's placed in the line
- a long-term doctrine
- the commander
- standing orders

Tactics are then picked automatically during the battle, and they counter each other. Two
more ideas come from the same model:

- **Two bars:** will to fight (morale) is separate from men. Running out of morale means
  retreat; running out of men means destruction.
- **Limited frontage:** the ground decides how many units fight at once. The rest wait in
  reserve, and attacking from more sides widens the front.

Today:

- A side breaks when it has lost half its soldiers, so morale *is* casualties.
- Every regiment in a stack fights from the first round.
- A beaten army fights as well as ever the next turn.
- Once you click Fight, nothing you did beforehand changes how the battle is fought, apart
  from which regiments you sent.

## Choices already made

| Question | Chosen |
|---|---|
| Battle map? | **No.** Battles stay simulated, with the preview and the result screen. |
| Per-battle stances? | **Folded in.** The three stances become tactic families, and your setup decides which ones are used. No click before each battle. |
| Supply, air | Out (supply was rejected; there's no air). |

## Baseline (current code, seed 1, 100 turns, passive Rome)

| Measure | Value |
|---|---|
| Battles | 396; 35% chases of fled remnants; 22% close (within 1.5 to 1); 19% end during the volleys |
| AI attacker won | 91% (it attacks at 1.2 times the defender's strength) |
| Median rounds | 5 overall, 6 excluding chases |
| Field armies, regiments each (counted every round) | 1: 408, 2: 132, 3: 213, 4: 26, 5: 27, 6: 7 |
| Garrisons, regiments each | 1: 77, 2: 2,466, 3: 1,655, 4: 1,114, 5: 143, 6+: 31 |
| Ground under field armies | plains 354, hills 240, forest 147, mountains 62, desert 10 |
| AI armies | about 45% militia, 25% spearmen, 25% archers, 5% cavalry |

What this tells us:

- AI armies are small, so frontage mostly binds joint battles, big garrisons in rough ground,
  and the player's large stacks. That's intended: a 10-regiment stack shouldn't win just by
  being big.
- Archers are common and a fifth of battles end in the volleys, so tactics for the opening
  phase matter.
- The AI wins nearly every battle it picks. Morale that carries over adds "how fresh is that
  army?" to "how big is it?".

## Choices to make

| Question | Options | Recommended |
|---|---|---|
| Morale | Break at half the soldiers, as now. Morale inside a battle only. **Morale that carries over** and recovers with rest. | **Carries over.** It makes pursuit, rest and worn armies matter. One number per regiment. |
| When a side loses | When its average morale hits 0. When **no regiment is left** on the line or in reserve. | **No regiment left.** Regiments drop out one by one and reserves step in. |
| Frontage | None. **A hard cap per tile.** A soft cap with a penalty. | **A hard cap.** It reads plainly ("hills: 4 on the line"). |
| Reserves joining | A dice roll each round. **As soon as a place frees up**, in order. | **In order.** Luck is already ±90% a round. |
| How tactics are picked | Dice each phase. Chosen by the player before each battle (stances). **Worked out from your setup**, with no dice. | **From your setup.** Nothing is hidden: the preview names the tactics each side will likely use, so you plan around them. |
| Doctrine | None. Per army. **Per faction,** changed rarely. | **Per faction.** A lasting identity, and one choice instead of one per army. |
| Formation | Automatic only. **Automatic by default, with the player able to override it** per army. | **Automatic, can be overridden.** The AI uses the automatic one. |
| Separate attack and defense block stats | Yes. **Not yet.** | **Not yet.** It would disturb the unit triangle (DECISIONS, Combat). |
| Battles over several turns | **No, one go.** Yes. | **One go.** Morale that carries over gives the "long fight" feel. |

## Proposal

These are starting numbers, to be tuned. With every new layer left at its default, steps 1
and 2 should come close to today's results, so each step can be measured on its own.

### 1. Morale

| Rule | Starting number |
|---|---|
| Morale per regiment | 0–100, stored on `Regiment` |
| Morale damage | 3 morale per 1% of the regiment's soldiers lost, on top of the soldiers |
| Leaves the line | At 0 morale. It takes no more blows and waits behind the line |
| A side loses | When no regiment is left on the line and none in reserve can step in |
| Losers | Flee as today, and arrive with 10 morale |
| Recovery, start of the owner's turn | +20 in the field, +35 in own city, +10 while besieged |
| Better troops | Morale damage ÷ the tier's multiplier (1 / 1.3 / 1.6), and −5% per experience level |

At full morale a regiment leaves the line after losing about a third of its soldiers.
That's close to today's average, but one regiment at a time.

### 2. Frontage, reserves and flanking

| Ground | Regiments on the line per side |
|---|---|
| Plains, desert | 6 |
| Forest, hills | 4 |
| Mountains | 3 |
| City (defender) | 4, +1 per wall level |
| Each extra tile the attackers come from (joint battles) | +2 for the attackers |

- Regiments not on the line are in reserve. They take no melee blows and step in, in
  formation order, when a place frees up.
- Archers in reserve still shoot in the volleys, over the line.

### 3. Formation (per army)

- Each regiment in an army is marked **Line** or **Reserve**.
- **Automatic** (the default, and what the AI uses): melee regiments in the line,
  strongest first, and archers in reserve.
- The player can override it on the Army card (click a regiment's line/reserve marker).
  It's stored on the army and kept through merges and splits.
- If frontage is bigger than the Line regiments, Reserve regiments fill the gap. Formation
  sets the order, not who's allowed to fight.

### 4. Doctrine (per faction)

| Doctrine | Passive | Tactics it favours | Default for |
|---|---|---|---|
| **Shock** | First melee round ×1.1 | Close fast, Charge, Press | Celtic |
| **Line** | Morale damage taken ×0.9 | Spear wall, Hold | Roman, Hellenistic, Punic |
| **Skirmish** | Volleys ×1.1 | Skirmish, Give ground | Thracian |

- Each faction starts with its culture's doctrine.
- Changing it costs 300 gold and 10 turns during which there is no doctrine.

### 5. Tactics: the stances, picked per phase

A battle has three phases. In each, both sides get a tactic, **worked out from their setup
without dice**. Each tactic counters another, as the stances did.

| Phase | Tactic | Effect | Countered by |
|---|---|---|---|
| Opening (volleys) | **Skirmish** | 3 volleys instead of 2 | Close fast |
| | **Close fast** | the second volley counts ×0.75 for both sides | — |
| First clash | **Charge / Shock** | ×1.5 damage in the first melee round | Spear wall |
| | **Spear wall** | cancels the enemy's shock | — |
| Melee | **Press** | deals ×1.15, takes ×1.25, more morale damage both ways | Hold |
| | **Hold** | as today | — |
| | **Give ground** | deals and takes ×0.85; if beaten, rout losses ×0.5 | Press |

How a side's tactic for a phase is picked, in order, first match wins:

1. Its **standing order** (section 6) rules out some tactics.
2. Its **general's** trait, if there is one (generals proposal): an aggressive general
   picks the offensive option.
3. **Composition**: 35% or more archers and more than the enemy picks Skirmish. Cavalry on
   open ground picks Charge. 25% or more spearmen picks Spear wall.
4. Its **doctrine's** favourite.
5. Otherwise Hold, or two volleys.

The preview shows the result ("Opening: their Skirmish. Clash: your Charge against their
Spear wall"), so you can change your setup before attacking: split off the archers, choose
other ground, or wait for a general.

### 6. Standing orders (per army)

| Order | Effect |
|---|---|
| **Hold** (default) | Digs in: +5% defense for each turn it doesn't move, up to +15%. No Press or Close fast. |
| **Advance** | No digging in. No Give ground. |

### 7. Small terrain rule

- Attacking across a sea crossing: the attacker deals ×0.75.
- Walls are unchanged; they already act like forts.

## Findings kept from the battle stances work

These were measured under today's rule that a side breaks at half its soldiers. They must
be measured again once morale is in.

- **Moving the break point dominates.** A stance with a 0.55 break point won 58–67% against
  every other stance, so morale rules must be watched for the same thing.
- **Skipping a whole volley broke the unit triangle.** A lone spearmen or militia regiment
  then beat archers. At ×0.75 for the second volley the triangle held in every matchup.
- **Counters (2,000 battles with luck, open ground):**
  - Steady beat Aggressive (61% against 36%).
  - Aggressive beat Skirmish against an archer-heavy army (55% against 12%).
  - Skirmish beat Steady when it had the archers (89% against 55%).
  - Even mixed armies came out at 41–57% in every pairing.
- **Pure melee wars got no new choice from stances.** Frontage and formation give them one.

## How it would be built, in steps

Each step is merged and measured on its own.

1. **Morale.**
   - `Regiment.morale` is set at setup and when a regiment is trained. Merging averages
     it by soldiers.
   - `resolveBattle` pools morale per `Kind`, and a side loses when no regiment is left.
   - Recovery runs in the start-of-turn step (`systems/turn.ts`, `systems/armies.ts`).
   - `Troops.morale?` defaults to full, so existing combat tests keep working.
2. **Frontage, reserves, formation, flanking.**
   - `battlefieldAt` returns the frontage, and the numbers live in `data/terrain.ts`.
   - `Regiment.reserve?: boolean` marks the formation.
   - `battleSides` counts distinct attacker tiles for flanking.
   - UI: a line/reserve marker on each regiment card, and line and reserve shown in the
     battle panel.
3. **Tactics, doctrine, standing orders.**
   - `TACTICS` and `DOCTRINES` go in `data/combat.ts`.
   - `Faction.doctrine`, and `Army.order` set to Hold or Advance.
   - New actions `setDoctrine` and `setOrder`.
   - A pure `pickTactics(side, enemy, field)` is used by `resolveBattle`, `estimateBattle`
     and `battleStrength`, so the preview and the AI see the same tactics.
   - The AI keeps its culture's doctrine and sets orders by the archer rule from the stances
     work. It's issued only when the order would change, so it can't loop.
4. **The terrain rule:** the sea-crossing penalty.

Throughout:

- All numbers go in `src/data/`.
- `tests/invariants.ts` gains checks that morale is within 0–100 and that orders and
  doctrines are valid.
- `tests/combat.test.ts` checks that the triangle holds regiment against regiment in every
  tactic pairing.

## Consequences and risks

- **This is the largest change to combat since rounds**, which is why it's built in steps.
- **Snowballing:** winners keep fighting while losers recover slowly. Recovery is the lever,
  and the AI should rest armies below 40 morale.
- **Storming gets harder:** a city's frontage plus reserves lets a garrison hold out longer.
  Storming should stay the main way to take a city (DECISIONS, Sieges), so watch cities
  taken.
- **Chases get more one-sided,** since fled armies have 10 morale.
- **Reading the battle:** automatic tactics must be shown plainly, in the preview, the
  result and tooltips, or they'll feel like hidden luck.
- **Cost:** `pickTactics` is cheap, but the preview's 200 battles carry more state. Measure
  the AI's time per action.

## How we'll know it works

- `npm run build` clean, and `npm test` passes after each step.
- `npm run compare -- --base master --seeds 8`, with and without `--garrison`, after each
  step. Add these rows to `tools/compare.ts`:
  - median field-army morale
  - battles with reserves
  - battles won by the smaller side
  - how often each tactic is used

**Targets:**

- Cities not with their first owner and factions fallen stay within ±20% of the baseline.
- The smaller side wins measurably more often.
- Fewer than 30% of battles are chases.
- Each tactic is used in at least 10% of the battles where it's possible, and none in more
  than 70%.
- AI time per action no more than 25% higher.

Playing checks:

- A 10-stack in mountains fights 3 at a time.
- An army that just fled is cheap to finish off, but after 3 turns in a city it's back to
  full.
- The preview names each side's tactics, and changing the formation changes them.

## Open questions for review

- Are three doctrines enough, and should they come from culture by default (as proposed)?
- How hard should changing doctrine be (300 gold and 10 turns without one)?
- Is the formation override worth its UI space, or should formation be automatic only?
- Frontage 6 / 4 / 3 and a city at 4 + walls: are these right?
- Is the sea-crossing penalty wanted? Sea crossings are the only way into Sicily, Africa
  and Britain.
