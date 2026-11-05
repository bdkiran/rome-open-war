# Decision: region specialties

- **Status:** Proposed. Not implemented yet.
- **Decides:** whether some cities' land carries a resource (horses, iron, yew, grain,
  silver, timber), where that's defined, and what it does.
- **Where it goes once agreed:** when it's built, a short entry goes into
  `docs/DECISIONS.md` (Map, or Cities and economy) with the measured numbers. `README.md`
  gets a Resources section and the scenario's resource list.

## Context

Cities differ only by their terrain: plains for people, hills for a mine, sea for a port.
The AI picks its target purely by how cheap it is to take (`chooseTarget` in
`ai/assess.ts`: defenders plus 40 per tile of distance), so no city is worth more than
another to it. A few resources make some cities prizes worth a war, and give each corner
of the map a character: Numidian horses, Iberian silver, Nile grain.

## Choices to make

| Question | Options | Recommended |
|---|---|---|
| Where resources are defined | Generated into `europeTerrain.ts` by `tools/build_europe_map.py`. **Scenario data** (`romanWorld.ts`, per city). Derived at setup from terrain (most plains → grain). | **Scenario data.** The generator turns Natural Earth coastlines and rough outlines into terrain, and its output isn't hand-edited. Resources are design choices, like the city list, which is the player's. A scenario is also how a new `MapEngine` gets swapped in. Deriving resources from terrain would hand more to the cities already richest in plains and hills. |
| Per tile or per city | A city-level tag. A tile in the city's territory. | **A tile, chosen at setup.** The scenario names the city, and setup puts the resource on a fitting tile of its territory so the map can draw it. Territory never changes, so this works like a per-city tag, and like watchtowers the owner comes from the territory, never stored. |
| How many | Every city. About 1 in 3. A few prizes. | **About 1 in 3 (22 of 55)**, with every faction holding at least one. |
| What a resource does | A cheaper building. A cheaper building plus an edge for its units. Stat bonuses. | **A cheaper building plus experience.** That unit, trained there, starts at experience level 1. This reuses the experience system and leaves stats to the culture-traits proposal. |
| Does the resource need its building | Always on. Only with the building. | **Unit resources work through their building** (it's cheaper, and its recruits start as veterans). Grain, silver and timber work with no building. |
| Does the AI value resources | No. A discount on the target score. | **A discount:** a resource city counts as 150 fewer defending soldiers. The AI's build order also moves the cheaper building up to just after the market. |
| Trade or export | Resources supply other cities. Local only. | **Local only.** Trade would need routes, which don't exist. |

## Baseline (current code)

| Measure | Value |
|---|---|
| Territory per city at the start (median) | 25 tiles: 10 plains, 6 hills, 2 forest, 1 mountain, 0 desert; coast 12 |
| Cities with ≥12 plains / ≥6 hills or mountains / ≥4 forest | 21 / 32 / 19 of 55 |
| Unit buildings (level 1 / 2 / 3) | Spear yard 150 / 300 / 500, Archery range 200 / 350 / 550, Stables 250 / 400 / 650 |
| AI armies at turn 100 | About 45% militia, 25% spearmen, 25% archers, 5% cavalry, almost all basic tier |
| City changes of hands (seed 1, 100 turns) | 27 of 55 cities change hands at least once |
| Median city at turn 100 (seed 1) | 7,174 people, about 33 gold before taxes and market |

What this tells us:

- Cavalry are rare because Stables are dear and few cities reach level 3. Cheaper Stables
  in horse country is the one change that could make the AI train more of them.
- With 6 mineable tiles in the median city, a level-1 mine pays 6 gold. That's the scale
  for silver.

## Proposal

These are starting numbers, to be tuned against the measurements.

| Resource | Placed on | Cities | Effect |
|---|---|---|---|
| **Horses** | plains | Capua, Cirta, Getae, Alania | Stables −40%. Cavalry trained here start at experience level 1. |
| **Iron** | hills, mountains | Arretium, Numantia, Trapezus, Marcomannia | Spear yard −40%. Spearmen trained here start at level 1. |
| **Yew** | forest | Tanais, Damascus, Eburacum | Archery range −40%. Archers trained here start at level 1. |
| **Grain** | plains | Syracusae, Thapsus, Memphis, Patavium | Farms −40%, +15% growth, +1 turn of siege supplies |
| **Silver** | hills, mountains | Carthago Nova, Corduba, Sardis, Porolissum | +6 gold a turn, before taxes and market |
| **Timber** | forest | Pella, Sinope, Batavodurum | Walls, Port and Roads −40% |

Each faction's share of the 22 resources:
- 2: Rome, Carthage, Seleucids, Gauls, Germania, Scythia, Pontus.
- 1: everyone else.

The resource goes on the city's nearest territory tile of a fitting terrain (ties broken
by tile id), or on the nearest land tile if none fits. Level 1 experience is +0.5 attack
and armor (2 points). Merging and retraining dilute it as they do any experience.

## How it would be built

1. **`src/data/resources.ts`** (new): `RESOURCES: Record<Resource, ResourceDef>` (name,
   fitting terrain, building discounts, veteran unit, growth, supplies, gold). All the
   numbers live here.
2. **Scenario:** `ScenarioCity.resource?: Resource` (`data/scenarios/types.ts`), set in
   `romanWorld.ts`. Nothing changes in the map generator or `europeTerrain.ts`.
3. **State:** `GameState.resources: Record<TileId, Resource>`, filled once in `createGame`
   (`core/setup.ts`) after `claimTerritory`. `placeCities` passes each city's resource
   through. A `cityResource(state, cityId)` helper in `systems/cities.ts` reads it via
   `cityTiles` (already cached).
4. **Costs:** a `buildingCost(state, city, building, level)` helper in
   `systems/buildings.ts` replaces direct reads of `def.cost` in `canBuild`,
   `queueConstruction`, `constructionAction` and `savingForBuilding` (`ai/ai.ts`),
   `tools/economy.ts` and the Construction cards. It's the same helper the culture-traits
   proposal needs, so they share it.
5. **Effects:**
   - `cityStats` adds grain growth and silver gold. Silver is a new `resource` line in
     `IncomeBreakdown`, so the money breakdown shows it.
   - `maxSupplies` (`systems/siege.ts`) takes the extra grain turn.
   - `processRecruitment` (`systems/recruitment.ts`) sets new regiments of the veteran
     unit to `EXPERIENCE.levels[0]` points.
6. **AI:**
   - `aiBuildOrder` puts the discounted building right after the market.
   - `chooseTarget` subtracts `AI.resourceWorth` (150) from a resource city's score.
     Resources sit on the map, which is always known, so this doesn't break fog.
7. **UI** (kept short):
   - An icon on the resource tile (`render/three/scenery`).
   - A fact line in the city panel, with the effect in a tooltip.
   - Discounted costs on the Construction cards.
8. **Tests:**
   - `tests/invariants.ts`: every resource tile is claimed territory, with at most one
     per city.
   - `tests/map.test.ts`: each scenario resource lands on a fitting terrain.
   - `tests/buildings.test.ts` and `tests/recruitment.test.ts`: the discount and the
     veteran start.
9. **Tooling** (`tools/compare.ts`): "resource cities changing hands" and the unit mix.

## Consequences and risks

- **The AI's army mix shifts.** Cheaper Stables in four cities may lift cavalry above 5%.
  That's intended, but it changes battles everywhere.
- **The Punic lead.** Carthage gets grain (Thapsus) and silver (Corduba), and Punic
  factions already end with about 65% more cities than they start with. If the lead widens,
  move Corduba's silver to an Iberian city.
- **Prize cities change hands more.** Their owners lose them more often. That's the point,
  but it can make small factions with a resource fall sooner.
- **The economy grows slightly.** The 4 silver cities and 4 grain cities earn and grow
  more; per-tile resources were halved for balance (DECISIONS, Map). The total is small: 24
  gold a turn across the world, before taxes and market.
- **It stacks with culture traits.** Both cut building costs, and the cuts multiply. The
  shared `buildingCost` helper keeps them in one place.
- **Levers.** `tools/economy.ts` reads `cityStats` and building costs, so grain and silver
  show up in `npm run levers`. `tests/balance.test.ts` should hold, since resources don't
  favour one tax policy or one fate.
- Rome is passive in sims, so Capua's horses and Arretium's iron can only be judged by
  playing.

## How we'll know it works

- `npm run build` is clean, and `npm test` passes, with the new invariants.
- `npm run compare -- --base master --seeds 8`, with and without `--garrison`.
  **Targets:**
  - Resource cities change hands 10–30% more often than other cities.
  - Median AI income within ±10%.
  - Cavalry rise but stay under 15% of AI soldiers.
  - No culture's median cities move by more than about 30%.
- `npm run levers` and `tests/balance.test.ts` still pass. The before/after table is
  reported.
- A browser check shows the resource icons on the map, the city panel line and the
  discounted costs.

## Open questions for review

- Is the list of six resources right, and are they in the right cities?
- Is −40% and a level-1 start the right size, or should one of the two go?
- Should silver need a mine (bigger, but only once one is built)?
- A seventh resource for trade goods (purple dye at Sidon, wine) that lifts the market?
