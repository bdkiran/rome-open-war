# Unlimited War

A browser-based, turn-based grand strategy game, set in the Roman world of
218 BC.

## Getting started

You need Node.js (version 18 or newer) and a browser with WebGL turned on.

```
npm install
npm run dev
```

Then open http://localhost:3000. Press Ctrl+C to stop.

Run `npm install` again whenever `node_modules` is missing, for example after
replacing the project folder from a zip. Opening `index.html` directly from
disk does not work: browsers block the game's modules when loaded from
`file://`. After `npm run build`, any static file server works instead of
`npm run dev`, for example `python3 -m http.server`.

The game draws its own models for armies and cities. To use real 3D models
instead, see `models/README.md`.

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

## Controls

- Drag or use arrow keys / WASD to pan
- Scroll to zoom; you can zoom out until the whole map fits, and the view
  stays on the map
- Click a tile, city or army to inspect it; Escape clears the selection. The
  panel at the top left shows its details; the **bar along the bottom**
  shows its cards: **Army** for an army's regiments (a city's garrison, or a
  field army) and **Town** for the buildings a city has built
- Select one of your cities to open its panel: its details, the tax rate
  (the arrows lower or raise it), and the Construction (what it can build
  next), Recruitment and Retraining tabs
- **Left click selects; right click gives orders.** Left-click one of your
  armies (its regiment cards in the bottom bar choose which regiments to
  order), then
  right-click a highlighted tile to move there or a red tile to attack it. Red
  tiles include enemies the army can march up to this turn; it moves next to
  them and attacks in one go. Attacking an army opens the battle panel with
  the odds: Fight or Withdraw (Escape also withdraws). Right-clicking an enemy
  city lays siege to it (marching up first if needed) and opens the siege
  screen
- Right-click a distant tile to send the selected army marching there over
  several turns; Cancel march in the army panel stops it
- Tab and Shift+Tab (or the ◀ Cities ▶ buttons) step through your cities
- The top-right panel lists every faction with its people, soldiers and gold;
  click the income line under your treasury for a breakdown of where your
  money comes from (each city's base, people and mine gold, times its taxes
  and market) and where it goes (each army's upkeep)
- **Reports** (right, under the faction list): at the start of each turn, what happened since
  your last one arrives as notifications: battles, sieges and cities involving
  you, your finished buildings and recruits, and world news (cities changing
  hands, factions falling). Click one to read it, × to dismiss it. They
  last only that turn: ending your turn clears them
- In the bottom bar's Army tab: Merge combines damaged regiments of the same
  type. Leave some regiments unticked to split the army; move onto a
  friendly army to merge
- End turn with the button or Enter

## The map

The map is drawn in 3D under a tilted campaign camera. Hills and mountains
stand above the plains, mountains carry peaks and forests trees, and the sea
sits below the coast. Cities are walled towns with a banner in their owner's
colours and a name plate; they grow with their level, and their walls appear
once built. Territory, fog, move and attack highlights, the selected tile,
march routes and sea crossings are drawn on the terrain.

Each army is one standard-bearer in its faction's colours, carrying a banner
that shows the army's strength in soldiers, with a pip for each regiment.
Armies stand still; when one moves (your orders, an AI's, or a march), it
walks there tile by tile. Spent armies are faded. An army standing in its own
city isn't drawn as a figure: the city's banner shows its garrison instead.
An undefended city's banner hangs grey at half-mast. (Enemy cities you can't
see into fly a plain banner, so the fog gives nothing away.) Selecting a
city's garrison doesn't choose its regiments: click the ones you want to
march out.

In the panels, regiments are shown as boxes with their unit type's figure and
a strength bar: in the bottom bar's Army tab (click a box to include or leave
out that regiment), and in a city's Recruitment and Retraining tabs.

**Fog of war.** You see the land around your cities (3 tiles), around your
armies (2 tiles, or 3 if they include cavalry), and all of your own
territory. Everywhere else is dimmed and enemy armies are hidden, including
the garrisons of cities you can't see. The map and the cities on it are
always known. The AI plays under the same fog. Because orders are planned on
what you can see, a move can run into an army hidden in the fog; the game
tells you when that happens.

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
  1,000. The largest city on the map, all-plains Lutetia, has land for about
  60,000.
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
No city starts with a Spear yard, Archery range or Stables: every city trains
militia until it builds one.

| Building | Effect per level (1 / 2 / 3)                               | Cost (1 / 2 / 3)     | Turns     |
|----------|------------------------------------------------------------|----------------------|-----------|
| Spear yard    | Trains basic / advanced / elite spearmen | 150 / 300 / 500 gold | 2 / 3 / 4 |
| Archery range | Trains basic / advanced / elite archers  | 200 / 350 / 550 gold | 2 / 3 / 4 |
| Stables       | Trains basic / advanced / elite cavalry  | 250 / 400 / 650 gold | 2 / 3 / 4 |
| Walls    | +15% / +30% / +50% defense, on top of the city's 10%       | 200 / 400 / 700 gold | 2 / 3 / 4 |
| Farms    | +20% / +40% / +60% population growth                       | 150 / 300 / 550 gold | 2 / 3 / 4 |
| Market   | +30% / +60% / +100% gold                                   | 150 / 300 / 500 gold | 2 / 3 / 4 |
| Mine     | +2 / +4 / +6 gold per hills or mountain tile in its land   | 200 / 400 / 700 gold | 2 / 3 / 4 |
| Port     | +20% / +40% / +60% growth, times the city's share of sea (cities whose land touches the sea) | 200 / 400 / 650 gold | 2 / 3 / 4 |
| Roads    | Faster movement across the city's land, for every army (see Movement) | 150 / 300 / 500 gold | 2 / 3 / 4 |

A mine can only be built in a city whose territory has hills or mountains, so
it's worth a lot in hill country and nothing on the plains; the Construction
tab shows how many tiles it can dig and what the next level would earn. Its
gold counts toward the city's income before taxes and the market, so both
multiply it.

A **port** can be built by any city with sea on its coast: sea within its
reach, or touching any tile of its land, however far from the city itself.
Its growth bonus is scaled by how much of the city's reach is sea (its coast
against its coast and land together), so Lilybaeum, nearly all sea, gets
almost the full bonus, and a city with a strip of coast only a little. It
adds to the farms' bonus.

Build from the city panel's Construction tab: click a building to queue its
next level. The **construction queue** holds up to 5 buildings, built one
after another and paid for when queued; work goes on at the end of each of
your turns and stops while the city is besieged. You can queue several levels
of the same building (walls 1, then walls 2), but only a **finished**
government unlocks the next level of the others: a level-3 building can't be
queued until the Senate is built. Cancelling a building (its ×) refunds it,
along with any later levels of it queued behind it. A captured city keeps its
buildings but loses whatever was being built.

**Tax rate.** Each city has its own tax rate, set with the arrows in its
panel. It trades gold for growth:

| Tax rate | City's gold | Population growth |
|----------|-------------|-------------------|
| Low      | ×0.6        | ×1.5              |
| Normal   | ×1          | ×1                |
| High     | ×1.5        | ×0.5              |

High taxes slow a city's growth but never make it shrink. A captured city
goes back to normal taxes.

## Armies

Spearmen, archers and cavalry form a rock-paper-scissors triangle. Militia
stand outside it: big, cheap regiments that beat nothing, and that every
other unit beats.

| Unit     | Movement | Beats             | Loses to             | Regiment     | Cost per regiment (basic) | Upkeep per regiment (basic) | Trained in       |
|----------|----------|-------------------|----------------------|--------------|---------------------------|-----------------------------|------------------|
| Militia  | 12       | nothing           | everything else      | 220 soldiers | 110 gold                  | about 2 gold a turn         | any city         |
| Spearmen | 12       | Cavalry, militia  | Archers              | 180 soldiers | 180 gold                  | about 4 gold a turn         | a Spear yard     |
| Archers  | 12       | Spearmen, militia | Cavalry              | 160 soldiers | 320 gold                  | 5 gold a turn               | an Archery range |
| Cavalry  | 16       | Archers, militia  | Spearmen             | 120 soldiers | 360 gold                  | 6 gold a turn               | Stables          |

Any city can train militia. Spearmen, archers and cavalry each need their own
building, which even a level-1 city can build. Each level of that building
unlocks a better **tier** of its unit:

| Tier     | Building level | Each soldier fights like | Gold and upkeep | People |
|----------|----------------|--------------------------|-----------------|--------|
| Basic    | 1              | 1 basic soldier          | ×1              | same   |
| Advanced | 2 (level-2 city) | 1.3                    | ×1.5            | same   |
| Elite    | 3 (level-3 city) | 1.6                    | ×2.1            | same   |

So a regiment of elite spearmen (180 soldiers, 378 gold, about 8 gold a turn)
fights like 288 basic spearmen: a little dearer per gold, much cheaper per
person. A regiment keeps the tier it was trained at, and is marked II or III
in its box. Militia come in one tier. A regiment of militia loses to one of
spearmen or archers, but beats one of cavalry: cavalry beat militia soldier
for soldier, but a militia regiment is almost twice as big. Militia are the
cheapest strength in gold, and the dearest in people.

Every faction starts with a regiment each of Archers and Cavalry in its
capital, and a regiment of Spearmen garrisoning each of its other cities,
ready to move on turn 1.

**Training.** Soldiers are trained as **regiments** of one unit type from the
Recruitment tab of a city's panel: click a unit's card to queue it. Each city
has a **recruitment queue** of up to 6 orders, shared by training and
retraining. Orders are paid for in gold when queued, and each soldier takes
one person from the city when completed (a city can't go below 1,000 people).
At the end of each of your turns the city trains **one new regiment** (the
first training order in the queue), which joins the army there, ready to move
on your next turn. Every order can be
cancelled (its ×) for a full refund. Training waits if the city hasn't the
people to spare or the army there is full, and the whole queue stops while
the city is besieged.

**Retraining.** Damaged regiments in an army standing in one of your cities
can be brought back to full strength there: in the city panel's Retraining
tab, choose them and queue them. They don't wait their turn: everything
queued for retraining is back to full strength next turn, however much
training is queued ahead of it. It costs what training the missing soldiers
would. A regiment that leaves the city (or is lost) is dropped from the queue
and refunded at once.

**Upkeep** is paid at the end of each of your turns, after income. If the
treasury can't cover it, gold goes below zero: while in debt you can't train
new regiments, but your armies stay intact.

**Stacks.** An **army** is a stack of up to 10 regiments on one tile, and
only one army can stand on a tile. Selecting an army chooses every regiment
in it, so a stack moves at the pace of its slowest regiment. Leave some out
(click their boxes) to send the rest on alone, which splits the army.
Stopping on a friendly army merges into it, if the combined stack has room.

**Merging.** Damaged regiments of the same type and tier can be merged into fuller
ones: 120 and 140 Spearmen become 180 and 80. Full regiments are left alone.
It's free and takes no movement, but a merged regiment moves at the pace of
the slowest one that went into it.

**Movement** is in points. Entering a tile costs 2 on plains, 3 in forest,
hills or desert, and 4 in mountains, so infantry cover 6 tiles of open
ground, 4 of rough ground or 3 of mountains a turn, and cavalry 8, 5 or 4. An
army may enter a tile only if it has the points, except that it can always
take one step at the start of its turn.

**Roads** make a city's land cheaper to cross, for every army that marches
through it, enemies included:

| City's roads      | Plains | Forest, hills, desert | Mountains |
|-------------------|--------|-----------------------|-----------|
| None              | 2      | 3                     | 4         |
| Tracks (1)        | 2      | 2                     | 4         |
| Roads (2)         | 2      | 2                     | 2         |
| Paved roads (3)   | 1      | 1                     | 1         |

**Zone of control.** Every army controls the tiles next to it. An enemy army
that moves into one of those tiles must stop there for the rest of the turn:
it can still attack from there, but it can't walk past.

**March orders.** Right-click a tile beyond this turn's reach to send the
chosen regiments marching there. They move as far as they can at once, then
take their next step **at the end of each of your turns** with whatever
movement they have left, so you can still use the army during your turn. The
route is drawn in a different colour for each turn of the journey, with a dot
where each turn's march ends. A march stops when the army arrives, when its
way is blocked, or when an enemy army is next to it.

## Battles

Armies attack an enemy army, or an enemy city with no army in it, which
captures the city. The target can be anywhere the army can reach this turn:
it marches up and attacks, as long as it has movement left when it arrives.

In a battle, each regiment's soldiers are multiplied by its matchup against
the enemy's mix of unit types: ×1.5 against the type it beats, weighted by
how many soldiers of each type the enemy has. Only the side with the
advantage gets a multiplier, so an army needs about 1.5 times as many
soldiers to beat its counter. A mixed army has no single counter. The
defender also gets its terrain's defense bonus (forest +10%, hills +15%,
mountains +25%), plus 10% in a city and its walls (+15%, +30% or +50%).
They're all added, so a hill city with stone walls defends at
15% + 10% + 30% = +55%. Each side gets a small random factor. The stronger
side wins and the loser is wiped out; the winner loses more soldiers the
closer the fight was.

**Joint battles.** Every army within one tile of either the attacker or the
defender joins the battle on its own side: the attacker's other armies bring
their regiments that can still move, the defender's bring all of theirs. A
beaten side loses every army that fought, and every attacking army uses up
its turn. If the attackers win a battle for a city, the leading army marches
in and captures it.

Before any attack on an army, the **battle panel** shows who would fight,
each side's strength, the defender's bonuses, your exact chance of victory
and the likely losses. Choose Fight or Withdraw. After any battle you take
part in, including an AI's attack on you, a **result screen** shows who won
and what each side lost.

## Sieges

Right-click an enemy city with an army selected, and the army marches up to
it and lays siege (declaring the siege uses no movement). The siege screen
shows the city's supplies, its garrison, your forces around it and the odds
of storming the walls now:

- **Continue the siege** keeps the siege going.
- **Storm the city** opens the battle panel.
- **Withdraw** lifts the siege, and the city starts restocking.

Clicking a city you're already besieging reopens the screen. A city in sight
with no garrison is simply taken.

A besieged city earns no gold, doesn't grow, can't train or build, and from
the first turn suffers **attrition**: its garrison loses 5% of its soldiers
and the city 1% of its people each turn. Every city holds supplies: 3 turns
at level 1, 4 at level 2 and 5 at level 3, and a turn more for a capital.
Each turn under siege uses one, and **when they run out the city
surrenders**: its garrison is destroyed and the besieger's strongest army
next to it marches in. The siege holds as long as the besieger ends its turn
with an army next to the city; otherwise it's lifted, and the city restocks
one turn of supplies per turn.

A besieged garrison is shut in: it can't leave the city, and can only attack
the besiegers next to it and join battles against them. The defenders can break a siege by attacking the
besiegers, and a relief army can do the same from outside.

## Taking cities

Whenever you take a city (storming it, walking into an empty one, or a
surrender), you choose its fate:

| Choice          | Its people                                              | Plunder            |
|-----------------|---------------------------------------------------------|--------------------|
| **Occupy**      | Kept as they are                                        | 5 gold per 1,000   |
| **Enslave**     | 25% sent to your other cities (shared evenly), 5% lost  | 15 gold per 1,000  |
| **Exterminate** | 50% killed                                              | 40 gold per 1,000  |

Plunder grows by 50% for each city level above 1, and is always worked out
from the city's population when it falls, so a city that's already been
sacked yields much less. A 10,000-person level-2 city gives 75, 225 or 600
gold. You must decide before ending your turn; a city that surrenders at the
end of your turn is decided at the start of your next. A faction with no
cities left is eliminated.

## Your opponents

The AI factions play by the same rules and under the same fog as you. What
to expect from them:

- They attack when the odds are good (about 20% stronger, counting every army
  that would join in), retreat from stronger armies, and march on the enemy
  city that's cheapest to take, whoever owns it. They besiege it and wait for
  it to surrender or for good odds to storm it.
- **They defend their cities hard.** When one is besieged, they raise taxes,
  train a relief force that counters the besiegers, and march every field
  army to it. The garrison sallies at even odds, attacks at poor odds once
  surrender is two turns away, and makes a **last stand** at any odds on its
  final turn of supplies.
- They garrison cities against nearby enemies, build walls near their
  borders, advance their cities, build markets, then a spear yard, archery
  range and stables, then mines, farms, ports and, last, roads. They train
  the best tier of a unit they can afford to keep.
- They raise taxes when in debt and lower them once recovered, and tax a
  city high once it's full (it can't grow anyway). When they
  take a city, they exterminate when short of gold, enslave when they have
  other cities to fill, and otherwise occupy.

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

## Development

Working on the code? See `AGENTS.md` for the commands, architecture, testing
and the rules the code must keep, and `docs/DECISIONS.md` for why the game
works the way it does.
