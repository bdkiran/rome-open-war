# Decision: trade routes

- **Status:** Implemented in a different form (see `docs/DECISIONS.md`, "Trade between a
  faction's own cities", and `README.md`, Cities and economy). What was built, and what of
  this proposal wasn't, is under "As implemented" at the end.
- **Decides:** whether cities earn gold by trading with each other, and what cuts that
  trade.
- **Where it goes once agreed:** a new entry under Cities and economy in
  `docs/DECISIONS.md` with the measured numbers, and the rules in `README.md` under Cities
  and economy (the Market row and the income line).

## Context

Today an enemy can hurt your economy only by besieging a city (a besieged city earns
nothing) or by taking it. An army marching through your land costs you nothing until it
fights. Trade routes make the space *between* cities matter: two of your cities with
Markets, joined by a road no enemy holds, both earn gold. An enemy army sitting on that road
cuts the trade without a battle, and raiding becomes a way to wage war.

It's also a reason to keep your cities close and connected, and to build roads.

## Choices to make

| Question | Options | Recommended |
|---|---|---|
| Who trades | Your own cities only. Also foreign cities. | **Your own cities only.** Every faction is at war with every other, so foreign trade waits for peace (see the diplomacy proposal). |
| How many routes | Every pair of Market cities. One per city. One per Market level (1/2/3). | **One per Market level**, to the nearest partners. Every pair would make big empires snowball. |
| What a land route is measured in | Tiles. Movement points (`enterCost`, so roads count). | **Movement points, up to 24** (two turns of infantry on open ground). Roads then extend trade, which ties them to the economy. |
| What cuts a land route | Foreign armies on it. Also the tiles next to them (zone of control). Also any foreign territory. | **All three**, and foreign cities. "No enemy controls it" reads the same way armies' movement does. |
| Sea routes | None. Between two cities with Ports. | **Between two cities with Ports**, up to 20 sea tiles between their coasts. Ports are rare and late (0 at turn 25, 8 at turn 50), so this is a late bonus. Nothing can cut one yet except a siege; see naval-transport. |
| Gold per route | Flat. By the partner's people. By the smaller city's people. By distance. | **2 + 0.5 per 1,000 people of the smaller city**, before taxes and the Market. Rewards growing both ends; distance stays a limit, not a bonus. |
| When it's checked | Every time income is read. Once a turn. | **Once a turn, at the end of the owner's turn**, stored on the city. `cityStats` is read thousands of times by the AI and has no map. |

## Baseline (current code, seed 2, 100 turns, passive Rome)

| Measure | Turn 25 | Turn 50 |
|---|---|---|
| Cities with a Market | 29 of 55 (28 at level 1) | 36 (31 at level 1, 5 at level 2) |
| Pairs of Market cities with the same owner | 19 | 35 |
| ...of them within 12 tiles | 11 | 23 |
| Median distance between such a pair | 8 tiles | 10 tiles |
| Cities with a Port | 0 | 8 |
| Median city | 4,200 people | 4,500 people |
| AI income per turn | 64–219 | 86–275 (about 2,400 in all) |

At turn 101 (seed 1): AI treasuries mostly 400–800, a few ~1,450; net income 230–610; nobody
in debt.

What this tells us:

- About two-thirds of same-owner Market pairs are close enough to trade, and the number
  doubles between turns 25 and 50 as markets go up. Routes would be common, not rare.
- A typical level-1 city pays about 29 gold before its market (5 base + 24 from 6,000
  people). A route worth 4–5 gold is a sixth of that: noticeable, not dominant.

## Proposal

These are starting numbers, to be tuned against the measurements.

| Rule | Starting number |
|---|---|
| Who | Two of your own cities, each with a Market, neither besieged |
| Routes per city | Its Market level: 1 / 2 / 3, to its nearest partners by route length. A city earns from the routes it picks; in practice they pair up both ways |
| Land route | At most 24 movement points (`enterCost`). Not through a foreign city, foreign territory, a tile with a foreign army or a tile next to one. Regions (outer land) and unclaimed land are fine |
| Sea route | Both cities have a Port; their coasts are at most 20 sea tiles apart over one sea |
| Gold per route | 2 + 0.5 per 1,000 people of the smaller city, before taxes and the Market |
| Example | 6,000 and 4,000 people, both with a Market square, normal taxes: (2 + 2) × 1.3 = 5 gold each a turn |
| Scouts | Never cut a route (they block nothing) |
| When a route is cut | Its owner is told once: "The road from Capua to Roma is cut." |

Expected size: ~23 routes by turn 50, both ends earning ~5, is ~230 gold a turn across the
AIs, about +10% of their income.

## How it would be built

1. **`src/data/economy.ts`**: `TRADE` (routes per Market level, max land cost, max sea
   tiles, base gold, gold per 1,000 people). All the numbers live here.
2. **State** (`src/core/state.ts`): `tradeRoutes: { partner: CityId; by: "land" | "sea" }[]`
   on `City`, set at the end of its owner's turn. Plain data; `captureCity` clears it.
3. **New `src/systems/trade.ts`**:
   - `tradeReach(ctx, state, city)`: a bounded Dijkstra over land from the city, like
     `costToTarget` (`systems/pathfinding.ts`) with `enterCost`, blocking foreign cities,
     foreign territory (`state.territory`), foreign armies and `zoneOfControl(ctx, state,
     owner)`. One search per Market city answers every partner.
   - Sea: a breadth-first search over water tiles from the city's coast (the same tiles
     `measureCoasts` in `systems/cities.ts` counts; factor them out as `coastTiles`). Uses
     only `topology.neighbors` and tile terrain, so it assumes nothing about hexes.
   - `refreshTradeRoutes(ctx, state, factionId)`: picks partners, logs cut routes.
4. **Income** (`systems/cities.ts`): `processCities` already takes `ctx`; it calls
   `refreshTradeRoutes` before paying income. `cityStats` reads the stored routes (ignoring
   a partner that's no longer ours or is besieged) and adds `trade` to `IncomeBreakdown`,
   inside `subtotal`, so taxes and the Market multiply it like mine, farm and port gold.
5. **UI** (kept short):
   - Money breakdown (`src/ui/turnPanel.ts`, the `parts` line): `+ 8 trade`.
   - City panel income line: tooltip naming the partners.
   - Map: the selected city's routes drawn as a faint dotted line (none otherwise, to keep
     the map clean).
6. **Tests**: new `tests/trade.test.ts`: an army on the road cuts it, the tile next to it
   too, foreign land too; roads lengthen reach; a besieged end earns nothing; partners per
   Market level. `tests/invariants.ts`: no city has more routes than its Market level, and
   every partner is a city it owned when routes were last set.

## Consequences and risks

- **The AI needs no new code to earn from trade** (it already builds the market second,
  after the government). It also won't *protect* roads or raid them on purpose; cuts happen
  when its armies pass. Raiding as a deliberate AI choice is a follow-up.
- **Treasuries:** the economy has overflowed before ("Economy tuning history", step 2). If
  the median AI treasury at turn 100 rises more than ~25%, cut the gold per route.
- **The Market gets stronger.** Its payback was ~29 turns in the model; a route adds about
  5 gold to the Market square's ~9, so it pays back about 1.5 times as fast. It's already built first, so the AI's
  order doesn't change, but `npm run levers` should show whether it now crowds out farms.
- **Levers model:** `tools/economy.ts` runs `processCities` in peacetime, so it gets routes
  for free and none are ever cut: an upper bound.
- **`tests/balance.test.ts`:**
  - Taxes: route gold is taxed, so all-high gains too; "grow, then tax" must still overtake
    it between turns 30 and 90.
  - Conquest: exterminating halves a city, which also shrinks its partners' routes, and
    occupying keeps them. Expect a small shift towards occupying; the 15% / 10% limits on
    exterminating should still hold.
- **Regions stay for the map only** (DECISIONS, "Regions fill the gaps"): a route may cross
  outer land, but that land earns nothing itself.
- **Speed:** one bounded search per Market city per turn (~36 cities) is small next to the
  AI's pathfinding, which dominates game time.
- **Naval transport (note):** sea routes are the natural thing for a blockade to cut, once
  fleets exist.
- **Culture traits (note):** the separate culture-traits proposal makes Hellenistic markets
  25% cheaper, which would also make their routes cheaper to open.

## How we'll know it works

- `npm run build` is clean, and `npm test` passes, including `tests/balance.test.ts`.
- `npm run levers`: the tax and conquest trade-offs keep their shape; the Market's payback
  is reported before and after.
- `npm run compare -- --base master --seeds 8`, with and without `--garrison`, with "Trade
  routes at turn 50 / 100" and "Route-turns cut" rows added to `tools/compare.ts`.
  **Target:** median AI income +5–15%; median AI treasury at turn 100 up no more than 25%;
  at least 10% of route-turns cut in full games (war hurts without a battle); cities taken
  and factions fallen within ±20%; city levels still spread across 1–3.
- A browser check: the breakdown shows trade gold; parking an army on the road cuts it next
  turn with one report; the dotted route shows on the selected city.

## Open questions for review

- Should routes earn by distance (longer is richer but more exposed), instead of only being
  limited by it?
- Is the zone of control the right width for cutting a route, or only the army's own tile?
- Should a cut route also show on the map, so the player sees where the enemy is raiding?

## As implemented

The player directed a simpler version, built around the buildings: markets, roads and ports
all boost trade.

| Question | Proposed here | As built |
|---|---|---|
| Who trades | Own cities only | Own cities only (as proposed) |
| What opens a route | A Market at both ends | **Roads at both ends** (land) or **a Port at both ends** (sea). The Market isn't needed; it multiplies trade instead |
| Land route | Up to 24 movement points, not through foreign land or near foreign armies | **Cities whose claimed land borders** |
| Sea route | Ports, coasts up to 20 sea tiles apart | Ports, up to **6 / 16 / 40** sea steps by the route's level |
| How many routes | One per Market level | **Every** qualifying partner |
| Gold per route | 2 + 0.5 per 1,000 people of the smaller city | **0.4 / 0.7 / 1 per 1,000 people of the partner**, by the route's level (the lower of the two cities') |
| The Market | Unchanged, multiplies trade like other gold | **+25 / 50 / 80%** on ordinary income (was +30 / 60 / 100%), **+50 / 100 / 150%** on trade |
| Port gold | Unchanged | Sea trade **replaces** the per-sea-tile gold |
| When it's checked | Once a turn, stored on the city | Partners mapped **once at setup** (`City.landNeighbours`, `City.seaDistances`); open routes read in `cityStats` |
| What cuts a route | Foreign armies on it or next to it, foreign land, sieges | **Only a siege at either end**, or losing the city |

Not built, and still open as follow-ups:

- Armies cutting land routes (the raiding this proposal was mainly for), and the
  "The road from Capua to Roma is cut." report.
- The selected city's routes drawn on the map.
- The "Trade routes" and "Route-turns cut" rows in `tools/compare.ts`.
- Measured with 4 seeds, not the 8 this proposal asked for.
