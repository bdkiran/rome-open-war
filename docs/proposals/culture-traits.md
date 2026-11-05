# Decision: culture traits

- **Status:** Proposed. Not implemented yet.
- **Decides:** whether cultures should change the rules, and how.
- **Where it goes once agreed:** this replaces "Cultures are purely a look". When it's
  built, a short entry goes into `docs/DECISIONS.md` with the measured numbers, and
  `README.md` gets the rules.

## Context

Each faction has a culture: Roman, Hellenistic, Punic, Celtic or Thracian
(`src/data/cultures.ts`). Today it only sets how the soldiers look on the map. Every
faction plays the same way, so the 14 opponents feel alike. Culture traits are the first
idea picked for adding depth, because they're cheap: almost all numbers in `src/data/`, and
the AI already reacts to unit strength and cost.

## Choices already made

| Question | Options considered | Chosen |
|---|---|---|
| Scope | Units only. Units plus one economic edge. Units, economy and terrain. | **Units plus one economic edge.** Terrain edges would need terrain passed into battles, which is more work and more balance risk. |
| Drawbacks | Bonuses only. A bonus plus a small drawback. | **A bonus plus a small drawback.** Overall strength stays level, and choices get sharper. |
| Whose traits in a conquered city | The owner's. The city's culture. | **The owner's.** Rome trains Roman troops everywhere, so nothing new has to be stored per city. |
| Movement traits | Faster cavalry for some cultures. | **Rejected.** Cavalry movement was cut from 18 to 16 on purpose, so they couldn't strike from anywhere (DECISIONS, Movement). |

## Baseline (current code, 4 seeds, 100 turns, passive Rome)

| Culture | Factions | Cities at start | Cities at turn 100 (seeds 1–4) | Median |
|---|---|---|---|---|
| Roman | Rome | 7 | 2, 0, 2, 2 (Rome doesn't play in sims) | 2 |
| Hellenistic | Macedon, Greeks, Seleucids, Egypt, Pontus | 17 | 23, 16, 17, 15 | 16.5 |
| Punic | Carthage, Numidia | 7 | 10, 11, 14, 12 | 11.5 |
| Celtic | Gauls, Germania, Spain, Britannia | 16 | 16, 19, 14, 16 | 16 |
| Thracian | Thrace, Dacia, Scythia | 8 | 4, 9, 8, 10 | 8.5 |

What this tells us:

- AI armies at turn 100 are about 45% militia, 25% spearmen, 25% archers and 5% cavalry,
  and almost everything is basic tier. So a trait on militia, spearmen or archers matters
  a lot. A trait on cavalry matters little unless it makes the AI train more of them.
- Punic factions already do best (+65% cities), so their traits come with a real drawback.

## Proposal

These are starting numbers, to be tuned against the measurements.

| Culture | Unit edge | Economic edge | Drawback |
|---|---|---|---|
| **Roman**: legions | Spearmen +1 armor (3→4) | Roads and Walls cost −25% | Cavalry +25% gold and upkeep |
| **Hellenistic**: Cretan bows | Archers +1 ranged (6→7) | Market costs −25% | Militia −0.5 attack (2→1.5) |
| **Punic**: Numidian horse | Cavalry −25% gold and upkeep | Port gold +50% | Spearmen +20% gold and upkeep |
| **Celtic**: warbands | Militia +0.5 attack (2→2.5) and +2 charge on open ground | Farms cost −25% | Archers +25% gold and upkeep |
| **Thracian**: horse archers | Cavalry gain 2 ranged (they fire in the volleys) | Mine gold +50% | Walls cost +25% |

Stat edges are added to the unit's base stats **before** the tier multiplier, so an elite
regiment keeps the edge in proportion.

## How it would be built

1. **`src/data/cultures.ts`**: add `CULTURE_TRAITS: Record<Culture, CultureTraits>` (name,
   a one-line summary, per-unit stat additions and cost multipliers, building cost
   multipliers, building gold multipliers). All the numbers live here.
2. **The regiment remembers its culture**: add `culture: Culture` to `Regiment`, stamped
   from the owner at setup and when the regiment is trained.
   - Regiments never change owner, so this always matches the owner. A new invariant in
     `tests/invariants.ts` checks it.
   - Battles take regiments directly, so every battle function sees the culture without
     extra arguments.
   - `unitStats` applies the edge. `kindsOf` in `systems/combat.ts` pools by culture too.
   - The AI's hypothetical troops (`trainAgainst`) pass the owner's culture, so the AI
     favours its strong units through its existing checks.
3. **Costs**:
   - `trainingCost`, `upkeepFor`, `regimentCost` and `retrainCost` take a culture.
   - A new `buildingCost` helper replaces direct reads of `def.cost`.
   - Mine and port gold in `cityIncome` use the owner's multiplier, so the money breakdown
     shows it.
4. **UI** (kept short):
   - The scoreboard faction row gets a tooltip with the culture and its three traits.
   - Recruitment and Construction cards show the adjusted costs.
   - Recruitment card tooltips name the edge.
5. **Tests**:
   - `tests/combat.test.ts`: each stat edge, measured as "fights like N basic soldiers".
   - `tests/recruitment.test.ts` and `tests/buildings.test.ts`: the cost and gold changes.
6. **Tooling**: per-culture "Cities held" rows in `tools/compare.ts`, which still work
   with `--base master`.

## Consequences and risks

- The AI should lean into its strengths without new AI code. If it doesn't (for example,
  Thracians still never train cavalry), that's a follow-up for the AI's unit choice.
- Rome is passive in sims, so the Roman traits can only be judged by the combat tests and
  by playing. Roman spearmen against each culture's spearmen get reported as numbers.
- A cheaper market, farms, mine or port moves the economic levers. `npm run levers` and
  `tests/balance.test.ts` must still pass.

## How we'll know it works

- `npm run build` is clean, and `npm test` passes: no invalid AI action, no AI debt, and
  the new invariant holds.
- `npm run compare -- --base master --seeds 8`, with and without `--garrison`.
  **Target:** no culture's median cities moves by more than about 30% from the baseline,
  and the Punic lead doesn't widen. The numbers get tuned until that holds, and the
  before/after table is reported.
- A browser check shows the tooltip and the adjusted costs.

## Open questions for review

- Are the five themes right (legions, Cretan bows, Numidian horse, warbands, horse
  archers)?
- Are the drawbacks the right size, or should some be dropped?
- Should Rome, as the player's faction, get a deliberately milder edge?
