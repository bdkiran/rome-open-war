# Decision: battle stances

- **Status:** Proposed. Not implemented yet.
- **Decides:** whether each side picks a stance before a battle, what the stances change in
  the round-based combat, and who picks the defender's.
- **Where it goes once agreed:** a new entry under Combat in `docs/DECISIONS.md` with the
  measured numbers, and `README.md` (Battles) gets the rules.

## Context

A battle is decided entirely by the two armies and the ground (`systems/combat.ts`). Once
you click Fight, there's nothing left to decide, so the battle panel is a yes/no on odds the
player can't influence. A stance is one small choice per battle that changes how the rounds
play out: volleys, the first clash, the melee and the rout. It should reward reading the
enemy's army (especially its archers), not offer a free bonus. It must keep working with the
odds preview (`estimateBattle`, 200 battles), the AI's `battleStrength` and joint battles
(`battleSides`).

## Choices to make

| Question | Options | Recommended |
|---|---|---|
| Who picks the defender's stance | (a) A **standing order** on each army, set by its owner on their own turn and visible to anyone who sees the army. (b) The defender automatically answers with its best counter. (c) Defenders are always Steady. | **(a), default Steady.** The player gets a choice on defense without being asked anything during AI turns. The preview stays exact, because the stance is known. Secrecy comes from fog, as it does for the regiments. (b) cancels most of the attacker's choice and takes the defender's away. (c) makes the attacker's choice a free counter. |
| What a stance changes | (a) The break point (holding longer or giving way sooner). (b) Volleys, the first melee round, the melee trade and rout losses. | **(b).** The break point was measured and rejected: see below. |
| Joint battles | One stance per side. Each army uses its own. | **One per side**: the attacker's chosen stance, and the attacked army's standing order for every defender. Per-army stances would split `kindsOf` pools for little gain. |
| An attack's stance | Changes the army's standing order. Applies to this battle only. | **This battle only.** Attacking aggressively shouldn't leave the army defending aggressively. |
| How many stances | Two. Three. | **Three**, so each one counters another. |

Rejected after measuring (no-luck and 2,000-battle tests, 4-regiment mixed armies):

- **A break-point stance doesn't work.** Steady with a 0.55 break point won 58–67% as
  attacker against every other stance. Skirmish breaking at 0.4 won only 7–14%. A few
  points of break point outweigh everything else, so one stance dominated.
- **Aggressive skipping a whole volley** broke the unit triangle (DECISIONS, Combat): a lone
  spearmen or militia regiment then beat archers. Halving the second volley also let
  militia beat archers. At ×0.75 the triangle holds in every matchup, attacking or
  defending, on open or rough ground.

## Baseline (current code, seed 1, 100 turns, passive Rome)

| Measure | Value |
|---|---|
| Battles (attack actions 414) | 396 |
| Chases (smaller side under 25% of the bigger) | 138 (35%) |
| Close fights (within 1.5 to 1) | 89 (22%) |
| Attacker won (the AI attacks at 1.2 times the defender's strength) | 359 (91%) |
| Ended during the volleys (2 rounds or fewer) | 75 (19%) |
| Median rounds, all battles and non-chases | 5 and 6 |
| Non-chases where the loser fought to the death | 62 of 258 |
| Defender had +10% or more | 203 (51%) |
| AI armies (DECISIONS, Experience; culture-traits baseline) | ~45% militia, 25% spearmen, 25% archers, 5% cavalry |

What this tells us: archers are common, and a fifth of battles end in the volleys. So
anything that changes the volleys matters a lot. A third of battles are chases, where no
stance should change much. The AI only attacks at good odds, so a stance mostly changes the
*cost* of AI wins. It rarely turns a loss into a win.

## Proposal

These are starting numbers, to be tuned. **Steady is today's rules, unchanged.**

| Stance | Volleys | First melee round | Later melee rounds | If beaten |
|---|---|---|---|---|
| **Aggressive**: close fast | the second volley counts ×0.75 for both sides | deals ×1.5 (shock), **unless the enemy is Steady** | deals ×1.15, takes ×1.25 | as now |
| **Steady**: hold the line (default) | 2, as now | as now, and blunts the enemy's shock | as now | as now |
| **Skirmish**: keep your distance | 3 volleys, unless the enemy is Aggressive | as now | deals ×0.85, takes ×0.85 | rout losses and cavalry pursuit ×0.5 |

Volleys: if either side is Aggressive, there are 2 volleys and the second counts ×0.75.
Otherwise, if either side is Skirmish, there are 3. Otherwise 2. The extra volley helps
both sides' archers: it's an archers' race. Multipliers act on losses dealt, like the
defense bonus. Break point (0.5), luck and the defense bonus are untouched.

**Each stance wins somewhere** (win % for the attacker, 2,000 battles with luck, open
ground. Attacker's loss when it wins is in brackets):

| Situation | Result | So |
|---|---|---|
| Even melee armies (3 militia, 1 spearmen each) | Aggressive into Steady 36%; Steady into Aggressive 61%; Steady into Steady 49% | **Steady beats Aggressive** |
| Melee army attacks an archer-heavy one (2 militia, 2 archers) | Steady into Skirmish 12%; Aggressive into Skirmish 55% | **Aggressive beats Skirmish** |
| Archer-heavy army attacks a melee one | Steady into Steady 55% (26%); Skirmish into Steady 89% (14%) | **Skirmish beats Steady**, if you have the archers |
| Even mixed armies (2 militia, 1 spearmen, 1 archers) | every pairing 41–57% | nothing dominates when the armies match |
| 5 regiments storm 3 at +40% (no garrison archers) | Steady into Steady 91%; Aggressive into Steady 82%; Steady into an Aggressive garrison 93% | storms against melee garrisons: Steady on both sides |
| 4 regiments attack 6 | 0–1% in every pairing | a stance never saves a lost cause |
| Beaten by a cavalry-heavy army | lose 62% of the army; 56% under Skirmish | Skirmish makes a defeat cheaper |

## How it would be built

1. **`src/data/combat.ts`**: `STANCES: Record<Stance, StanceRules>` (shock, meleeDealt,
   meleeTaken, volley rule, routLoss) next to `COMBAT`. `Stance` is a string union in
   `core/state.ts`.
2. **State**: `Army.stance: Stance`, "steady" at setup.
   - `placeNewArmy` takes the stance, so `relocate` (splitting) and `placeRegiments`
     (flight) pass on the army's own. Joining a host keeps the host's.
   - `BattleReport` gets `attackerStance` and `defenderStance`.
   - New invariant in `tests/invariants.ts`: every army's stance is valid.
3. **Actions** (`core/actions.ts`): a new `{ type: "setStance"; armyId; stance }`, free,
   refused if it isn't yours or nothing changes. `attack` gains an optional `stance`, and the
   army's own order is used if it's left out.
4. **Combat** (`systems/combat.ts`):
   - `resolveBattle(…, stances = { attacker: "steady", defender: "steady" })`. The volley
     count becomes a per-battle value passed to `blow`/`dealt` in place of `COMBAT.volleys`.
     The multipliers go in the round loop where `edge` is applied.
   - `routLosses` takes the loser's stance.
   - `estimateBattle` and `battleStrength` pass the stances through. `attack()` reads them;
     `previewBattle` reads the defender's standing order.
   - `sideStrength` (what to train) stays stance-free.
5. **AI** (`ai/ai.ts`, numbers in `data/ai.ts`):
   - `attackAction` tries each stance in `battleStrength` (three calm battles instead of
     one), takes the best ratio (Steady on a tie) and puts it in the action.
   - A new `stanceAction` after `mergeAction` sets standing orders by a simple rule:
     - Skirmish if at least 35% of the army is archers and it has a bigger archer share
       than the nearest visible enemy.
     - Aggressive if that enemy is 30%+ archers and we're under 15%.
     - Otherwise Steady.
     - It's issued only when the order would change, so it can't loop.
   - `retreatAction` uses both armies' standing orders.
6. **UI**:
   - Battle panel (`ui/battlePanel.ts`): three stance buttons, each with its win %
     (3 × 200 battles, about 15 ms). The defender's order goes in their notes.
   - Army card (`ui/selectionBar.ts`): a three-way standing-order toggle, with title
     tooltips.
   - `ui/battleResult.ts`: both stances.
   - `main.ts` builds the attack and storm actions with the chosen stance.
7. **Tests**: every existing `tests/combat.test.ts` result stays exact under Steady and
   Steady. New tests check each "so" row above and that the triangle holds for every stance
   pair. `tests/flight.test.ts` checks Skirmish's rout.

## Consequences and risks

- **Attackers counter what they see.** A visible standing order can be countered, so
  defending in anything but Steady is a gamble. That's intended: Steady is the safe
  default, and the others are bets on the enemy's mix. Watch cities taken: the
  attacker's edge may rise.
- **In pure melee, Steady is at least as good as the others.** Skirmish ties it and
  Aggressive loses. Stances matter when archers are present. With 25% of AI regiments
  archers that's common, but a militia-and-spearmen war gets no new choice.
- **Conflict with DECISIONS, Combat ("stats fitted to the old matchups")**: Aggressive
  softens arrows, which is what makes archers beat spearmen. At ×0.75 the regiment triangle
  still holds (checked without luck). Archer-heavy armies lose some of their edge against
  an Aggressive enemy, which is the point.
- **The AI's 1.2 margin now includes its best stance**, so it may attack a little more
  often. Its defensive rule is visible and the player can exploit it. That's acceptable,
  and it's a follow-up if it's too easy.
- **Cost**: the AI's calm battles triple per attack option. DECISIONS notes AI time is
  mostly pathfinding, so `npm test` should change little. Measure it.
- Save/load: one more string per army.

## How we'll know it works

- `npm run build` clean, and `npm test` passes: no invalid `setStance` or `attack`, and the
  invariant holds.
- `npm run compare -- --base master --seeds 8`, with and without `--garrison`. **Target:**
  median cities taken, factions fallen, battles and regiments alive each within about 15%
  of the baseline.
- A new stance-usage row in `tools/compare.ts`: in AI battles that aren't chases, each
  stance is used in at least 10% of them, and none in more than 70%.
- Browser check: the three stance odds on the battle panel, the army-card toggle, and an
  enemy's standing order shown when it's in sight.

## Open questions for review

- Are three stances and these names right?
- Should the standing order be hidden from enemies, with the preview averaging over the
  three? That's more guessing, but a less honest preview.
- Is Skirmish's cheaper defeat (rout ×0.5) enough, or should it also flee one tile
  further?
- Should a garrison defending its walls be allowed Skirmish? It can't flee, so only the
  extra volley helps.
