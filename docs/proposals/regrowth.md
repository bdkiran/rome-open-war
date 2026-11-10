# Decision: regrowth after a sack

- **Status:** Proposed (held back: the growth curve shipped alone first; see
  `docs/DECISIONS.md`, "Growth slows only near the limit"). The numbers below were
  modelled with a curve of 2; the curve shipped at 1.25, so regrowth would be
  slower than shown.
- **Decides:** whether a city that lost people (sacked, enslaved, drafted) grows faster
  until it's back to its old size.
- **Where it goes once agreed:** the growth entry under Cities and economy in
  `docs/DECISIONS.md`, and the growth rules in `README.md`.

## Context

A sack halves a city or takes a quarter of its people, and recruiting drains it too. With
the growth curve at 1.25, a level-1 city sacked from 6,000 to 3,000 takes about 41 turns to get
back, a level-2 city from 12,000 to 6,000 about 33 (modelled). Regrowth would make that faster
without speeding up cities that have never lost anyone.

## Choices to make

| Question | Options | Recommended |
|---|---|---|
| How much faster | ×1.25, ×1.5, ×2 | **×1.25**. ×2 makes a sack cost almost nothing. |
| What counts as "lost" | Below its highest population ever. Below its population when last taken. | **Highest ever**: it covers drafting too, and needs one number per city. |

## Modelled turns to get back

Median growth rate of 3.4%, growth curve 2, no buildings. The 1.25 curve alone gives 41 / 33 / 36:

| | Curve 2 alone | ×1.25 | ×1.5 | ×2 |
|---|---|---|---|---|
| Level 1, 3,000 → 6,000 | 31 | 25 | 21 | 16 |
| Level 2, 6,000 → 12,000 | 26 | 21 | 18 | 13 |
| Level 3, 15,000 → 30,000 | 28 | 22 | 19 | 14 |

## How it would be built

- `ECONOMY.regrowthBonus` in `src/data/economy.ts`.
- `City.peakPopulation`, a plain number. It's set in `createCity` and raised after growth in
  `processCities`.
- `cityStats` multiplies `growthRate` by the bonus while `population < peakPopulation`. The
  city panel says "regrowing" in the growth tooltip.
- `tests/invariants.ts` checks `peakPopulation ≥ population`.

## Risks to measure

- Exterminating gets better, since the halved city regrows faster. With the curve at 1.25,
  it's best after 100 turns for 4 of 55 cities in `npm run levers` (the test allows
  1 in 10, 5 cities), so there's little room. Check `tests/balance.test.ts` first.
- Drafting costs less, since drafted people come back faster. Check the militia share and
  the number of soldiers in `npm run compare`.
