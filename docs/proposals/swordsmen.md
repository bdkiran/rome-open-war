# Decision: swordsmen, a fourth line unit, and the matchup cycle

- **Status:** Proposed. Not implemented yet.
- **Decides:** a swordsman (heavy infantry) unit: what it beats and loses to, the
  per-matchup bonuses and shields it needs to fit, and the building that trains it.
- **Where it goes once agreed:** the Combat and Units entries in `docs/DECISIONS.md`, and
  the Units table in `README.md`.
- **Related:** [Battles](battles.md) (frontage and reserves would change how a four-unit
  army fights), [Culture traits](culture-traits.md) (a culture's unit edge could be its
  swordsmen).

## Context

There are three trained units today, plus militia and a general's bodyguard (see
`src/data/units.ts`). They're built so that spearmen beat cavalry, archers beat spearmen
and cavalry beat archers. A swordsman line should add a fourth corner without breaking
that.

### Measured now

One regiment against one, on open ground, at basic tier. Each figure is the chance the
row beats the column, averaged over attacking and defending (600 battles each way):

| | Militia | Spearmen | Archers | Cavalry |
|---|---|---|---|---|
| **Militia** | — | 5% | 27% | 58% |
| **Spearmen** | 95% | — | 20% | 100% |
| **Archers** | 73% | 80% | — | 14% |
| **Cavalry** | 42% | 0% | 86% | — |

### Why stats alone can't do it

Swordsmen should beat spearmen and lose to cavalry, as in the classic triangle. Spearmen
already beat cavalry, and cavalry beats archers. I swept swordsman stats over these
ranges:

- regiment size 120–180;
- attack 20–50;
- armor 15–50;
- with or without a bonus against spearmen.

Two results:

- **Without a bonus, no stats fit.** Both matchups come down to attack × armor against
  the other unit's, and spearmen's 30/30 with 180 men asks for more than cavalry's 60/20
  with 120 men allows. Swordsmen strong enough to beat spearmen also beat cavalry (45/45
  wins about 100%).
- **With only a bonus against spearmen, swordsmen that lose to cavalry are weak at
  everything else.** They beat spearmen 70–90%, but they lose to militia (beating them
  only 2–18% of the time). They'd be a one-matchup unit, not a line.

So cavalry needs its own edge against swordsmen, as spearmen have theirs against
cavalry. Two ways to give it, measured with swordsmen at 140 soldiers, attack 35, armor
30 and +30 against spearmen:

| Cavalry's edge against swordsmen | Swordsmen beat cavalry (open ground) | (rough ground, no charge) |
|---|---|---|
| None | 65% | 72% |
| +60 charge (first melee round only) | 52% | 72% |
| +120 charge | 48% | 72% |
| **+30 attack, every round** | **24%** | **26%** |
| +40 attack, every round | 16% | 19% |

The charge is a single round, so it barely moves the result and does nothing off open
ground. An attack bonus in every round is what makes cavalry the counter.

**Arrows.** Arrows ignore armor, so archers would shred swordsmen (swordsmen win 8%).
Swordsmen carry big shields, so arrows against them could be halved. With that,
swordsmen and archers are about even (49%).

## Choices

| # | Question | Options | Recommended |
|---|---|---|---|
| 1 | The cycle | Swords beat spears, spears beat cavalry, cavalry beats swords and archers. Archers beat spears and militia. | **This one.** It's the classic triangle with archers alongside. |
| 2 | How the bonuses are written | **a)** A `bonusAgainst: Partial<Record<UnitType, number>>` on each unit, added to attack in melee: swordsmen `{ spearmen: 30 }`, cavalry `{ swordsmen: 30 }`. Spearmen keep `antiCavalry` (it also covers bodyguards). **b)** Named stats: `antiSpear` on swordsmen, `antiFoot` on cavalry. | **a)**: two new bonuses would make three named specials, and one field holds them all. Tooltips read "+30 against spearmen". It's flat attack, not the old ×1.5 table, so it fits the stats model (DECISIONS, Combat). |
| 3 | Shields against arrows | **a)** Swordsmen take half from arrows (`arrowsTaken: 0.5`). **b)** No shield: archers counter swordsmen too. | **a)**: archers keep their job (spearmen and militia) and don't get a second counter. Swordsmen and archers stay about even. |
| 4 | Who trains them | **a)** A new building, the *barracks* (levels 1–3 = tiers). **b)** The spear yard trains both. | **a)**: same rule as the other three, and a real choice of what to build. It also needs a slot in the build AI. |
| 5 | Cost | Gold per soldier and upkeep | Same as archers (1.35 gold, about 0.02 upkeep a soldier): a regiment of 140 costs 189 gold. |
| 6 | Starting armies | Do some factions start with swordsmen? | **No**: they come once a barracks is built. Starting armies are already balanced (DECISIONS). |
| 7 | Look | The figure kit | A short sword and a large shield on the existing infantry figure, per culture kit (`data/cultures.ts`). |

## Proposed stats

The swordsman stat is 140 soldiers, attack 35, armor 30, +30 against spearmen, with
shields halving arrows. Cavalry's edge against swordsmen is the lever, and the figures
show the chance swordsmen win:

| Cavalry +X against swordsmen | vs Spearmen | vs Archers | vs Cavalry | vs Militia |
|---|---|---|---|---|
| Light: +20 | 82% | 49% | 33% | 58% |
| **Proposed: +30** | **82%** | **49%** | **24%** | **58%** |
| Strong: +40 | 82% | 49% | 16% | 58% |

Against the units as they are today:

- **Cavalry is stronger:** it beats swordsmen and archers, and loses only to spearmen
  (and is about even with militia).
- **Spearmen are weaker:** they lose to archers and to swordsmen. The AI will build
  fewer of them, and the variant runs should check that each unit keeps a share.

Other units' matchups don't change: the bonuses only apply between these unit types.

## How it would be built

- **Data:**
  - `UnitType` gains `"swordsmen"`, with `UNITS.swordsmen`;
  - `bonusAgainst` and `arrowsTaken` go on `UnitDef` and `UnitStats` (empty / 1 for the
    others; tiers multiply the bonus like any stat);
  - `src/data/buildings.ts` gains the barracks;
  - the recruitment and mercenary supply tables get a swordsmen entry
    (`data/mercenaries` — should some regions hire them?).
- **Combat:** `blow` in `systems/combat.ts` adds `bonusAgainst[target unit]` in melee
  and multiplies arrows by the target's `arrowsTaken`. A `Kind` then needs its unit type,
  not only its stats. `battleStrength` and the preview pick it up automatically.
- **AI:**
  - `counterToNearestEnemy` learns the loop: answer spearmen with swordsmen, and
    swordsmen with cavalry;
  - build priorities get a barracks.
- **Render and UI:**
  - the swordsman figure in `models/` (via `npm run army-model`) and the SVG unit art in
    `render/figures.ts`;
  - recruit and stats panels, which read `UNITS`, so mostly automatic.
- **Tests:**
  - combat tests for the four matchups;
  - `tests/map.test.ts` still passes;
  - `balance.test.ts` should get a check that no unit dominates. The AI's unit mix,
    measured per game, should stay mixed.

## How we'd measure it

- The matchup table above, re-run after the change, for each variant.
- `npm run compare -- --base master --seeds 8 --garrison`, light, proposed and strong
  side by side. Check:
  - the AI's regiments by unit (none above about 40%);
  - battles;
  - factions fallen;
  - AI income and upkeep.
- The player's view: what a balanced 10-regiment army looks like now, and whether one
  composition wins regardless of the enemy's.
