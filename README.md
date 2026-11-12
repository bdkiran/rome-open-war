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

You play the **Roman Republic** on the eve of the Second Punic War. Fifteen
AI powers share the map with you, some with many cities and some with few:

| Faction                | Cities (capital first)                  |
|------------------------|-----------------------------------------|
| Roman Republic (you) | Roma, Arretium, Ariminum, Capua |
| Samnite League | Tarentum, Croton, Messana |
| Carthage | Carthago, Lilybaeum, Thapsus, Carales, Corduba |
| Kingdom of Macedon | Pella, Bylazora |
| Greek Leagues | Corinthus, Syracusae, Pergamum |
| Seleucid Empire | Antiochia, Seleucia, Damascus, Sardis, Tarsus, Sidon |
| Ptolemaic Egypt | Alexandria, Memphis, Cyrene |
| Gallic Tribes | Alesia, Lemonum, Mediolanum, Patavium, Narbo Martius, Numantia |
| Kingdom of Numidia | Cirta, Tingis |
| Germanic Tribes | Batavodurum, Damme, Marcomannia |
| Scythian Kingdom | Tanais, Alania, Sarmatia |
| Odrysian Thrace | Tylis, Getae, Byzantion |
| Iberian Tribes | Asturica, Carthago Nova, Osca |
| Britons | Londinium, Eburacum, Deva, Samarobriva |
| Dacian Kingdom | Porolissum, Iazyges |
| Kingdom of Pontus | Amaseia, Sinope, Trapezus |

The map runs from Iberia to Syria and from Egypt to the North Sea; Seleucia,
beyond its eastern edge, stands on the edge. A few crowded cities stand a
little way from their real sites, so each has land enough to grow. Dashed lines mark **sea
crossings** that armies can step across like any other move: the Pillars of
Hercules, the Strait of Messina (Sicily to Italy), Sicily to Africa, the
Channel, Corsica to Sardinia, Corsica to Italy, Sardinia to Africa, the
Bosporus and the Hellespont. Sicily is a round island shared by the Samnites
(Messana, in the north-east), the Greeks (Syracusae, south-east) and
Carthage (Lilybaeum, west). A narrow sea from the Hellespont to the
Bosporus divides Europe from Asia, with Byzantion on the European shore.
Every city can be reached from every other.

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
  (the arrows lower or raise it), what it's building and training, and
  buttons for the **city screen**: a large window over the map with the
  Construction (what it can build next), Recruitment and Retraining tabs.
  Tab, Shift+Tab or its ◀ ▶ buttons step through your cities without
  closing it; Escape, × or a click outside it goes back to the map
- **Left click selects; right click gives orders.** Left-click one of your
  armies (its regiment cards in the bottom bar choose which regiments to
  order), then
  right-click a highlighted tile to move there or a red tile to attack it. Red
  tiles include enemies the army can march up to this turn; it marches up
  first, and the battle panel opens once it's there, with the odds as seen
  from there: Fight or Withdraw (Escape also withdraws). Right-clicking an enemy
  city lays siege to it (marching up first if needed) and opens the siege
  screen
- Right-click a distant tile to send the selected army marching there over
  several turns; Cancel march in the army panel stops it
- Tab and Shift+Tab (or the ◀ Cities ▶ buttons) step through your cities
- The top-right panel lists every faction with its people, soldiers and gold;
  click the income line under your treasury for a breakdown of where your
  money comes from (each city's base, people, mine and farm gold and its trade,
  times its market and taxes) and where it goes (each army's upkeep)
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
stand above the plains, mountains carry peaks and forests trees, hills roll,
plains are patched with fields and deserts ridged with dunes, and the sea sits
below the coast, sand beaches along the shore and lighter shallows off it. Cities are towns in their owner's style (tiled Roman
and Greek houses, flat-roofed Punic ones, Celtic roundhouses, Thracian timber
houses) with a banner in their owner's colours and a name plate. They gain
houses and civic buildings with each level (a temple or hall, then a basilica
and a theatre), and their walls appear once built: a palisade, then stone
walls with towers (an earth rampart for Celts and Thracians), then great
walls. On your own cities' plates, a figure beside the population shows
how it's moving (green: rising fast; yellow: slowly or not at all; red:
falling), a hammer shows something is being built, and crossed swords that
regiments are training. Territory, fog, move and attack highlights, the selected tile,
march routes and sea crossings are drawn on the terrain.

Each army is one soldier in its faction's colours, equipped in its culture's
style: Romans with a crested helmet, curved shield and short sword;
Hellenistic kingdoms (Macedon, the Greeks, the Seleucids, Egypt, Pontus) with
a Corinthian helmet, round shield and long spear; Carthage and Numidia with a
conical helmet, oval shield and spear; the Gauls, Iberians, Britons and
Germans bare-headed with a tall oval shield and long sword; Thrace, Dacia and
Scythia with a curving cap, crescent shield and curved blade. This is only a
look; it doesn't change how they fight. Beside each soldier a banner shows the army's
strength in soldiers, with a pip for each regiment.
Armies stand still; when one moves (your orders, an AI's, or a march), it
walks there tile by tile. Spent armies are faded. An army standing in its own
city isn't drawn as a figure: the city's banner shows its garrison instead.
An undefended city's banner hangs grey at half-mast. (Enemy cities you can't
see into fly a plain banner, so the fog gives nothing away.) Selecting a
city's garrison doesn't choose its regiments: click the ones you want to
march out.

In the panels, regiments are shown as boxes with their unit type's figure and
a strength bar (better-trained regiments are better equipped: a mail shirt
at Advanced, a bronze cuirass, cloak and taller crest at Elite): in the bottom bar's Army tab (click a box to include or leave
out that regiment), and in a city's Recruitment and Retraining tabs.

**Fog of war.** You see the land around your cities (3 tiles), around your
armies (2 tiles, or 3 if they include cavalry), and all of your own
territory. Sight spreads over land, but whoever sees one shore of a sea
crossing sees the other. Everywhere else is dimmed and enemy armies are hidden, including
the garrisons of cities you can't see. The map and the cities on it are
always known. The AI plays under the same fog. Because orders are planned on
what you can see, a move can run into an army hidden in the fog: your army
goes as far as it can and halts where that army blocks it (in its zone of
control, or just short of it), which brings it into sight.

**Watching enemy turns.** Whatever the other factions do within your
sight plays out on the map, one move at a time: the camera glides to it,
their armies march (faster than yours), and battles flash on the
battlefield with a banner naming who fought and how it ended. A battle you
fought opens its result before they carry on. Moves in the fog stay
hidden. Press Space or Esc to skip to your turn; the camera then returns to
where you left it.

**Scouts.** A level 2 city can train a scout from its Recruitment tab, for 100
gold and 4 gold a turn: a lone spy, not a regiment, shown in a dark hooded
cloak with no weapons. It moves 20 points a turn
(cavalry move 16), sees 5 tiles, ignores zones of control, and rides through
armies and cities, enemy ones too. It never fights, blocks nothing, and can't be
killed; it only goes if its faction falls, or if you click Dismiss in the
bottom bar (no refund). It can't share a tile with another of your scouts. Select
it (with an army or city on its tile, open the bar's Scout tab) and right-click
a highlighted tile to move it: within one turn's reach, as it can't take march
orders. Enemy scouts show only within your sight.

**Watchtowers.** Select a tile of your own region (any land drawn in your
colour, except a city) and build a watchtower there for 150 gold. It's
finished at once, costs nothing to keep and sees 3 tiles around it. It's
never destroyed: an enemy army standing on it sees through it instead of
you until it leaves, and whoever takes the city whose region it stands in
takes the tower too. There's no limit on how many you build.

## Cities and economy

Each faction starts with its cities: a capital of 6,000 people and the rest
of 3,000. No other cities are ever created. Each city claims the land within
3 tiles at the start, and its territory never changes. Cities are spread
apart so their land doesn't overlap: a city closer than 7 tiles to another is
moved up to 4 tiles from its real spot. Where even that isn't enough (in
crowded Italy, Greece or Sicily), neighbours split the land between them,
each tile going to the nearer city. So some cities hold far more land than
others.

The map leaves no gaps between territories: every other land tile is drawn,
in a fainter tint, in the region of the nearest territory, and borders run
around whole regions. That outer land is for the map only. It earns nothing
and adds no people, mines, farms, roads or sight; only a city's territory
does. Islands with no city belong to no one.

Population grows every turn using a carrying capacity:

```
growth = baseGrowthRate × population × (1 − (population / capacity)^1.25)
```

- **Capacity** is the total number of people the city's land supports. Each
  terrain type supports a set amount: plains 1,600, forest 800, hills 650,
  mountains 200, desert 75. The sea is never claimed as land, but every sea
  tile within a city's reach (3 tiles) counts as **fishing grounds**, adding
  500.
- **The city's level caps it.** Whatever its land supports, a city can't grow
  past its level's limit until its government is raised: 8,000 people with a
  Council hall (level 1), 20,000 with a Forum (level 2), and only its land
  with a Senate (level 3). The city panel marks Capacity with ⚠ when the
  level, not the land, is what holds a city back.
- **Base growth rate** is the average of each terrain type's rate across the
  city's land and fishing grounds: plains 5.25%, forest and sea 3.675%, hills
  2.625%, mountains and desert 1.05%.

Cities grow close to their base rate while small and slow down only as they
near capacity: at half full they still grow at 58% of their rate, at three
quarters full 30%. A city over capacity shrinks. A city drained below 1,000 people
(by sacking or recruiting) still grows as if it had 1,000, so it recovers.

Each city adds a flat 5 gold per turn, plus 4 gold per 1,000 people (every person counts), plus
whatever its mine and farms bring in, plus its **trade** (see below). The land
itself pays nothing until a city builds on it: hills and mountains need a mine
and plains need farms.

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
| Spear yard    | Trains basic / advanced / elite spearmen | 135 / 300 / 500 gold | 2 / 3 / 4 |
| Archery range | Trains basic / advanced / elite archers  | 180 / 350 / 550 gold | 2 / 3 / 4 |
| Stables       | Trains basic / advanced / elite cavalry  | 225 / 400 / 650 gold | 2 / 3 / 4 |
| Walls    | +15% / +30% / +50% defense, on top of the city's 10%       | 180 / 400 / 700 gold | 2 / 3 / 4 |
| Farms    | +20% / +40% / +60% population growth, and +0.25 / +0.5 / +0.75 gold per plains tile in its land | 130 / 300 / 550 gold | 2 / 3 / 4 |
| Market   | +25% / +50% / +80% gold, and +50% / +100% / +150% trade gold | 130 / 300 / 500 gold | 2 / 3 / 4 |
| Mine     | +1 / +2 / +3 gold per hills or mountain tile in its land   | 170 / 400 / 700 gold | 2 / 3 / 4 |
| Port     | +30% / +60% / +90% growth, times the city's share of sea, and trade by sea with your other ports (cities whose land touches the sea) | 130 / 250 / 450 gold | 2 / 3 / 4 |
| Roads    | Builds the city's half of its roads: faster movement on them for every army (see Movement), and trade by land with your cities at the other end | 130 / 300 / 500 gold | 2 / 3 / 4 |

A mine can only be built in a city whose territory has at least 5 hills or
mountain tiles, so it's worth a lot in hill country and isn't on offer
elsewhere; the Construction tab shows how many tiles it can dig and what the next level would earn. Its
gold counts toward the city's income before taxes and the market, so both
multiply it. Farms work the same way for their plains, on top of their
growth: a trickle that pays for them while the growth builds up toward the
next city level.

A **port** can be built by any city with sea on its coast: sea within its
reach, or touching any tile of its land, however far from the city itself.
Its growth bonus is scaled by how much of the city's reach is sea (its coast
against its coast and land together), so Lilybaeum, nearly all sea, gets
almost the full bonus, and a city with a strip of coast only a little. It
adds to the farms' bonus.

**Trade** runs between your own cities, never a rival's, and needs the
building at both ends:

- **By land**: two of your cities joined by a road (see Movement), both
  with roads built.
- **By sea**: two of your ports no road joins, within sailing range: 6 / 16 / 40 steps
  over the sea for a Jetty / Harbour / Great harbour. A port stands on the
  shore by its city: a pier, longer at each level, with a storehouse at
  Great harbour. Each of your open sea routes is a faint lane over the water
  with a ship in your colours sailing it from port to port.

A route runs at the lower of the two cities' levels and pays each end, for
every 1,000 people at the other end, 0.4 / 0.7 / 1 gold by road or
0.5 / 0.875 / 1.25 by sea, so trading with a big city pays more. Two cities joined by a road (their land borders) trade only
by land, even when both have ports: the sea is for cities no road joins. The
market multiplies trade gold more than the rest (+50% / +100% / +150%), and
taxes apply as usual. A siege at either end shuts the route, and **an enemy
army standing on a road, or next to it, cuts it**: no gold while it stays.
You're told when one of your roads is cut and when it's open again, and a
cut road is drawn in red dashes. Scouts don't cut roads. The Construction
tab shows how many routes roads or a port would open and what they'd pay.

Build from the city screen's Construction tab: click a building to queue its
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

Every unit is a set of battle stats (see **Battles** for how they're used).
They make spearmen beat cavalry, archers beat spearmen and cavalry beat
archers. Militia are big, cheap regiments of poor fighters.

| Unit     | Movement | Attack | Armor | Special                  | Regiment     | Cost per regiment (basic) | Upkeep per regiment (basic) | Trained in       |
|----------|----------|--------|-------|--------------------------|--------------|---------------------------|-----------------------------|------------------|
| Militia  | 12       | 20     | 20    | none                     | 220 soldiers | 99 gold                   | about 2 gold a turn         | any city         |
| Spearmen | 12       | 30     | 30    | Anti-cavalry +60         | 180 soldiers | 162 gold                  | about 3 gold a turn         | a Spear yard     |
| Archers  | 12       | 10     | 10    | Ranged 60                | 160 soldiers | 216 gold                  | about 3 gold a turn         | an Archery range |
| Cavalry  | 16       | 60     | 20    | Charge +20, mounted      | 120 soldiers | 216 gold                  | about 3 gold a turn         | Stables          |

Any city can train militia. Spearmen, archers and cavalry each need their own
building, which even a level-1 city can build. Each level of that building
unlocks a better **tier** of its unit:

| Tier     | Building level | Stats | Gold and upkeep | People |
|----------|----------------|-------|-----------------|--------|
| Basic    | 1              | ×1    | ×1              | same   |
| Advanced | 2 (level-2 city) | ×1.3 | ×1.5           | same   |
| Elite    | 3 (level-3 city) | ×1.6 | ×2.1           | same   |

Every stat is multiplied, so a regiment of elite spearmen (180 soldiers, 341
gold, about 6 gold a turn) fights like 288 basic spearmen: a little dearer
per gold, much cheaper per person. A regiment keeps the tier it was trained
at, and is marked II or III in its box. Militia come in one tier. A regiment
of militia loses to one of spearmen or archers, and about matches one of
cavalry: a cavalry soldier is worth nearly two militia, but a militia
regiment is almost twice as big. Militia are the cheapest strength in gold,
and the dearest in people.

Every faction starts with two regiments of Militia and one each of Archers
and Cavalry in its capital, and a regiment each of Militia and Spearmen
garrisoning each of its other cities, ready to move on turn 1.

**Training.** Soldiers are trained as **regiments** of one unit type from the
Recruitment tab of a city's screen: click a unit's card to queue it. Each city
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
can be brought back to full strength there, if that city could train them
(the unit's building at the regiment's tier; militia anywhere): in the city screen's Retraining
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

**Experience.** Regiments that survive a battle gain experience: 2 points on
the winning side, 1 on the losing side, and none if the enemy brought under a
quarter of your side's soldiers. At 2, 3, 6, 8, 13 and 17 points a regiment
reaches levels 1 to 6, each adding +5 attack and +5 armor, shown as pips on
its box. It costs nothing to keep. Arrows ignore armor, so veterans fear archers
most. Retraining's recruits dilute experience in proportion, and merged regiments
share theirs out by soldiers.

**Merging.** Damaged regiments of the same type and tier can be merged into fuller
ones: 120 and 140 Spearmen become 180 and 80. Full regiments are left alone.
It's free and takes no movement, but a merged regiment moves at the pace of
the slowest one that went into it.

**Movement** is in points. Entering a tile costs 2 on plains, 3 in forest,
hills or desert, and 4 in mountains, so infantry cover 6 tiles of open
ground, 4 of rough ground or 3 of mountains a turn, and cavalry 8, 5 or 4. An
army may enter a tile only if it has the points, except that it can always
take one step at the start of its turn.

**Roads** run between every two cities whose land borders: the cheapest way
from one city to the other through their own land, laid out when the game
starts. A city's Roads building builds the half that runs through its own
land, and the map draws it, from a dirt track to a paved road. On a built
road, every tile costs the same whatever the terrain, for every army that
marches on it, enemies included; off the road, land costs what its terrain
does:

| City's roads      | A tile of its road |
|-------------------|--------------------|
| None              | the terrain's cost |
| Tracks (1)        | 1.5                |
| Roads (2)         | 1                  |
| Paved roads (3)   | 0.5                |

A city whose land borders no other city's has no roads to build.

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
it marches up, then attacks if it has movement left when it arrives.

A battle is fought in **rounds**:

1. **Volleys.** For two rounds only archers fight. Arrows ignore armor, which
   is why archers beat well-armored spearmen. Horsemen close fast: only the
   first volley reaches them, at half effect.
2. **Melee.** Then every regiment fights each round, killing soldiers by its
   attack over the target's armor. Spearmen add their anti-cavalry against
   horsemen. Attacking cavalry add their charge in the first melee round, on
   open ground (plains or desert) and never against a city.
3. Each regiment's blows are spread over the enemy's regiments by size, and
   each round has a large element of luck.
4. A side **breaks** once it has lost half its soldiers. The winner keeps the
   losses it took, so a one-sided win is cheap and a close one costly.

**Routs.** A beaten army **flees** up to 3 tiles, to its nearest own city in
reach or else as far from the enemy as it can get. It can't pass enemy
armies or cities, or cross the sea, and arrives with no movement left. On
the way it loses another 10% of its survivors, plus half a soldier for each
of the winner's surviving horsemen (an elite one counts 1.6). A regiment cut
down below a tenth of its strength scatters. An army with **nowhere to
flee fights to the death** and is destroyed, and so is a garrison defending
its city and a besieged garrison whose sally fails. An army that attacked
from its own city falls back inside its walls.

The defender gets its terrain's defense bonus (forest +10%, hills +15%,
mountains +25%), plus 10% in a city and its walls (+15%, +30% or +50%).
They're all added, so a hill city with stone walls defends at
15% + 10% + 30% = +55%. The defenders deal that much more and take that much
less, so +50% makes a garrison fight like one half as big again.

**Joint battles.** Every army on a tile next to the attacker or the
defender joins the battle on its own side (two armies can fight across a sea
crossing, but no one joins them from across one): the attacker's other armies bring
their regiments that can still move, the defender's bring all of theirs. A
beaten side's armies each flee (or fight to the death). **Attacking costs 6
movement** for every regiment that attacks, so a winner can move on or attack
again with what's left, while taking a city or fleeing ends its move. An army that marches through one of your own on its way
to attack fights alongside it, and it only goes through a besieged city of
yours if there's no other way. If the attackers win a battle for a city, the leading army marches
in and captures it.

Before any attack on an army, the **battle panel** shows who would fight,
each side's strength, the defender's bonuses, your chance of victory
(estimated by fighting the battle out 200 times), the likely losses either
way, and whether the loser could flee. Choose Fight or Withdraw. After any battle you take
part in, including an AI's attack on you, a **result screen** shows who won
and what each side lost.

## Sieges

Right-click an enemy city with an army selected, and the army marches up to
it and lays siege (declaring the siege uses no movement). The siege screen
shows the city's supplies, its garrison, your forces around it and the odds
of storming the walls now:

- **Continue the siege** keeps the siege going.
- **Storm the city** opens the battle panel. A walled city with a garrison
  can't be stormed until your siege works are ready (below).
- **Withdraw** lifts the siege, and the city's supplies are refilled.

Clicking a city you're already besieging reopens the screen. A city in sight
with no garrison is simply taken.

On the map a besieged city is ringed with stakes, with pennants in the
besieger's colours, and the besieging soldiers strike once as the siege
starts, then face it with weapons raised.

A besieged city earns no gold, doesn't grow and can't train or build. The
turn a siege is laid costs it nothing more. From the first full turn it suffers
**attrition**: its garrison loses 5% of its soldiers and the city 1% of its
people each turn. Every city holds supplies: 3 turns at level 1, 4 at level 2
and 5 at level 3, and a turn more for a capital. Each full turn under siege
uses one, and **when they run out the city surrenders**: its garrison is destroyed and the besieger's strongest army
next to it marches in. The siege holds as long as the besieger ends its turn
with an army next to the city; otherwise it's lifted. It's also **broken at
once if the besiegers lose a battle** at the city or next to it: a failed
storm, a successful sally or a relief force beating them. A faction that
falls ends all its sieges. If the **garrison
dies**, in a failed sally, beside a relief force or to attrition, the besieger's
strongest army next to the city marches in at once and takes it, whoever's turn
it is; a city taken on another's turn has its fate decided on your own. However a siege
ends, the city's supplies are refilled at once, so another siege starts from
full stores.

**Siege works.** A garrisoned city with walls can only be stormed by its
besieger, and only with enough siege works: 1 point for a palisade, 2 for
stone walls, 3 for great walls. An empty walled city and a city with no walls
can be taken at once. At the end of each of your turns, starting with the turn
the siege is laid, your soldiers next to the city build 1 point per 500
soldiers (horsemen count half), up to 5: ladders, rams, a siege tower, two
towers, full siege works. Each whole point takes 20% off the walls' bonus, so
at 5 they add nothing; the city's own +10% and the terrain stay. More works
mean better odds, and the siege screen shows the odds now and at full works.
All works are lost when the siege ends for any reason.

| Besiegers | Works a turn | Palisade | Stone walls | Great walls | Full works |
|---|---|---|---|---|---|
| 400 soldiers | 0.8 | 2 turns | 3 | 4 | 7 |
| 750 soldiers | 1.5 | 1 | 2 | 2 | 4 |
| 1,300 soldiers | 2.6 | 1 | 1 | 2 | 2 |
| 1,900 soldiers | 3.8 | 1 | 1 | 1 | 2 |

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

- They attack when the odds are good (about 10% stronger, counting every army
  that would join in), march up to a city they can't see into before
  storming it, retreat from stronger armies, and march on the enemy
  city that's cheapest to take, whoever owns it. They besiege it and wait for
  it to surrender or for good odds to storm it once their siege works allow,
  and once they're camped outside a city they stick with it.
- **They defend their cities hard.** When one is besieged, they raise taxes,
  train a relief force suited to the besiegers, and march every field
  army to it. The garrison sallies at even odds, attacks at poor odds once
  surrender is two turns away, and makes a **last stand** at any odds on its
  final turn of supplies.
- They garrison cities against nearby enemies (a city under 2,000 people
  trains only when it's empty or threatened), build walls near their
  borders, advance their cities, build markets, then a spear yard, archery
  range and stables, then mines, farms and ports, then walls and roads (roads
  come with the port where a city borders one of their own, since they carry
  trade there). They train
  the best tier of a unit they can afford to keep, and militia only where
  they have no unit building or in an emergency. Armies gather in the nearest
  city with a unit building and the people to train, counting a better building
  as a shorter march, and any city with 4 regiments to spare sends them out.
  With gold to spare and upkeep a small part of their income, field regiments
  come before other buildings. Once a border city's
  buildings are seen to, they keep a scout (one more per 5 cities) a few
  tiles from the city they're after (dismissing scouts when they can't pay
  their upkeep), and put one watchtower in its region, on the
  tile nearest the closest foreign city.
- When a city has the people for its next level, they save for its Forum or
  Senate, buying no other buildings, watchtowers or new scouts, and training
  no new regiments once they have 3 per city. Armies still march and fight,
  regiments still retrain, and a besieged city ends the saving.
- They raise taxes when in debt and lower them once recovered, and tax a
  city high once it's full (it can't grow anyway). When they
  take a city, they exterminate only when nearly out of gold, enslave it if enemy
  armies are near, and otherwise occupy.

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
