<!-- Status: proposal, not yet implemented. Numbers are starting points to tune. -->

# Culture traits

## Context

Culture is only a look right now (`src/data/cultures.ts`: "no effect on the rules").
You chose culture traits as the first way to add depth: each culture gets **one unit
edge, one economic edge and one small drawback**. Traits follow the **owner**: Rome
trains Roman troops everywhere, including in a captured Gallic city.

## Baseline (current code, 4 seeds, 100 turns, passive Rome)

| Culture | Factions | Cities at start | Cities at turn 100 (seeds 1–4) | Median |
|---|---|---|---|---|
| Roman | Rome | 7 | 2, 0, 2, 2 (Rome doesn't play in sims) | 2 |
| Hellenistic | Macedon, Greeks, Seleucids, Egypt, Pontus | 17 | 23, 16, 17, 15 | 16.5 |
| Punic | Carthage, Numidia | 7 | 10, 11, 14, 12 | 11.5 |
| Celtic | Gauls, Germania, Spain, Britannia | 16 | 16, 19, 14, 16 | 16 |
| Thracian | Thrace, Dacia, Scythia | 8 | 4, 9, 8, 10 | 8.5 |

AI armies at turn 100 are about 45% militia, 25% spearmen, 25% archers and 5% cavalry,
and almost everything is basic tier. So a trait on militia, spearmen or archers matters a
lot. A trait on cavalry matters little unless it makes the AI train more of them.
Punic factions already do best (+65% cities), so their traits get a real drawback.

## Proposed traits (starting numbers, to be tuned against the measurements)

| Culture | Unit edge | Economic edge | Drawback |
|---|---|---|---|
| **Roman**: legions | Spearmen +1 armor (3→4) | Roads and Walls cost −25% | Cavalry +25% gold and upkeep |
| **Hellenistic**: Cretan bows | Archers +1 ranged (6→7) | Market costs −25% | Militia −0.5 attack (2→1.5) |
| **Punic**: Numidian horse | Cavalry −25% gold and upkeep | Port gold +50% | Spearmen +20% gold and upkeep |
| **Celtic**: warbands | Militia +0.5 attack (2→2.5) and +2 charge on open ground | Farms cost −25% | Archers +25% gold and upkeep |
| **Thracian**: horse archers | Cavalry gain 2 ranged (they fire in the volleys) | Mine gold +50% | Walls cost +25% |

Stat edges are added to the unit's base stats **before** the tier multiplier, so an
elite regiment keeps the edge in proportion. No movement traits: cavalry movement was cut
from 18 to 16 on purpose (DECISIONS).

## Implementation

1. **`src/data/cultures.ts`**: add `CULTURE_TRAITS: Record<Culture, CultureTraits>` (name,
   a one-line summary, per-unit stat additions and cost multipliers, building cost
   multipliers, building gold multipliers). Rewrite the "purely a look" comment. All the
   numbers go here.
2. **The regiment remembers its culture**: add `culture: Culture` to `Regiment`
   (`core/state.ts`), stamped from the owner when the regiment is created (`core/setup.ts`,
   the training step in `systems/recruitment.ts`). Regiments never change owner, so this
   always matches the owner. It also means every battle function, which takes `Troops`
   (regiments pass straight through), gets culture without threading it through each call.
   - `Troops` gets `culture?: Culture`. Without it, no traits apply, so existing combat
     tests stay unchanged.
   - `unitStats(unit, tier, level, culture?)` (`data/units.ts`) adds the edge before the
     tier multiplier. `kindsOf` in `systems/combat.ts` keys its pools by culture too.
   - The AI's hypothetical troops (`trainAgainst` in `ai/assess.ts`) pass the city owner's
     culture, so the AI prefers its own strong units through the existing strength checks.
3. **Costs**:
   - `trainingCost`, `upkeepFor` and `regimentCost` (`systems/armies.ts`) and `retrainCost`
     (`systems/recruitment.ts`) take a culture.
   - Add a `buildingCost(state, factionId, building, level)` helper in
     `systems/buildings.ts`. It replaces direct reads of `def.cost` (canBuild, the build
     queue, the AI, the Construction tab).
   - Mine and port gold in `cityIncome` (`systems/cities.ts:262–264`) use the owner's
     multiplier, so the money breakdown shows it automatically.
4. **UI** (kept short):
   - The scoreboard faction row gets a `title` tooltip with the culture name and its three
     traits.
   - Recruitment and Construction cards already show costs, which become the adjusted ones.
   - Recruitment card tooltips name the edge, e.g. "Roman: +1 armor".
5. **Tests**:
   - `tests/invariants.ts`: every regiment's culture equals its owner's culture.
   - `tests/combat.test.ts`: each stat edge, measured as "fights like N basic soldiers"
     using the existing `soldiersToBeat` helper.
   - `tests/recruitment.test.ts` and `tests/buildings.test.ts`: the cost and gold multipliers.
6. **Measurement tooling**: add per-culture rows ("Cities held: Hellenistic", and so on)
   to `tools/compare.ts`. Its worker reads state field by field, and `faction.culture`
   already exists on master, so `--base master` still works.
7. **Docs**:
   - `README.md`: replace "This is only a look" with a Cultures table, and add a line in
     "Your opponents".
   - `docs/DECISIONS.md`: a Cultures entry with the before/after numbers.

## Verification

- `npm run build` clean, and `npm test` passes: no invalid AI action, no AI debt, the new
  invariant holds, and JSON round trip and determinism still pass.
- `npm run compare -- --base master --seeds 8`, with and without `--garrison`: median AI
  income, cities changing hands, factions fallen, city levels and the new per-culture
  rows.
- **Target**: no culture's median cities moves by more than about 30% from the baseline,
  and the Punic lead doesn't widen. I'll tune the numbers until that holds, then report the
  before/after table.
- `npm run levers`: the market, farm, mine and port discounts and multipliers mustn't break
  `balance.test.ts`.
- Caveat: Rome is passive in sims, so the Roman traits can only be judged by the combat
  tests and by you playing. I'll report Roman spearmen against each culture's spearmen as
  numbers.
- Browser check (headless Chromium): the tooltip and the adjusted costs show on a Roman
  city's Recruitment and Construction tabs.
- Commit and push to `claude/dazzling-thompson-qvs9ei`.
