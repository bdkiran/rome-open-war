# Unlimited War

A browser-based, turn-based grand strategy game, set in the Roman world of
218 BC.

## The scenario

You play the **Roman Republic** on the eve of the Second Punic War. Thirteen
AI powers share the map with you:

| Faction                | Cities                                 |
|------------------------|----------------------------------------|
| Roman Republic (you)   | Roma, Ariminum, Tarentum, Syracusae    |
| Carthage               | Carthago, Carthago Nova, Lilybaeum     |
| Kingdom of Macedon     | Pella, Demetrias, Corinthus            |
| Seleucid Empire        | Antiochia, Tarsus, Sardis              |
| Ptolemaic Egypt        | Alexandria, Memphis, Cyrene            |
| Arverni Confederation  | Gergovia, Lutetia, Tolosa              |
| Kingdom of Numidia     | Cirta, Siga, Iol                       |
| Germanic Tribes        | Lupfurdum, Treva, Budorigum            |
| Scythian Kingdom       | Neapolis Scythica, Olbia, Tanais       |
| Odrysian Thrace        | Seuthopolis, Odessos, Byzantion        |
| Celtiberian Confederation | Numantia, Toletum, Olisipo          |
| Britons                | Camulodunon, Durnovaria, Isurium       |
| Dacian Kingdom         | Sarmizegetusa, Porolissum, Piroboridava |
| Kingdom of Pontus      | Amaseia, Sinope, Trapezus              |

The map runs from Iberia to Syria and from Egypt to the North Sea. Dashed
lines mark **sea crossings** that armies can step across like any other
move: the Pillars of Hercules, the Strait of Messina (Sicily to Italy),
Sicily to Africa, the Channel, Corsica to Sardinia, and Corsica to Italy.
Sicily is its own island, shared by Rome (Syracusae) and Carthage
(Lilybaeum). (At this scale the Hellespont is already joined by land.) Every
city can be reached from every other.

The game is won by being the **last faction standing**: when every rival has
fallen, a victory screen appears. If Rome loses its last city, it's defeat.
Either way you can close the screen to look at the map, or play again.

The scenario lives in `src/data/scenarios/romanWorld.ts`.

## Running it

You need Node.js (version 18 or newer).

```
npm install
```

Then start everything with one command:

```
npm run dev
```

This runs two things side by side: the TypeScript compiler, which turns
`src/*.ts` into `dist/*.js` and recompiles on every save, and a local web
server for the game at http://localhost:3000. Open that address. After editing
a `.ts` file, save and refresh the browser. Press Ctrl+C to stop both.

Run `npm install` again whenever `node_modules` is missing, for example after
replacing the project folder from a zip.

If you'd rather not use `serve`, any static file server works, for example
`python3 -m http.server`. Opening `index.html` directly from disk does not
work, because browsers block ES modules loaded from `file://`.

## For developers and coding agents

`AGENTS.md` (imported by `CLAUDE.md` for Claude Code) holds the working
instructions: commands, architecture, the rules that must not break, and how
to test. `docs/DECISIONS.md` explains why the rules and numbers are what they
are. `tools/simulate.py` plays a whole AI-vs-AI game headlessly and reports
invalid AI orders, debt, city growth and treasuries; run it after any change
to the rules, the numbers in `src/data/`, or the AI.

## Controls

- Drag or use arrow keys / WASD to pan
- Scroll to zoom; you can zoom out until the whole map fits, and the view
  stays on the map
- Click a tile, city or army to inspect it; Escape clears the selection
- Select one of your cities to open its panel: its details, the tax rate
  (the arrows lower or raise it), and the Construction, Recruitment and
  Retraining tabs
- **Left click selects; right click gives orders.** Left-click one of your
  armies (its regiment boxes choose which regiments to order), then
  right-click a highlighted tile to move there or a red tile to attack it. Red
  tiles include enemies the army can march up to this turn; it moves next to
  them and attacks in one go. Attacking an army opens the battle panel with
  the odds: Fight or Withdraw (Escape also withdraws). Right-clicking an enemy
  city lays siege to it (marching up first if needed) and opens the siege
  screen: Continue the siege, Storm the city (which leads to the battle
  panel), or Withdraw (which lifts the siege)
- After every battle you fight in, yours or an AI's attack on you, a result
  screen shows who won and what each side lost
- Right-click a distant tile to send the selected army marching there over
  several turns; Cancel march in the army panel stops it
- Tab and Shift+Tab (or the ◀ Cities ▶ buttons) step through your cities
- The top-right panel lists every faction with its people, soldiers and gold; click
  the income line under your treasury for a breakdown of where your money
  comes from (each city's base, people and mine gold, times its taxes and
  market) and where it goes (each army's upkeep)
- **Reports** (bottom right): at the start of each turn, what happened since
  your last one arrives as notifications: battles, sieges and cities involving
  you, your finished buildings and recruits, and world news (cities changing
  hands, factions falling). Click one to read it, × to dismiss it; History
  shows recent reports again
- In the army panel: Merge damaged regiments of the same type; leave some
  regiments out to split the army; move onto a friendly army to merge
- End turn with the button or Enter

## Project layout

```
src/
  main.ts              wires everything together and handles player input
  core/
    state.ts           GameState and Faction types
    actions.ts         Action type and applyAction, the only way to change state
    setup.ts           builds the starting state: cities and starting armies
    context.ts         fixed info the rules need (the map topology); not saved
    rng.ts             seeded random numbers for battles (never use Math.random in game logic)
  data/
    scenarios/         a scenario = a map engine + factions + starting cities
      romanWorld.ts    218 BC
      types.ts
    terrain.ts         terrain rules: movement, defense, capacity, growth, mining
    economy.ts         gold numbers and tax rates
    buildings.ts       buildings, their levels, costs, build times and effects
    conquest.ts        occupy, enslave, exterminate: plunder and population
    gameSetup.ts       territory radius, starting population, starting army
    units.ts           unit types, rock-paper-scissors, costs, upkeep, stack limit
    combat.ts          battle numbers: matchup multipliers, defense, randomness
    ai.ts              AI tuning: attack and retreat margins, garrison sizes, caution
    siege.ts           supplies, attrition and restocking numbers
    vision.ts          how far cities and armies can see
  systems/
    turn.ts            end-of-turn and start-of-turn processing
    cities.ts          territory, population growth, income, capture, elimination
    buildings.ts       city levels and construction
    conquest.ts        deciding a captured city's fate
    armies.ts          training, upkeep, stacking, movement range, attack targets
    combat.ts          battle resolution and attacks
    pathfinding.ts     multi-turn routes (cost to a target) and landmasses
    siege.ts           besieging, attrition, surrender, lifting sieges
    victory.ts         last faction standing; victory and defeat
    vision.ts          fog of war: visible tiles and each faction's view of the game
  ai/
    ai.ts              picks AI actions one at a time: attack, retreat, march, train
    assess.ts          threats, garrison needs, and which enemy city to target
  game/
    controller.ts      holds the current state, applies actions, runs AI turns
  map/
    mapEngine.ts       MapEngine interface: the swap point for the whole map system
    europe/
      europeMapEngine.ts   the Roman world: terrain, projection, sea crossings
      europeTerrain.ts     generated terrain data (see tools/)
    topology.ts        MapTopology interface: how the rest of the game sees map shape
    tiles.ts           per-tile data types
    hexTopology.ts     hex grid implementation
  render/
    mapView.ts         what the map needs from the UI (view state, camera moves)
    three/             the 3D map
      mapView3d.ts     the scene: terrain, cities, armies, overlays, name plates
      terrain3d.ts     raised hex terrain, trees, peaks, the overlay layer
      models.ts        code-built army and city models, and loading model files
      camera3d.ts      the tilted campaign camera
    input.ts           mouse and keyboard handling
    colors.ts          map palette
    figures.ts         the unit figures shown in the panels (SVG)
    format.ts          number formatting (12,345 / 12k / 2.5%)
  ui/
    infoPanel.ts       selected tile, city, army and the training form
    turnPanel.ts       turn number, treasury, turn order
    reports.ts         the reports tray: notifications at the start of each turn
    gameOver.ts        the victory and defeat screen
    battlePanel.ts     the battle preview: odds, both sides, fight or withdraw
    siegePanel.ts      the siege screen: continue, storm or withdraw
    battleResult.ts    the result of a battle you fought in
    buildingArt.ts     the building icons in the Construction tab
    settlementPanel.ts the choice of a captured city's fate
    html.ts            small HTML helpers
```

Rules to keep:

- `core`, `data`, `map`, `systems`, `ai` and `game` never import from `render`.
- State only changes through `applyAction`, which returns a new state. The
  human UI and the AI both send the same `Action`s.
- `GameState` holds plain data only, so it can be saved as JSON.
- To use a different map system, write a new `MapEngine` and use it in a
  scenario. Nothing outside the engine's own files may assume hexes; the rest
  of the game only uses `MapTopology` and the tile data. A map of real places
  can also offer `locate(lon, lat)` so scenarios can place cities by
  coordinates, and `links()` for connections like sea crossings.
- Imports are written from `src` with the `@/` prefix, e.g.
  `import { TERRAIN } from "@/data/terrain.js"`, never `../`. This works via
  `paths` in `tsconfig.json` and the import map in `index.html`.
- Imports always end in `.js`, even though the files are `.ts`.

## Roadmap

- [x] Phase 0: Project setup
- [x] Phase 1: The map
- [x] Phase 2: Game state and turn loop
- [x] Phase 3: Armies and movement
- [x] Phase 4: Cities and economy
- [x] Phase 5: Combat
- [x] Phase 6: AI
- [x] Phase 7: Game structure (last faction standing, victory and defeat screens)
- [ ] Phase 8: Fog of war and polish (done: fog of war, battle preview, march
  orders, next-army hotkey; to do: animations, balance passes)
- [ ] Phase 9: Save and load

## Cities and economy

Each faction starts with three cities: a capital of 6,000 people and two more
of 3,000 nearby. No other cities are ever created. Each city claims the land
within 2 tiles at the start, and its territory never changes.

Population grows every turn using a carrying capacity:

```
growth = baseGrowthRate × population × (1 − population / capacity)
```

- **Capacity** is the total number of people the city's land supports. Each
  terrain type supports a set amount: plains 3,200, forest 1,600, hills 1,300,
  mountains 400, desert 150. The sea is never claimed as land, but every sea
  tile within a city's reach (2 tiles) counts as **fishing grounds**, adding
  1,000, so coastal cities aren't left small. The largest city on the map,
  all-plains Lutetia, has land for about 60,000.
- **The city's level caps it.** Whatever its land supports, a city can't grow
  past its level's limit until its government is raised: 8,000 people with a
  Council hall (level 1), 20,000 with a Forum (level 2), and only its land
  with a Senate (level 3). The city panel marks Capacity with ⚠ when the
  level, not the land, is what holds a city back.
- **Base growth rate** is the average of each terrain type's rate across the
  city's land and fishing grounds, e.g. plains 5%, forest and sea 3.5%, hills
  2.5%, mountains and desert 1%.

Cities grow close to their base rate while small and slow down as they near
capacity. A city over capacity shrinks.

Each city adds a flat 5 gold per turn, plus 4 gold per 1,000 people, plus
whatever its mine digs (see below). The land itself pays nothing: hills and
mountains only earn gold once a city builds a mine.

**City levels and buildings.** Every city has a level from 1 to 3, set by its
government building. Other buildings can be built up to the city's level;
raising the government advances the city and unlocks the next level of each,
but needs enough people first.

| Government   | City level | Needs          | Holds up to        | Cost       | Turns |
|--------------|------------|----------------|--------------------|------------|-------|
| Council hall | 1          | (every city)   | 8,000 people       |            |       |
| Forum        | 2          | 6,000 people   | 20,000 people      | 500 gold   | 4     |
| Senate       | 3          | 15,000 people  | all its land holds | 1,200 gold | 6     |

Capitals start at level 2 with their Forum; other cities start at level 1.

| Building | Effect per level (1 / 2 / 3)                               | Cost (1 / 2 / 3)     | Turns     |
|----------|------------------------------------------------------------|----------------------|-----------|
| Walls    | +15% / +30% / +50% defense, on top of the city's 10%       | 200 / 400 / 700 gold | 2 / 3 / 4 |
| Farms    | +20% / +40% / +60% population growth                       | 150 / 300 / 550 gold | 2 / 3 / 4 |
| Market   | +30% / +60% / +100% gold                                   | 150 / 300 / 500 gold | 2 / 3 / 4 |
| Mine     | +2 / +4 / +6 gold per hills or mountain tile in its land   | 200 / 400 / 700 gold | 2 / 3 / 4 |

A mine can only be built in a city whose territory has hills or mountains, so
it's worth a lot in hill country and nothing on the plains; the Construction
tab shows how many tiles it can dig and what the next level would earn. Its
gold counts toward the city's income before taxes and the market, so both
multiply it.

Build from the city panel's Construction tab: click a building to queue its
next level. The **construction queue** holds up to 5 buildings, built one
after another and paid for when queued; work goes on at the end of each of
your turns and stops while the city is besieged. You can queue several levels
of the same building (walls 1, then walls 2), but only a **finished**
government unlocks the next level of the others: a level-3 building can't be
queued until the Senate is built. Cancelling a building (its ×) refunds it,
along with any later levels of it queued behind it. A captured city keeps its buildings but loses
whatever was being built. On the map, a city grows with its level, and its
walls appear once built: a palisade, stone walls, then great walls with
towers. The numbers are in `src/data/buildings.ts`.

**Tax rate.** Each city has its own tax rate, set with the arrows in its
panel. It trades gold for growth:

| Tax rate | City's gold | Population growth |
|----------|-------------|-------------------|
| Low      | ×0.6        | ×1.5              |
| Normal   | ×1          | ×1                |
| High     | ×1.5        | ×0.5              |

High taxes slow a city's growth but never make it shrink. A captured city
goes back to normal taxes. The AI raises taxes when it's in debt and lowers
them again once it has recovered. The numbers are in `src/data/economy.ts`.

The numbers are in `src/data/terrain.ts`, `src/data/economy.ts` and
`src/data/gameSetup.ts`.

## Armies and combat

There are three unit types in a rock-paper-scissors triangle:

| Unit     | Movement | Beats    | Loses to | Regiment     | Cost per regiment | Upkeep per regiment |
|----------|----------|----------|----------|--------------|-------------------|---------------------|
| Spearmen | 12       | Cavalry  | Archers  | 200 soldiers | 200 gold          | 4 gold a turn       |
| Archers  | 12       | Spearmen | Cavalry  | 160 soldiers | 320 gold          | 5 gold a turn       |
| Cavalry  | 16       | Archers  | Spearmen | 120 soldiers | 360 gold          | 6 gold a turn       |

That's 1, 2 or 3 gold per soldier to train, as before; upkeep is 0.02, about
0.03, and 0.05 gold per soldier, rounded to whole gold per regiment. Each
soldier also takes one person from the city that trains them.

Movement is in points. Entering a tile costs 2 on plains, 3 in forest, hills
or desert, and 4 in mountains, so infantry cover 6 tiles of open ground, 4 of
rough ground or 3 of mountains a turn, and cavalry 8, 5 or 4. An army may
enter a tile only if it has the points, except that it can always take one
step at the start of its turn.

**Zone of control.** Every army controls the tiles next to it. An enemy army
that moves into one of those tiles must stop there for the rest of the turn:
it can still attack from there, but it can't walk past. Next turn it may move
on or pull back. The same holds for the AI and for march orders.

Newly trained regiments can't move until your next turn. They're marked New
and aren't ticked for orders, so the rest of the army can leave without them.

**March orders.** Right-click a tile beyond this turn's reach to send the
chosen regiments marching there. They move as far as they can at once. After
that, a marching army takes its next step **at the end of each of your
turns**, with whatever movement it has left, so you can still use it during
your turn and the march carries on from wherever it ends up. The route is
drawn on the map in a different colour for each turn of the journey (gold,
then orange, red, purple and on), with a dot where each turn's march ends. A
march stops when the army arrives, when its way is blocked, or when an enemy
army is next to it.

When an army moves onto a friendly army, the two merge: on the map, the
moving army walks there and joins it.

Every soldier also costs one person from the city that trains them (200, 160
or 120 per regiment), and a city can't go below 1,000 people.

Every faction starts with free armies, ready to move on turn 1: a regiment
each of Archers and Cavalry in its capital, and a regiment of Spearmen
garrisoning each of its other cities. They're set by `STARTING_ARMIES` in
`src/data/gameSetup.ts`.

Soldiers are trained as **regiments** of one unit type (200 Spearmen, 160
Archers or 120 Cavalry), from
the Recruitment tab of a city's panel: click a unit's card to queue it. Each
city has a **recruitment queue** of up to 6 orders, shared by training and
retraining. Orders are paid for in gold when queued and take their people
from the city when completed. At the end of each of your turns the city
trains **one new regiment** (the first training order in the queue), which
joins the army there, ready to move next turn, and retrains **every**
regiment queued for retraining, wherever it sits in the queue. Every order can
be cancelled (its ×) for a full refund. Training waits if the city hasn't the
people to spare or the army there is full, and the whole queue stops while
the city is besieged. A regiment never grows past its full size; battle losses shrink it.
An **army** is a stack of up to 10 regiments on one tile (so at most 2,000
soldiers), and only one army can stand on a tile. New regiments join the army
on their city's tile.

Selecting an army chooses every regiment in it, so a stack always moves at the
pace of its slowest regiment and stops once any regiment is out of moves.
Faster regiments keep their leftover movement: leave the others out (click
their boxes) to send them on alone, which splits the army. Stopping on a friendly army merges into it,
if the combined stack has room. Ending your turn clears the selection.

**Merging.** Damaged regiments of the same type can be merged into fuller
ones: 120 and 140 Spearmen become 200 and 60. Full regiments are left alone.
It's free and takes no movement, but a merged regiment moves at the pace of
the slowest one that went into it.

**Retraining.** Damaged regiments in an army standing in one of your cities
can be brought back to full strength there: in the city panel's Retraining
tab, choose them and queue them. They sit in the city's recruitment queue
alongside training, but don't wait their turn: everything queued for
retraining is back to full strength next turn, however much training is
queued ahead of it. It costs what training the missing soldiers would: their
gold when queued, and people from the city when done. A regiment that leaves
the city (or is lost) is dropped from the queue and refunded at once.

Upkeep is paid at the end of each of your turns, after income. If the treasury
can't cover it, you go into debt: gold goes below zero. While in debt you can't
train new regiments, but your armies stay intact.

Armies attack an enemy army, or an enemy city with no army in it, which
captures the city and all its land. The target can be anywhere the army can
reach this turn: it marches to the tile next to the target that leaves it the
most movement, and attacks from there, as long as it has movement left when it
arrives. A city's defense is the army
standing in it; storming a city is one battle, with the defender getting the
city bonus of +10%, plus its walls, on top of terrain. A faction with no cities left is eliminated.

**Joint battles.** Every army within one tile of either the attacker or the
defender joins the battle on its own side. The attacker's other armies bring
their regiments that can still move; the defender's other armies bring all of
theirs, since defending takes no movement. Each side's losses are shared
across its regiments in proportion to size, and a beaten side loses every
army that fought. Every attacking army uses up its turn. If the attackers win
a battle for a city, the leading army's survivors march in and capture it;
supporting armies stay where they are. The battle panel shows how many armies
would fight on each side, and the odds count them all.

**Besieged garrisons.** A garrison shut in by a siege can only attack the
besieging faction's armies next to its city: it can break out against the
besiegers, but can't march out to attack anyone else, and only joins battles
against its besiegers.

**Sieges.** Click an enemy city with an army selected, and the army marches
up to it (if it's in reach this turn) and lays siege. Declaring the siege
itself doesn't use movement. The siege screen then opens, showing the city's
supplies, its garrison, your forces around it and the odds of storming the
walls now. **Continue the siege** closes the screen and keeps the siege going;
**Storm the city** opens the battle panel; **Withdraw** lifts the siege, and the
city starts restocking. Clicking a city you're already besieging reopens the
screen. A city in sight with no garrison is simply taken.

A besieged city earns no gold, doesn't grow and can't train. From the first
turn of the siege it suffers **attrition**: its garrison loses 5% of its
soldiers and the city 1% of its people each turn. Every city holds supplies:
3 turns for a level-1 city, 4 at level 2 and 5 at level 3, and a turn more for
a capital. Each turn under siege uses one, and **when they run
out the city surrenders**: it goes to the besieger with all its land, its
garrison is destroyed, and the besieger's strongest army next to it marches
in. The siege holds as long as the besieger ends its turn with an army next to
the city; otherwise it's lifted, and the city restocks one turn of supplies per
turn. The defenders can break a siege by attacking the besiegers, and a relief
army can do the same from outside.

In a battle, each regiment's soldiers are multiplied by its matchup against
the enemy's mix of unit types: ×1.5 against the type it beats, and unchanged
otherwise, weighted by how many soldiers of each type the enemy has. Only the
side with the advantage gets a multiplier, so an army needs about 1.5 times as
many soldiers to beat its counter. A mixed army has no single counter. The
defender also gets its terrain's defense bonus (forest +10%, hills +15%,
mountains +25%), plus 10% in a city and its walls (+15%, +30% or +50%).
They're all added, so a hill city with stone walls defends at
15% + 10% + 30% = +55%. Each side gets a small random factor.

Before any attack on an army, the **battle panel** shows who would fight
(including armies joining in), each side's soldiers by unit type and
strength, the defender's terrain and city bonuses, your chance of victory,
and the likely losses either way. The chance is worked out exactly from the
rules above, random factor included. Choose Fight or Withdraw.

After any battle you take part in, whether you attacked or an AI attacked you
during its turn, a **result screen** shows who won, both sides' forces, what
each lost, and any city that changed hands. Several results are shown one
after another. Battles between AI factions only appear in the log. The stronger side wins and
the loser is wiped out; the winner loses more soldiers the closer the fight was,
spread across its regiments.

The numbers are in `src/data/units.ts` and `src/data/combat.ts`.

## AI

Each AI faction decides one action at a time, looking at the game afresh
each time, and uses the same actions as the player. In order of priority:

0. **Merge** damaged regiments of the same type.
1. **Attack** wherever the odds are good (its strength, counting every army that
   would join in, beats the defender's by 20%), marching up to the target first
   if it's in reach this turn. Garrisons only attack with
   regiments they can spare, unless their city is besieged: then they sally.
2. **Retreat**: a field army next to a stronger enemy falls back toward home.
3. **Launch**: surplus regiments in its muster city (the one nearest its
   target) march out once they're big enough to survive a sally by the
   target's garrison.
4. **Advance**: field armies march on the target along the cheapest route,
   besiege it on arrival, and wait for it to surrender or for good odds to storm
   it. With no target, they come home.
5. **Defend**: replenish battered garrisons, and train garrisons sized to the
   enemy field armies nearby, countering the nearest one.
6. **Build**: walls near enemies, then advancing the city, then markets and
   farms (see Building below).
7. **Field regiments** at the muster city that counter the target's
   defenders. Training keeps upkeep under 75% of income, except to garrison
   an empty or threatened city.

**Defending comes first.** When one of its own cities is besieged, the AI
drops everything to relieve it: it raises taxes to pay for the war, trains a
relief force that counters the besiegers in its nearest free city (whatever
the upkeep), sends everything that city can spare, and marches every field
army to the besieged city. Armies besieging its cities are attacked at even
odds, the garrison sallies at even odds, and once the city is two turns from
surrendering, garrison and relief attack at poor odds. On its last turn of
supplies the garrison makes a **last stand**, attacking the besiegers at any
odds: it would be destroyed in the surrender anyway.

**Building.** After its garrisons, the AI builds: walls in cities with
enemies nearby, otherwise advancing the city, then markets, mines (where
there are at least three hills or mountain tiles to dig) and farms. Once it
has five regiments per city, it holds back new field regiments to save for a
building it could afford within ten turns of income. Field regiments for its
campaign come last.

The target is the enemy city that's cheapest to take (fewest defenders, short
distance), reachable over land, and not already besieged by someone else. The numbers are in `src/data/ai.ts`.

## Regenerating the Europe map

The terrain in `src/map/europe/europeTerrain.ts` is generated by
`tools/build_europe_map.py`. Coastlines come from Natural Earth's 1:50m land
outlines (public domain); mountain ranges, deserts, forests and hills are
drawn from rough outlines in the script, so you can edit them there. The
script also widens every one-hex strip of land between two stretches of water
by filling in the adjoining coast, so there are no single-file choke points.
To rebuild:

```
pip install shapely
curl -L -o tools/ne_50m_land.geojson \
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson
python3 tools/build_europe_map.py
```

## Fog of war

You see the land around your cities (3 tiles), around your armies (2 tiles, or
3 if they include cavalry), and all of your own territory. Everywhere else is
dimmed and enemy armies are hidden, including the garrisons of cities you
can't see. The map and the cities on it are always known. The AI plays under
the same fog: it decides using only what it can see. Because orders are
planned on what you can see, a move can run into an army hidden in the fog;
the game tells you when that happens. The ranges are in `src/data/vision.ts`.

## The 3D map

The map is drawn in 3D with three.js, under a tilted campaign camera. Hills
and mountains stand above the plains, mountains carry peaks and forests
trees, and the sea sits below the coast. Cities are walled towns with a
banner in their owner's colours and a name plate. Each army is a single
standard-bearer carrying a banner with its strength. Territory, fog, move and attack highlights, the selected tile, march
routes and sea crossings are drawn on the terrain.

The map needs WebGL. If the browser has it turned off, the game says so.

three.js is loaded straight from `node_modules` through the import map in
`index.html`, so there's still no bundler: run `npm install` once and it's
there.

**Using real models.** The models are built in code, so the game needs no
model files. To use real ones, put `.glb` files in the `models` folder and
list them in `models/models.json`; see `models/README.md`. Anything not
listed keeps its built-in model.

## Taking cities

Whenever you take a city (storming it, walking into an empty one, or a
surrender), you choose its fate:

| Choice          | Its people                                              | Plunder            |
|-----------------|---------------------------------------------------------|--------------------|
| **Occupy**      | Kept as they are                                        | 5 gold per 1,000   |
| **Enslave**     | 25% sent to your other cities (shared evenly), 10% lost | 15 gold per 1,000  |
| **Exterminate** | 50% killed                                              | 40 gold per 1,000  |

Plunder grows by 50% for each city level above 1, and is always worked out
from the city's population when it falls, so a city that's already been
sacked yields much less. A 10,000-person level-2 city gives 75, 225
or 600 gold. You must decide before ending your turn; a city that surrenders
at the end of your turn is decided at the start of your next. The AI
exterminates when it's short of gold, enslaves when it has other cities to
fill, and otherwise occupies. The numbers are in `src/data/conquest.ts`.

## How armies look

On the map, each army is one standard-bearer in its faction's colours,
carrying a banner that shows the army's strength in soldiers, with a pip for
each regiment, whatever the army is made of. Armies stand still; when one
moves (your orders, an AI's, or a march), it walks there tile by tile over
land, turned the way it's going, with the banner kept facing you. Spent
armies are faded. An army standing in its own city isn't drawn as a figure:
the city's banner shows its garrison instead, with the soldiers' number and a
pip per regiment, like an army's flag. An undefended city's banner hangs grey
at half-mast. (Enemy cities you can't see into fly a plain banner, so the fog
gives nothing away.) Selecting a city's garrison doesn't choose its
regiments: click the ones you want to march out.

In the panels, regiments are shown as boxes with their unit type's figure and
a strength bar: in the army panel (click a box to include or leave out that
regiment), and in a city's Recruitment and Retraining tabs, each with a
queue: the regiment training this turn, and the regiments queued for
retraining. The panel figures are in `src/render/figures.ts`.
