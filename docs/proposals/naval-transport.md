# Decision: naval transport

- **Status:** Proposed. Not implemented yet. The largest of the open proposals: this
  document scopes it in three steps and asks for agreement on the first only.
- **Decides:** whether armies can travel by sea beyond the fixed crossings, and whether
  fleets can blockade a port.
- **Where it goes once agreed:** each step gets its own entry in `docs/DECISIONS.md` (under
  Map for sea travel, Sieges for the blockade) with measured numbers, and `README.md` gets
  the rules under Armies and the Port row.

## Context

The sea today is scenery and a barrier. Water is impassable (`TERRAIN.water.passable`), and
armies cross only at nine fixed **sea crossings**, which are ordinary steps in the topology
(`SEA_CROSSINGS` in `src/map/europe/europeMapEngine.ts`, joined with `topology.connect`).
That was chosen so every city is reachable by land (DECISIONS, Map). A Port gives growth and
a little gold and nothing else.

The idea: Ports build transports that carry an army along the coast, and a fleet off a
besieged port cuts it off from the sea. Done fully, that's ships on the map, armies at sea,
battles at sea and an AI that uses all of it. It touches movement, zones of control, fleeing,
sight, sieges, rendering and the AI, which all assume today that nothing stands on water.
So it's split in steps, each playable on its own.

## Choices to make

| Question | Options | Recommended |
|---|---|---|
| What a transport is | An order: an army in a port sails to a shore, with no ship on the map. Ships as their own kind of unit on the water (like scouts), carrying regiments. Armies themselves walk onto water. | **Step 1: an order. Step 2: ships as their own kind.** Armies on water is rejected: every army rule would need a sea exception. |
| Where it can land | Only in your own port city. Any empty shore tile. Also beside an enemy city, laying siege on arrival. | **Any empty shore tile** (or your own city), and it may lay siege on landing but not storm until next turn. That's the point of a landing; declaring a siege already costs no movement. |
| Range and load | Fixed. By Port level. | **By Port level:** 8 / 12 / 16 sea tiles, 4 / 7 / 10 regiments. |
| Cost | Free. Gold per regiment per voyage. | **5 gold per regiment**, so a voyage is a decision, not a shortcut taken every turn. |
| What a blockade does | Sea resupply: a besieged port uses supplies half as fast unless blockaded. A blockade speeds surrender and cuts port gold. Port gold and sea trade only. | **Speeds surrender (−2 supplies a turn) and cuts port gold and sea trade.** Sea resupply (the literal "blocks resupply") would make 46 coastal cities harder to take for anyone without a fleet, against the siege tuning the player chose. |
| The sea crossings | Keep them. Replace them with Port voyages. | **Keep them.** "Every city reachable by land" and `tests/map.test.ts` depend on them; fleeing never uses the sea. |

## Baseline (current code)

| Measure | Value |
|---|---|
| Cities | 55 |
| With a coast (can build a Port) | 46 |
| Whose own tile touches the sea | 21 |
| Seas | 6 separate bodies of water; one holds 1,613 of 1,754 sea tiles and all 21 shore cities touch it |
| Sea crossings | 9 fixed links |
| Ports built by the AI (seed 2) | 0 at turn 25, 8 at turn 50: the port comes after farms in `aiBuildOrder` |
| Sieges ending in surrender | 1 of 448 in 8 games (DECISIONS, Sieges): storming is the main way cities fall |
| Port cities under siege (seed 2, every round start sampled) | none |

What this tells us:

- One connected sea serves every shore city, so a voyage's range, not the map, limits it.
- A blockade that only speeds surrender would rarely matter in AI games (sieges almost
  never run out). Its weight comes from cutting port gold and trade, and from the player's
  sieges.
- Ports are built late. Transport gives them a military use, which may move them up the
  AI's build order; that's a balance change to measure, not assume.

## Proposal

These are starting numbers, to be tuned against the measurements.

### Step 1: sea lanes (the smallest useful step)

No ships on the map. An army in a port city sails to a shore within range and lands there.

| Rule | Starting number |
|---|---|
| Who can sail | An army in its own city with a Port, not besieged, with no enemy army next to the city, that hasn't moved this turn |
| Range | 8 / 12 / 16 sea tiles from the city's coast, by Port level |
| Load | 4 / 7 / 10 regiments, by Port level |
| Lands on | An empty land tile touching that sea, or your own city (merging if there's room). Never an enemy city |
| Cost | 5 gold per regiment |
| On landing | No movement left. It may lay siege to a city next to it; it can't attack until next turn |
| Hidden army on the shore | The voyage is refused and the army loses its movement, as running into a hidden army does on land |
| Fleeing | Never by sea (unchanged) |

### Step 2: fleets and blockades

| Rule | Starting number |
|---|---|
| Fleet | Its own kind of unit on water tiles (`state.fleets`), built in a Port's recruitment queue: 250 gold, 4 gold a turn |
| Movement | 16 points, 2 a sea tile; sees 3 tiles |
| Carries | Regiments up to its Port level's load, stored on the fleet; they land as in step 1 |
| Blockade | An enemy fleet on the city's coast, and none of the owner's there: no port gold, no sea trade, and while besieged the city uses 2 supplies a turn |
| Fighting | None in step 2: two rival fleets on one coast cancel the blockade |

### Step 3: battles at sea (later, sketched only)

Fleets fight fleets, sinking regiments aboard; the AI builds and hunts fleets. A new
battle mode in `systems/combat.ts`, sized like the original combat work.

### Scope

| Step | New state | Systems touched | AI | Rendering | Size |
|---|---|---|---|---|---|
| 1. Sea lanes | None: the army just moves | new `systems/naval.ts`, `actions.ts`, a coast helper from `cities.ts` | Sails when it saves 2+ turns, and for relief | Landing tiles highlighted, a glide over the water | About watchtowers or scouts |
| 2. Fleets, blockade | `state.fleets`, with regiments aboard | Upkeep, elimination, sight, invariants, sieges, port gold, trade | Builds a fleet per port region, blockades its target | Ship model, a Fleet tab in the bottom bar | Larger than scouts |
| 3. Sea battles | Fleet strength | `combat.ts`, battle panel | Naval targeting | Battles at sea | A new combat mode |

## How it would be built (step 1)

1. **`src/data/naval.ts`**: `NAVAL` (range and load by Port level, gold per regiment).
2. **New `src/systems/naval.ts`**:
   - `coastTiles(ctx, state, city)`: the sea `measureCoasts` (`systems/cities.ts`) already
     counts, factored out so both use it.
   - `seaReach(ctx, state, city, range)`: a breadth-first search over water tiles from
     those coast tiles; landing tiles are passable land touching a reached sea tile. It uses
     only `topology.neighbors` and tile terrain, so nothing in the map engine changes and
     nothing assumes hexes (AGENTS: only the map engine may). Sea bodies are cached like
     `landmasses` in `systems/pathfinding.ts`.
   - `canSail` / `sail`: checks as above; moves the regiments with `relocate`
     (`systems/armies.ts`), sets their movement to 0, charges the gold.
3. **Action**: `{ type: "sail"; armyId; regimentIds; to }` in `src/core/actions.ts`.
4. **AI** (`src/ai/ai.ts`, `src/ai/assess.ts`):
   - `advanceAction`: a field army in a port city sails when landing beside its target is
     at least 2 turns quicker than marching (`costToTarget`).
   - `findRelief`: a port muster may sail to a shore next to the besieged city.
   - It plans on the fogged view and checks `canSail` against the real state, as for moves.
5. **UI and map**: landing tiles get their own highlight (`src/render/three/mapView3d.ts`);
   the army figure glides across the water along the search's path; `showAiAction`
   (`src/game/controller.ts`) plays AI voyages in sight like moves. Side panel: "Sail
   (5 gold a regiment)" with what blocks it.
6. **Tests**: new `tests/naval.test.ts`: range and load by Port level, the cost, no landing
   on armies or enemy cities, no sailing beside an enemy army, siege on landing allowed and
   storm refused. `tests/invariants.ts`: no army ever stands on water.

## Consequences and risks

- **Zone of control** exists so "armies can't slip past each other" (DECISIONS, Movement).
  Landing behind a front gets round it on purpose; refusing to sail with an enemy army next
  to the port keeps it from being an escape from battle.
- **Sieges:** landing and besieging in one turn makes coastal cities easier to threaten.
  The −2 supplies of step 2 pushes slightly against "storming, not starving, should be the
  main way to take a city"; it's limited to blockaded ports.
- **AI:** if the AI doesn't sail, the player gains an edge only they have. Step 1 ships with
  the AI's two uses, measured; it isn't player-only.
- **Speed:** a bounded sea search per port army per decision, cached per turn, is small
  next to the land pathfinding that dominates AI turns.
- **Step 2** puts regiments somewhere other than `state.armies`: upkeep, mercenary desertion,
  faction elimination, regiment ids and the invariants must all look at fleets too. That's
  why it's a separate step.
- **Islands:** Palma, Rhodos and Salamis were removed because they couldn't be reached
  (DECISIONS, Map). Sea lanes would make them reachable; bringing them back is a separate
  decision.
- **Trade routes (note):** if trade routes are built, sea routes are what a blockade cuts.

## How we'll know it works

- `npm run build` is clean, and `npm test` passes: no invalid AI action (including voyages
  into hidden armies), no AI debt, no army on water.
- `npm run compare -- --base master --seeds 8`, with and without `--garrison`, with a
  "Voyages" row added to `tools/compare.ts`.
  **Target for step 1:** the AI sails 5–40 times a game; cities taken and factions fallen
  within ±20%; median AI income within ±10% (more ports built is fine); city levels still
  spread across 1–3.
- A browser check: landing tiles highlight from a port city; the glide over water plays,
  for the player and for an AI voyage in sight; a landing next to an enemy city opens the
  siege screen.

## Open questions for review

- Is step 1 (voyages with no ships on the map) enough to be worth playing, or does it only
  make sense with fleets?
- Should landing beside an enemy city and laying siege at once be allowed, or should the
  army wait a turn on the shore?
- For the blockade: speed up surrender as proposed, or the literal sea resupply, which makes
  every coastal city harder to starve out without a fleet?
- Should the removed island cities come back once the sea can be crossed?
