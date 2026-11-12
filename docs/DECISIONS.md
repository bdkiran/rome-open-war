# Design decisions

Why the game works the way it does. The current rules are in `README.md` and
the current numbers in `src/data/`; this file is the reasoning behind them,
including what was tried and rejected, so it isn't tried again by accident.
Newest thinking wins: where an entry was later changed, the later entry says
so.

## Map

- **One map: the Roman world, 218 BC.** A random-map generator existed early
  on and was removed. The map is generated offline from Natural Earth
  coastlines by `tools/build_europe_map.py` into `europeTerrain.ts` (79×70
  hexes).
- **No one-hex land corridors.** The generator widens any strip of land one
  hex wide between two stretches of water: they made armies file through
  single choke points.
- **Sicily is a round island**: the generator draws it as a disc of 37 hexes
  (`ROUND_ISLANDS`) instead of its coastline, which at this scale came out
  as a thin strip too small to share between three cities (Rome's Messana,
  the Greeks' Syracusae, Carthage's Lilybaeum). Land touching the disc is
  turned to sea, so the Strait of Messina stays open.
  It was 19 hexes (radius 2) until the player saw Messana and Lilybaeum on
  the wrong sides: spacing pushed Lilybaeum away from Carthago (4 tiles,
  across the sea) into the east, and Messana, placed last, into the west.
  Now Lilybaeum keeps its site (`keepSite`, for a city whose only close
  neighbour is across the sea) and the disc has radius 3, so all three
  cities sit near their real sites with land to reach level 3. With
  Lilybaeum out of the way Capua slid south and crowded Tarentum, so Capua
  is pinned to the tile spacing gave it before (1.35° east of its site).
  The player prefers playable over exact geography.
- **The Hellespont, Propontis and Bosporus are carved as sea**
  (`STRAITS` in the generator): at this scale they closed, joining Europe
  to Asia, and spacing from Tylis pushed Byzantion onto the Asian side.
  Byzantion keeps a site on the European shore (west of its real one), with
  crossings at the Bosporus and the Hellespont beside it.
- **Sea crossings** (Pillars of Hercules, Messina, Sicily–Africa, the
  Channel, Corsica–Sardinia, Corsica–Italy, Sardinia–Africa, Bosporus,
  Hellespont) are ordinary steps in the
  topology (`links()`), so every city is reachable by land.
  A crossing never lands on a city tile: Sicily–Africa once joined
  Lilybaeum to Carthago directly, so an army in one could besiege the other
  across the sea. `tests/map.test.ts` checks no two cities touch.
- **Every starting city can reach level 3**, still true with the new city
  list (see below). Tarsus's land held only 14,000
  people (the Senate needs 15,000) because the Taurus band buried it in
  mountains. The generator now draws the Cilician plain (`PLAINS`), which
  lifts it to 18,700 and Antiochia to 40,300; `tests/map.test.ts` keeps every
  city at least 10% above the Senate's need. Raising sea or mountain capacity
  instead was rejected: it would have shifted the economy of 20–30 cities.
- **Fixed territory.** Each city claims land within 3 tiles at the start and
  it never changes. Cities never claim sea, but sea tiles in reach count as
  fishing grounds (capacity and growth), because coastal cities were
  otherwise tiny. Reach is counted in steps to adjacent tiles: a sea
  crossing doesn't bring land across it into reach (Carthago was claiming
  Sicily through the Sicily–Africa crossing). Sight (fog of war) counts the
  same steps, so cities and armies no longer see across a crossing.
  Except the far shore itself: whoever sees one end of a crossing sees the
  other. Without it an army on the far shore was invisible yet next door, so
  the player couldn't attack it and a move across failed with no reason shown.
- **Bigger territories, cities spread apart.** With a 2-tile radius only 16%
  of the land belonged to any city. The radius is now 3, and a city closer
  than 7 tiles to one already placed moves up to 4 steps over land (never
  across the sea) to keep their land apart; where it can't, it goes as far
  from its neighbours as it can and the land is split by nearest city. The
  player wanted cities moved rather than sharing, and cities of unequal
  size. Median land per city went from 13 tiles to about 24.
- **Regions fill the gaps, for the map only.** Territory covered 38% of the
  land, leaving empty space between factions. Giving every land tile to the
  nearest city for real would have raised the world's carrying capacity
  2.3x and handed it to the empty map edges (Scythians 6x, Dacians 5x,
  Germani 4x, Numidia 3x, Rome and the Greeks 1.07x), with whole-map sight
  and road networks for them. The player chose to draw regions (every land
  tile walkable from a territory, `state.regions`) with borders and a faint
  tint, while income, growth, buildings, roads and sight still count the
  3-tile territory alone. Battles there are named after the region's city.
- **Scouts are a separate kind of unit, not regiments.** The player wanted a
  single rider who doesn't block armies, moves faster than cavalry and never
  dies, trained in a level 2 city, at 100 gold and 2 a turn. Keeping them out
  of `state.armies` means battles, zones of control, sieges, garrisons and the
  AI's army logic need no exceptions. Since one can't die and upkeep never ends,
  Dismiss ends it. The AI moves each at most once a turn: chasing a changing
  target cost 2,500 extra actions a game. Sight 5 and movement 20 are proposals.
  A faction in debt, or whose income doesn't cover its upkeep, dismisses its
  scouts, as they'd otherwise cost it for ever. In 24 seeds, 100 turns (21 scouts
  a game): more conquest and less development, with ranges overlapping: median AI
  income −6%, treasury −14%, cities not with their first owner +14%, level-1
  cities 32 (was 27), level-3 cities 1 (was 2), watchtowers −32%; factions fallen
  unchanged. The cost of scouts is far too small to explain it, so better sight
  probably does; that isn't proven. Known edge: in 1 of 48 games a faction fell
  while in debt (−19, its last city besieged, mostly army upkeep), against 0 of 48
  before; no living faction ended in debt.
- **`cityTiles` remembers its result** per territory object. It scanned the whole
  map on every AI action and was 28% of game time; games now run in 30 s (36
  before scouts), and the numbers don't change.
- **Watchtowers cost 150 and scouts 4 gold a turn.** The player found scouts far
  better value, and they were: over 100 turns a scout cost the same as a tower
  (300 gold) and saw 91 tiles against 37, moving and unkillable. Now a tower gives
  0.25 tiles per gold; a scout 0.30 over 50 turns and 0.18 over 100. This drops the
  rule that a tower costs more than any first-level building. Raising the scout's
  price to 150 as well was tried and rejected: AI scouts halved. A gold threshold for
  building towers ahead of the army was tuned first and dropped: 500 gold gave 22
  towers, 600 gave 19, 700 gave 13, 800 gave 7, so it was too touchy to mean anything.
- **Watchtowers make new sight.** Only armies could see past a city, so
  most of a region sat in fog. A tower is built at once on any land tile of
  your region (not a city) for 300 gold and sees 3 tiles. The player chose:
  never destroyed (an enemy army standing on it sees through it instead,
  and the owner is blinded until it leaves), taken with the city whose
  region it's in (its owner is worked out from the region, never stored),
  no limit, no upkeep, no build time. So the price, above any first-level
  building, is the only brake. The AI builds one per border city, nearest
  the closest foreign city, after its buildings. In 4 seeds (with and
  without `--garrison`): 28–40 towers a game, median AI income and
  factions fallen unchanged, no invalid orders or AI debt, but level-3
  cities fell from 13 to 7–8 a game (gold that went on towers didn't go
  on the Senate).
- **Per-tile resources were halved** to match (capacity of every terrain
  and the sea, mine gold 1/2/3 per tile, farms and port gold 0.25/0.5/0.75
  per tile), so a typical city's totals stay near what they were. In
  peacetime the world earns 541k gold by turn 100 (was 470k) across 59
  cities (was 43), about 9.2k a city (was 10.9k). In 8 AI games: median AI
  income 275 a turn (was 345, with several factions down to 2 cities),
  cities at level 3 8 (was 2), cities taken 172 (was 197), factions fallen
  11 (was 13), no invalid orders or debt. With the AI's siege commitment
  (merged alongside): cities taken 304, factions fallen 15, level-3 cities
  23, median AI income 391 a turn. Whole games are slower to simulate
  (`npm test` about 3.5 minutes, was 1).
- **The city list is the player's**: 15 factions with 2 to 7 cities each (55 cities)
  (Rome held 7 in Italy and Sicily, until it was split: see Factions). Parthia and Armenia were left out:
  their cities are beyond the map's eastern edge; Seleucia sits on the edge.
  The player chose plain historical names for factions and regions.
- **Crowded cities were moved or dropped** so every city can still reach
  level 3 (the player chose that over letting small cities top out at 2).
  With halved capacity, ten crowded or edge cities had too little land.
  Five moved up to 1.5° from their real sites (Seleucia, Sidon, Ariminum,
  Memphis, Mediolanum); three with no such site were dropped (Thessalonica
  beside Pella, Thermon in crowded Greece, Thebae, which could only fit in
  Sinai).
- **No cities on islands out of reach.** Palma (Mallorca), Rhodos and
  Salamis (Cyprus) had no sea crossing, so their factions could never be
  beaten and the game couldn't end; the player chose to remove them.
  Sparta's moved site had landed on a cut-off scrap of land, and no
  reachable site within 1.5° gave it room to grow, so it went too.
  `tests/map.test.ts` checks every city can be reached from every other.

## Factions

- **Rome was split in two** (the player's call): it started with all seven
  Italian cities (24,000 people, 3,120 soldiers, +84 gold a turn, against +73
  for the next biggest) and was too strong. The player keeps Roma, Arretium,
  Ariminum and Capua (+50, like the Britons); the Samnite League, an AI with
  Roman soldiers, holds Tarentum, Croton and Messana (+39, like most AIs).
  A faction more changes the order cities are placed in (capitals first, then
  one per faction per round), so the Samnite cities, Syracusae and Bylazora
  are pinned where they stood before; ties for land go to the city placed
  first, which left Capua short of room for level 3, so Capua moved one tile
  north-west (0.9° from its real site, closer than before). Measured over 4
  seeds, 100 turns, against master (normal / `--garrison`): battles +21% /
  +29% (Italy is a front from turn 1), AI income −1% / −6%, level-3 cities
  14 / 15 (was 17 / 15), factions fallen 3 / 3 (unchanged), no invalid
  orders or AI debt. The passive test player now falls in all 4 normal games;
  the Samnites end with 2 to 7 cities.
- 16 factions, 2 to 6 cities each. Colours were chosen against each faction's *neighbours*
  (e.g. the Germanic Tribes' first dark green vanished into forest; Thrace
  moved to lavender to stay clear of it).
- The scoreboard uses short names so the people/soldiers/gold columns fit.

## Movement

- **Terrain costs are close together on purpose.** The player twice found
  movement too slow, especially in mountains. Costs: plains 2, rough ground 3,
  mountains 4; infantry 12 points (6/4/3 tiles), cavalry 16 (8/5/4).
  Making mountains cost the same as hills was tried and rejected: it barely
  shortened real routes (armies take the passes) and erased the difference.
  Cavalry was cut from 18 to 16 so they couldn't strike from anywhere.
- **No supply or attrition for field armies.** Losing soldiers away from friendly
  land (in enemy land, desert or mountains) was proposed to make where an army marches
  matter and slow big empires. The player doesn't like it; it won't be built. Only a
  besieged garrison loses soldiers each turn (Sieges).
- **Roads are physical: a road between every two bordering cities.** They used to
  speed a city's whole land (Tracks: rough ground like plains; Roads: mountains too;
  Paved: every tile 1). Now each pair of cities whose land borders gets a road, the
  cheapest path between them through their own land, laid out at the start
  (`GameState.roads`, 46 roads of 5–9 tiles). A city's Roads building opens the half in
  its own land: every tile of it costs 1.5 / 1 / 0.5, whatever the terrain; off the
  road, terrain costs as usual. The player chose movement on roads only, over keeping
  the whole-land bonus or having both. Halves stay exact, so costs needn't be whole
  any more. Roads still help every army, enemies included. Six cities border no other
  city's land and can't build Roads (Seleucia, Lemonum, Tingis, Cyrene, Marcomannia,
  Carales). All tile costs go through `enterCost` (systems/pathfinding.ts).
- **Zone of control:** entering a tile next to an enemy army ends the move;
  the army can still attack. Armies can't slip past each other.
- **A move runs into what it couldn't see.** A move is checked against what
  the faction sees; if a hidden army blocks the way, the army follows its
  planned path and halts in that army's zone of control (or before its tile),
  which reveals it. Such moves used to fail outright, so the player couldn't
  walk up to find out what was there. An attack that needs a march moves
  first and opens the battle panel from there, so the odds are judged on what
  the army sees once it arrives. Withdrawing then leaves the army where it
  marched: committing to the approach before seeing the odds is the point.
  The AI plans on the real state, so it never runs into this.
- **Marches** (right-click a distant tile) move at the *end* of the owner's
  turn with the movement left, so the army is still usable during the turn. A
  march is only cancelled when the army couldn't step even with full movement
  (two bugs here: cancelling at 0 points, then at 1 point).
- **Left click selects, right click orders** (moves, attacks, marches), to
  stop accidental moves. A city's garrison is not pre-selected: the player
  picks which regiments march out. Field armies are selected whole.

## Combat

- **Units are stats; battles are fought in rounds.** This replaced a
  rock-paper-scissors table (×1.5 for the advantaged side, one roll decides),
  because the player wanted units to be a combination of attack, armor and
  so on. Each unit has attack, armor, and one special: ranged (archers),
  charge (cavalry, attacking on open ground only, never against a city),
  anti-cavalry (spearmen). Two volley rounds, then melee rounds (attack ÷
  armor) until a side has lost half its soldiers and breaks; the loser
  then flees (see below).
- **The stats were fitted to the old matchups** (regiment against regiment,
  attacking) so balance didn't jump: spearmen against cavalry 2.25 → 2.22,
  archers against spearmen 1.33 → 1.38, cavalry against archers 1.13 → 1.36,
  spearmen against militia 1.23 → 1.22. Arrows **ignore armor**: without
  that, no set of stats let archers beat spearmen and lose to cavalry.
  Arrows hit horsemen only in the first volley, at half effect, since they
  close fast. A militia regiment about matches a cavalry one now (it used to
  beat it).
- **Tiers multiply every stat**, so an elite regiment fights exactly like
  1.6 times as many basic soldiers. The defense bonus works the same way:
  the defender deals ×(1 + bonus) and takes ÷(1 + bonus), so +50% walls make
  a garrison fight like one 1.5 times its size, as before. Arrows are divided
  by the target's tier for the same reason.
- **A side breaks partway through a round** when its losses reach the break
  point. Judging at the end of the round let a side overshoot and skewed
  close fights.
- **Luck is per round and large** (±90% on each side's blows each round):
  luck averages out over rounds, and this gives about the same odds as
  before (a side 10% stronger wins 76% of the time, was 77%; 25% stronger
  93%, was 97%). The battle panel's odds are an estimate from 200 battles
  fought with dice seeded from the game state, so the same situation always
  shows the same odds.
- **The AI's strength measure** (`battleStrength`) fights the battle once
  with no luck and reads each side's losses back through the square law, so
  its ratio means what the old one did (attack at 1.2). A formula averaging
  the stats over a typical battle misjudged short fights (archers can break
  militia in the volleys alone); it's still used to choose what to train
  (`sideStrength`), per regiment against the enemy's actual mix.
- **Big wins are cheap now.** The winner loses only what it took before the
  enemy broke: about 40% in an even fight, 20% at 1.5 to 1 (it was 60% and
  40%). In 100-turn games, AI winners lose a median 10–15% (was about 27%),
  and more armies survive (about a third more regiments alive at turn 100).
- **Beaten armies flee** instead of being wiped out: up to 3 tiles, to
  their nearest own city in reach or else away from the enemy, never past
  enemy armies or cities. The player chose fleeing with a "back against the
  wall" exception: with nowhere to go, an army fights to the death, as does a
  garrison defending its city (its walls are a dead end) and a besieged
  garrison whose sally fails. An army that attacked from its own city falls
  back inside. Rout losses are 10% of the survivors plus half a soldier per
  surviving enemy horseman (the player wanted cavalry to matter in the
  chase). A harsher 20% and 1 per horseman took more cities (219 against
  199 in one comparison of 8 test games) with the same number of regiments
  alive; the milder one was kept as agreed. Fleeing never uses a sea
  crossing.
- **Routed regiments under a tenth of their size scatter.** Without it, a
  remnant of a few soldiers lost nothing to the rout (10% of 2 rounds to 0)
  and fled forever: battles went from about 900 to over 5,000 in 8 test
  games, half of them against 2 soldiers. With it, about 2,000 battles,
  mostly chases of fled armies (median defender about 170 soldiers);
  cities taken 219 (was 201 with wipe-outs), factions fallen 12 (was 11),
  regiments alive at turn 100 1,382 (was 1,416).
- **The conquest balance test was relaxed to 15% / 10%** (exterminating
  best long-term at 50 / 100 turns). Fleeing armies changed the turn-50
  game it samples, and exterminating came out best for 12% / 7% of cities
  with no change to the economy. The player chose to relax the limits.
- **The AI looks before storming.** It used to march up to a city out of
  sight and storm it in one order, and most of its battles were such blind
  storms against hidden garrisons. Under the new combat they failed more
  often (cities taken fell from 295 to 165 over 8 test games), so it now
  marches up first and decides once it sees the garrison: 201 taken, and 11
  factions fallen (was 9). With more armies alive and marching, AI turns and
  `npm test` are about three times slower (pathfinding, not combat).
- **Defense bonuses are additive and small:** city +10%, walls +15/30/50%,
  terrain forest +10%, hills +15%, mountains +25%. They were softened twice;
  walls are now the main source of a city's strength.
- **Battles pull in every army within one tile of either side**
  (`battleSides`): attackers bring regiments that can still move, defenders
  bring everything. Losing side loses every army that fought. Nobody joins
  from across a sea crossing (an army waiting on one shore was pulled into
  battles on the other); the two armies fighting can still face each other
  across one.
- **Attacking costs 6 movement, not all of it.** An army that attacked from a
  city was stuck there until next turn, and the player disliked it. Infantry can
  attack twice a turn and cavalry three times if they don't move: the player was
  happy for winners to chase down survivors, so nothing else limits it. Taking a
  city or fleeing still ends a move.
- **Marching into your own army to attack keeps that army in the fight.** The
  march merged them, and only the chosen regiments fought, so a relief army
  routed through a besieged city left its garrison out. Attacks now avoid a
  besieged city of your own when another tile will do, as a beaten army can't
  flee from inside one.
- **Besieged garrisons are shut in**: they can't move, march or lay siege,
  can only attack their besiegers (from their own walls), and only join
  battles against them. Letting them walk out left the city empty for free.

## Sieges

- Clicking an enemy city lays siege and opens the siege screen (Continue /
  Storm / Withdraw). An empty city in sight is simply taken.
- **Supplies are a countdown to surrender**, not starvation: 3/4/5 turns by
  city level, +1 for capitals. Attrition (garrison −5%, people −1% a turn) and
  the countdown both start on the first full turn, not the turn the siege is
  laid: the player's call, so a city showing 3 turns holds out for 3 full turns.
  Being shut in, with no gold, growth or training, still starts at once. When
  supplies run out the city surrenders and its garrison is destroyed. The old "starve then lose 25% a turn" model felt too abrupt.
- **A faction that falls ends its sieges.** Sieges are checked at the end of
  the besieger's turn, and a fallen faction has none, so a city it was
  besieging stayed shut in for ever, with no one outside to sally against: no
  gold, no training, while its armies still drew upkeep. Found when the Rome
  split put a test game's Thrace in debt (its last city, Porolissum, besieged
  by a Dacia that had fallen 30 turns before). `tests/invariants.ts` now
  checks that no city is besieged by a fallen faction.
- **A besieger marches in the moment the garrison dies**, whoever's turn it is,
  with no choice offered: there's no reason to stay outside. The empty city used
  to wait for the besieger's next turn, and another faction could walk in and
  take it. A faction can therefore lose its last city on its own turn.
- **A beaten siege ends at once, and an ended siege refills the city.**
  The siege used to be checked only at the end of the besieger's turn, and
  only for an army next to the city: a storm lost on the city's last turn
  of supplies still ended in surrender and the garrison's destruction, and a
  new siege picked up the old one's supplies (cities restocked one turn a
  turn). Now losing a battle at or next to the city breaks the siege
  (`breakSieges`), and a lifted, broken or captured city's supplies are
  refilled at once. The player reported both as bugs. Knock-on, accepted:
  the AI lays sieges whatever the garrison's strength, and
  garrisons sallying out and winning used to cost a siege nothing (the
  besieger walked back before its turn ended). Now they break it and the
  city restocks, so AI sieges almost never end in surrender (1 of 448 in 8
  test games, against 64 of 202 before): cities taken 210 (was 304),
  factions fallen 11 (was 15). The player chose to leave it: storming, not
  starving a city out, should be the main way to take one. Making the AI
  besiege only when it could survive a sally was tried and didn't help
  (243–265 cities taken, 5–6 factions fallen).
- **The AI defends its cities**: raises war taxes, trains a relief force in
  the nearest free city, marches every field army there, attacks besiegers at
  even odds, and its garrison sallies at even odds, at 0.6 when two turns
  from surrender, and at any odds on its last turn ("last stand").

- **AI priorities**, one action at a time from a fresh look at the game:
  merge damaged regiments; attack at good odds (10% stronger, counting joined
  armies; garrisons only with regiments they can spare unless besieged);
  retreat field armies from stronger enemies; launch surplus regiments from
  the muster city (nearest the target) once they'd survive a sally; advance
  on the target and besiege it; defend (replenish and size garrisons to
  nearby enemy field armies); build; train field regiments that counter the
  target's defenders, keeping upkeep under 75% of income. The target is the
  enemy city cheapest to take (fewest defenders, short distance), reachable
  over land and not besieged by someone else.

- **The AI commits to a siege.** It never laid one: its target was the
  enemy city that looked cheapest, and the garrison it saw on arrival
  (hidden by fog until then) made another city look cheaper, so its armies
  walked off the turn they arrived (0 sieges in a 100-turn game). Now a city
  it's besieging, or one its field armies stand next to, stays its target.
  In 8 test games: 60+ sieges a game, factions fallen 36 (was 13), cities
  taken 250 (was 197), level-3 cities 27 (was 2: with less dithering the AI
  spends more on growth), AI income 558 a turn (was 345). `npm test` runs
  in about 45 s instead of 100, with armies no longer marching back and forth.
- **Walled cities need siege works before a storm.** The player didn't like a
  big army walking up and storming on arrival. A garrisoned walled city can only
  be stormed by its besieger, with as many whole points of works as its wall
  level. Soldiers next to the city build 1 point per 500 a turn (horsemen half),
  up to 5, and each whole point takes 20% off the walls' bonus, so there's a
  reason to wait past the minimum. The cost is time only, and all works are lost
  when the siege ends, so sallies and relief forces matter more. Unwalled and
  empty cities can still be taken at once, so early wars keep moving. The rule
  sits in `attackableFrom`, which the AI and the player both go through, so the
  AI needed no new code. Over 8 seeds, against the AI change below, without /
  with `--garrison`: cities not with their first owner 23 to 24 / 23 to 23,
  factions fallen 2 to 3 / 2 to 3, level-3 cities 11 to 12 / 10 to 12, income +3%
  / +2%. Sieges of walled cities halved (55 to 27 / 52 to 22); why wasn't
  measured. Walled storms are rare, which keeps their numbers thin (3 to 1 / 4 to
  1 a game): 1.0-1.3 siege turns first and 1.4 works at the storm, short of the
  2-3 turns hoped for. Walled sieges walked away from: 1 a game.
- **AI armies now gather where they can train real troops.** Field regiments
  could only be trained in the city nearest the target, usually a small border
  town: under 2,000 people that blocked field training on about 20% of AI turns,
  while income quadrupled and regiments per city stayed flat. Only that city
  launched armies too, so regiments left behind when the target changed never
  left. Now the muster is the nearest city with a unit building and the people
  to train (or the nearest, if none has both), any city with 3 to spare launches,
  and while upkeep is under 15% of income a field regiment comes before buildings
  other than government (`AI.armyUpkeepShare`). Mustering in the nearest big city
  of any kind was tried and rejected: it turned big cities' people into militia
  (66% of regiments) and cost 33% of AI income. A share of 0.35 cut income 70%,
  put factions in debt and fell 6 factions a game; 0.2 made 4. Measured over 8
  seeds, master to now: soldiers +9%, regiments +12%, militia 53% to 39% of
  regiments, cities not with their first owner 21 to 23, factions fallen 2 to 2,
  net income -29% (upkeep 11% to 16% of income, and more war), level-3 cities 15
  to 11 (one more than the 3 we meant to allow), watchtowers 13 to 24 (they stay
  ahead of the army, and got more gold). Regiments remained 98% basic tier.
- **The AI occupies.** The three fates are balanced for gold, each winning over its
  own horizon, but occupy was out of the AI's reach by rule and it exterminated under
  300 gold, so it razed most of what it took. Allowing for how long cities are really
  held (443 captures: 24% lost within 10 turns, 37% within 25, 46% within 50), occupying
  was best for 239 of 440 cities, enslaving 198, exterminating 3. Now it exterminates
  under 100 gold, enslaves a city with enemy armies near (the gold and people are safe
  if it's retaken) and otherwise occupies. Per game: 34 occupied, 12 enslaved, 2
  exterminated (one report game before: 0 / 18 / 23). Over 8 seeds, against the launch
  change below, without / with `--garrison`: cities not with their first owner 21 to
  24 / 19 to 24, net income 370 to 351 / 360 to 404, level-1 cities 18 to 10, level-3
  cities 17 to 18 / 15 to 16, factions fallen 2 to 2 / 1 to 2.
- **The AI launches at 4 regiments, and attacks and launches at closer odds.**
  `minLaunchRegiments` 3 to 4, `attackMargin` 1.2 to 1.1, `launchMargin` 1.4 to 1.25.
  The margins alone did little (close battles 31% to 35%, attackers still winning 93%:
  a stronger side rarely loses, whatever margin it picks its fights at). The bigger
  launch did most of the rest: armies wait to be worth sending, so fewer die piecemeal.
  Over 8 seeds with the experience change below, without / with `--garrison`: net income
  295 to 370 / 274 to 360, soldiers +16% / +15%, level-3 cities 11 to 17 / 10 to 15,
  battles 439 to 290 / 402 to 280, cities not with their first owner 24 to 21 / 21 to 19,
  factions fallen 3 to 2 / 2 to 1. Wars are slower, which the player should judge.
- **The AI stops choosing militia where it has a unit building, and values tier.**
  After turn 25, about 68 militia regiments a game came from cities with a unit
  building, since big regiments looked strongest, and in the last 25 turns only 8 of
  113 regiments trained were advanced. Now those cities choose among line units,
  judged at their best tier (militia stay the fallback in an emergency), and each
  unit-building level counts as 4 tiles nearer when choosing a muster
  (`AI.musterTilesPerTier`). The army also only goes ahead of buildings with 500 gold
  in hand (`AI.armyFirstGold`), so it takes the surplus. Over 8 seeds, with the tower
  and scout prices above, without / with `--garrison`: militia 39% to 24% / 41% to
  26% of regiments, basic tier 97% to 85% / 96% to 89%, net income 268 to 301 / 311 to
  320, soldiers -10% / -2%, watchtowers 23 to 17 / 25 to 17, factions fallen 3 to 2 /
  3 to 2, level-3 cities 12 to 12 / 12 to 10. Old regiments still never upgrade.
- **An army can't stage an attack from inside one of its own besieged
  cities** (except on the besiegers): marching in shuts it in. This was
  allowed by mistake and only showed once the AI laid sieges.

## Armies and recruitment

- **Archers and cavalry cost 240 a regiment, ports 150 / 250 / 450.** Measured in
  simulated battles, joining an army of 2 spearmen and 2 militia, archers added what
  spearmen add for 1.8 times the gold, and cavalry 71% of it for twice the gold, which
  speed and sight didn't seem to justify. So gold per soldier went from 1 / 2 / 3 to
  1 / 1.5 / 2, with upkeep cut to match. A second port level took 87 turns to pay back.
  Mines pay back fastest (15 turns) and the player chose to leave them: they don't have
  to be level with other buildings. Over 8 seeds, without `--garrison`: archers 36 to
  49 regiments, cavalry 10 to 14, basic tier 85% to 81%, port levels 24 to 45, AI gross
  income at turn 100 +6%, peacetime gold by turn 100 +2.5%, but median net income per
  faction -2% (-14% with `--garrison`, a wide range) and treasuries -10%, as the AI
  spends what it saves on more army: battles +6% / +11%.
- **Regiment sizes differ by unit** (spearmen 200, archers 160, cavalry 120)
  at the same gold per soldier as before (1/2/3), so the balance between
  units holds. Keeping regiment prices at 100/200/300 was rejected: it would
  have made spearmen twice as good per gold.
- **Militia and the Barracks.** Level-1 cities train only militia: 220 to a
  regiment at 0.5 gold and 0.01 upkeep per soldier, poor fighters that every
  other type beats soldier for soldier. So they're the cheapest
  strength in gold and the dearest in people. A Barracks (level-2 city)
  unlocks spearmen, level 2 archers, level 3 (level-3 city) cavalry. No city
  starts with one, capitals included: building it is the player's choice
  (starting capitals with one was tried and rejected). Spearmen went from 200 to 180 so militia stay a real step
  down (220 militia lose to 180 spearmen: 220 vs 270); a first proposal of
  300 militia was judged too many. A regiment of militia still beats one of
  cavalry (220 vs 180). Retraining needed no Barracks then (see below). Training and
  retraining costs round up to whole gold, since militia cost half a gold.
  In full games wars move faster (34 cities taken in 100 turns, up from 16),
  AI armies are mostly militia and spearmen, and cavalry are rare (few cities
  reach level 3).
- **Unit buildings and tiers replaced the Barracks.** With one Barracks gated
  at city level 2, the AI trained almost nothing but militia (388 militia
  regiments against 46 others in 100 turns). Now spearmen, archers and
  cavalry each have a building (Spear yard, Archery range, Stables) that even
  a level-1 city can build; its levels unlock basic, advanced and elite
  tiers (advanced and elite need a level-2 and level-3 city, as for any
  building). Tiers make each soldier fight like 1 / 1.3 / 1.6 basic ones (by
  multiplying its stats; see Combat) for
  ×1 / 1.5 / 2.1 the gold and upkeep and the same people: a little worse per
  gold, much better per person. A regiment's tier is fixed; merging needs
  the same unit and tier. The AI builds its market before the unit
  buildings (an early Barracks had slowed its economy) and trains the best
  tier whose upkeep it can afford. First results: the AI builds the
  buildings widely but still trains mostly militia (most training happens
  early, before they exist), and no city reached level 3 in 100 turns: the
  gold goes into unit buildings. That's for the military AI balancing.
- **Experience levels come 30% sooner**: 2 / 3 / 6 / 8 / 13 / 17 points, from
  2 / 4 / 8 / 12 / 18 / 24. Almost no regiment reached level 6, and few reached level 3.
  The first level stays at 2 points, one win, so that surviving a single lost battle
  doesn't make a veteran. Alone, over 8 seeds: regiments at levels 3-5 13 to 26, level 6
  0 to 1, little else moved.
- **Experience: flat +0.5 attack and armor per level, 6 levels, every unit.**
  The player chose flat bonuses over percentages, so veterans matter most to
  the weakest troops. Level 6 is worth, against the same unit, militia ×2.5,
  spearmen ×2, cavalry ×1.9, against Elite's ×1.6; yet only ×1–1.3 against
  archers, since arrows ignore armor and tiers alone weather them (`drill`).
  Archers gain no ranged, by choice, so their veterans only help in melee
  (level 6 archers ×1.5–2.5 against others, ×1 against archers). A big edge
  comes early: one level-3 spearmen regiment always beats a raw one in the
  preview. Levels are therefore slow (2 points a win, 24 for the top), and
  battles against under a quarter of your soldiers earn nothing, because most
  battles are chases of fleeing remnants. In 4 seeds, 100 turns: about a
  quarter of regiments at level 1–2, 3% at 3–5, level 6 almost never (0–1 a
  game); median AI income −3%, battles +13%, factions fallen unchanged.
- **Unit stats are on a scale 10 times larger** (militia 20/20, spearmen 30/30,
  elite spearmen 48/48, +5 per experience level). Experience showed +1 was too big
  a step at the old scale: +50% on militia, +33% on spearmen. Losses depend on
  attack ÷ armor, so this changes no battle. Arrows ignore armor and have no such
  ratio, so ranged goes over `COMBAT.arrowDivisor`. ×10 keeps tiers in whole
  numbers, which ×2 and ×5 don't. On its own, in 8 seeds, every number in
  `npm run compare` matched the old scale, ranges included. A flat bonus still
  favours the weak, as the ratio makes it: level 6 is ×2.5 for militia, ×2 for
  spearmen.
- **Militia are too good for their gold (not fixed).** On equal gold they beat every
  other unit 99–100% of the time, and 54–75% of AI regiments are militia. Doubling
  their price (measured with +5 city gold) took them from 72% to 49% at turn 50, but
  halved early conquest and makes the early game tighter.
- **One army per tile, up to 10 regiments**; stacks move at the pace of the
  slowest chosen regiment; moving part of a stack splits it.
- **Recruitment queue** per city (6 orders), shared by training and
  retraining, paid in gold when queued, people taken when done. **Training:
  one new regiment per turn. Retraining: everything queued is done by next
  turn**, wherever it sits in the queue. A regiment that leaves the city (or
  dies) is dropped from the queue and refunded immediately.
- Merging combines only under-strength regiments of the same type.

- **Retraining needs the unit's building at the regiment's tier**, as
  training does (militia anywhere). It used to need none, which let any
  city refill elite regiments; the player reported it as a bug.
- **Starting armies include militia**: two regiments in the capital, one in
  each other city, alongside the archers and cavalry (capital) or spearmen.

## Cities and economy

- **The government building sets how big a city can get**: level 1 holds
  8,000 people, level 2 20,000, level 3 whatever its land supports. Forum
  needs 6,000 people, Senate 15,000 (each limit sits above the next
  threshold). This, more than anything, fixed late-game runaway growth and AI
  gold hoarding.
- **Farms only speed growth** (they used to add capacity too).
- **Ports** are for any city with sea on its coast (`City.coast`: sea within
  its reach, or touching any of its land, counted once at the start) and
  add +20/40/60% growth, like farms, but scaled by the city's sea share
  (coast against coast and land). They first required fishing grounds (sea
  within 2 tiles), which shut out Amaseia, Treva and Sardis, whose land
  reaches the sea further out. Fishing grounds (capacity) are unchanged. A flat bonus would have given a city with one sea
  tile a full farm's worth. In full games coastal cities don't run away:
  they average ~9.9k people against ~8k inland at turn 100.
- **Land capacity** was cut ~47% (plains 3,200/tile) so the largest city
  (Lutetia) tops out near 60,000. Starting cities are small: capitals 6,000,
  others 3,000.
- **Income**: 5 per city + 4 per 1,000 people + mine gold, × tax rate ×
  market. No gold from the land itself: hills and mountains only pay through
  a **mine**, a real choice that's worth a lot in hill country and nothing on
  plains. A mine needs at least 5 hills or mountain tiles, for the AI too: below
  that it takes 50 turns or more to repay, and it was a trap for the player.
- **Tax rates** trade gold for growth (low ×0.6 gold / ×1.5 growth, high
  ×1.5 / ×0.5).
- **Only a finished government unlocks the next level of other buildings**;
  a queued one doesn't. Several levels of the *same* building may be queued.
- **Taking a city**: occupy / enslave / exterminate, with plunder from the
  city's population and level at the time (so re-sacking pays little).
  Enslaving loses 5% of the people on the march (it was 10%, which left it
  the best choice in only ~1 city in 3 at any horizon). Now each choice has
  its own horizon: exterminate for quick cash (~10 turns), enslave for the
  medium term (~25), occupy for the long game. The enslaved always found
  room in their new cities, so the losses were the only drag; more plunder
  on top made enslaving best even short-term, so it wasn't raised.

- **Growth floor: a small city grows as if it had 1,000 people.** Growth is
  a share of the people already there, so a city drained to a few hundred
  barely grew: Samarobriva, on the Britannia–Germania border, changed hands
  four times in 40 turns, was put to the sword three times, and sat at 100–250
  people growing 6–14 a turn (3–5 of 55 cities ended a game under 1,000).
  Now it grows 40–50 a turn and recovers in about 20 turns. The AI also
  stops training in a city under 2,000 people unless it's empty or
  threatened (`AI.minRecruitPopulation`): its militia had drained the town
  from 3,000 to 1,100 before it was ever taken. In 8 AI games: cities taken
  390 (was 304), median AI income 450 a turn (was 391), factions fallen 15
  (unchanged); peacetime numbers unchanged, since no city starts that small.

- **Growth slows only near the limit** (`ECONOMY.growthCurve` 1.25): a city grows at
  its rate × (1 − (people / limit)^1.25), was ^1. In the first 30 turns no city but the 16
  starting capitals reached level 2, in any seed: a non-capital needed 48 turns of peace to
  grow from 3,000 to the Forum's 6,000, since at 6,000 of its 8,000 limit it grew at a
  quarter of its rate, and drafting halved even that. A higher growth floor (3,000, or 40%
  of the limit) was modelled and barely helped (0–1 turns): a sacked city sits at half its
  limit, already on the fast part of the curve. Modelled at the median 3.4%, 3,000 → 6,000
  now takes 41 turns, a level-2 city sacked to half gets back in 33 (was 37). A curve of 2
  (31 turns) was measured first and rejected: exterminating became the best 100-turn choice
  for 11 of 55 cities (the balance test allows 1 in 10) and level-3 cities more than
  doubled. 1.5 (36 turns) did twice as much for the early game, but the player chose 1.25,
  the gentlest on the late game; it also leaves room under the extermination limit. At
  1.25 / 1.5, by turn 50 (4 seeds, `--garrison`): non-capitals at 6,000 people 7 to 7–13 /
  15–19, Forums built 3–6 to 2–9 / 7–10. Turn 100 at 1.25, 4 seeds, normal then
  `--garrison`: AI net income +35% / +17% (1.5: +44% / +21%), treasuries +17% / −6%,
  level 1 / 2 / 3 cities 11 / 31 / 14 to 6 / 28 / 21 and 13 / 28 / 15 to 10 / 27 / 21,
  basic-tier regiments 84% to 72% / 78% to 75%, land and sea trade routes −31% / −14% and
  −21% / −37% (the AI saves for its governments sooner, ahead of roads and ports),
  factions fallen 3 to 4 / 3 to 2, no invalid orders. Levers: exterminating best after 100
  turns 2 to 4 of 55 cities, "grow, then tax" overtakes normal at turn 43 (was 52), normal
  overtakes high at 86 (was 87). One game ended with Thrace at −8 gold (see the backlog).
  Regrowth for sacked cities was held back as a proposal (`docs/proposals/regrowth.md`).

- **The AI saves for its government buildings.** It had about 1 level 3 city a
  game, and we blamed watchtowers competing with the Senate, wrongly: removing
  them only took level 3 from 0 to 1 (scouts: 0 to 3). Tracing its gold showed 3%
  went on Forums and Senates, while 20 cities at turn 100 had the people for their
  next level. The build loop skipped what it couldn't afford and bought something
  cheaper, so it never saved 500 or 1,200 gold. Levers measured alone, in 8 seeds:
  saving 0 to 14 level 3 cities; never exterminating 1; cheaper government (350 /
  800) 2; fewer people needed (5,000 / 12,000) 0; a lower upkeep limit 0. The player
  chose saving only, which leaves their own rules alone. Real version, 24 seeds
  (normal, then `--garrison`): level 1 / 2 / 3 cities 32 / 22 / 1 to 23 / 20 / 13 and
  32 / 22 / 1 to 24 / 19 / 12; AI income +10% and +12%; soldiers, battles and factions
  fallen about the same; AI watchtowers fell by 60% (23 to 9), since it's usually
  saving when it would build one. Cities at level 2 by turn 50 hardly change: they
  haven't the people yet. Fewer people needed is the lever if early cities matter.

- **People pay per person, not per full 1,000.** Rounding down had no recorded
  reason, and a city earned nothing from growth until the next thousand. The player
  chose this first, over raising flat city gold from 5 to 10. It eases early money
  only a little. 16 seeds, master then this: AI net gold 46 / 83 / 117 to 62 / 92 /
  128 at turns 10 / 30 / 50, buildings per city 1.5 to 1.7 at turn 30. 24 seeds, turn
  100 (normal, then `--garrison`): AI income +16% and +20%, level-3 cities 13 to 14
  and 12 to 14, watchtowers 9 to 12 and 8 to 12; soldiers about the same. Levers still
  measured if it isn't enough, in 16 seeds at turns 10 / 30 / 50: flat city gold 10,
  net 64 / 108 / 158 and 2.0 buildings per city at turn 30, with war pace unchanged;
  first-level buildings a third cheaper, 58 / 112 / 160 and 3.0, but cities changing
  hands by turn 50 fell from 18 to 12. Both overshot: the richest AI doubled its
  gold. Upkeep cuts and more starting gold did little. Those were measured with the
  old rounding.

- **Cheaper start: level-1 buildings, training and upkeep.** The early game still
  felt slow: Rome netted ~50 gold a turn, and a Market square took 35 turns to pay
  back in a 3,000-people town. The player chose a split package over the earlier
  third-off-everything test (which slowed conquest): economic level-1 buildings −15%
  (Market square, Fields, Jetty, Tracks 150 → 130, Quarry 200 → 170), military −10%
  (Spear yard 135, Archery range 180, Stables 225, Palisade 180), training gold −10%
  and upkeep −15% for every unit (per soldier, so every tier keeps its trade-off).
  Levels 2 and 3 are unchanged. Upkeep was first cut by 25%: AI net income rose +41%
  at turn 50 but +47% / +69% at turn 100 (treasuries 602 → 1,011 with `--garrison`),
  since upkeep saves every turn, all game; the player trimmed it to 15%. At −15%,
  8 seeds, 50 turns (normal, then `--garrison`): AI net income +13% / +0%, treasuries
  +14% / +1%, upkeep 22% → 18% / 24% → 18% of income, cities not with first owner
  17 → 16 / 15 → 14, battles +17% / +16%, sieges of walled cities 2 → 8 / 3 → 7, sea
  trade routes 3 → 6 / 3 → 6. 4 seeds, 100 turns: AI net income −1% / +4%, treasuries
  +3% / +4%, regiments alive 226 → 246 / 224 → 271 (the AI spends the saving on
  armies), cities not with first owner 24 → 32 / 24 → 26, factions fallen 3 → 5 / 3 → 2,
  level-3 cities 19 → 20 / 20 → 21, basic-tier regiments 75% → 65% / 71% → 60%, sieges
  of walled cities about double and storms 2 → 7 / 1 → 8; no invalid orders or debt.
  Levers: "grow, then tax" overtakes normal at turn 44 (was 43); exterminating is best
  after 100 turns in 4 of 55 cities.

- **Growth +5%, road-or-sea trade, sea trade +25%.** The player asked for more base
  growth, and for cities joined by a road (their land borders) to trade only by land,
  never by sea as well: before, ~20% of route-ends at turn 100 were a sea route doubling
  a land one. Every terrain's growth rate went up 5% (plains 5% → 5.25%, forest and sea
  3.5% → 3.675%, hills 2.5% → 2.625%, mountains and desert 1% → 1.05%), in the terrain
  table rather than as a multiplier, so farms and ports, which add a share of it, grow
  with it. ×1.1 and ×1.2 were measured first; the player wanted a smaller swing. Sea
  trade pays 0.5 / 0.875 / 1.25 per 1,000 people (was 0.4 / 0.7 / 1, as roads still are),
  to make up for the sea routes the road rule removes. A third change, markets
  multiplying only trade (with trade gold +50% and the market's trade bonus doubled),
  was measured and dropped: exterminating became the best choice after 50 turns in
  20–29% of cities (`tests/balance.test.ts` allows 15%), since occupied cities earned
  less while plunder didn't change, and cities changing hands fell 19–36%. Shipped,
  against master, 8 seeds, 50 turns (normal, then `--garrison`): AI net income +5% /
  +15%, treasuries −3% / +15%, cities not with first owner 16 → 14 / 14 → 13, battles
  −1% / −6%, level-2 cities 19 → 23 / 20 → 22, sea routes 6 → 2 / 6 → 3. 4 seeds, 100
  turns: AI net income −4% / +29%, treasuries 659 → 682 / 626 → 711, cities not with
  first owner 32 → 25 / 26 → 25, factions fallen 5 → 4 / 2 → 3, level-3 cities 20 → 23 /
  21 → 24, sea routes 35 → 17 / 24 → 17, trade 24% → 18% / 22% → 19% of AI city gold;
  no invalid orders or debt. Levers: exterminating best after 100 turns in 2 of 55
  cities (was 4), "grow, then tax" overtakes normal at turn 40 (was 44).

## Economy tuning history

The economy was retuned several times; the lesson each time:
1. Money was too tight (markets paid back in 50 turns) → raised income,
   cheaper markets, stronger mines, higher upkeep.
2. Then the late game overflowed (100k+ cities, AIs hoarding 40k gold) →
   cut capacity, smaller starting cities, then **capacity tied to the
   government level**, which solved it (largest cities ~23k at turn 100,
   AI treasuries ~1k).
3. The AI needed explicit rules to spend well: defense training first, then
   building (keeping a small reserve), then field regiments; it saves for a
   building once it has 5 regiments per city.
4. **The economic levers were measured with buildings in the model**
   (`npm run levers`, `tools/economy.ts`): a peacetime economy where cities
   build up as the AI does. A first model without construction said high
   taxes always win and low taxes never pay; that was wrong, because growth
   pays back through higher levels and better buildings. With them:
   - Taxes: all-high leads for most of a game, but "grow, then tax" (low
     until a city has the people for its next level, high after) overtakes
     it around turn 70 and ends 100 turns ~55% ahead. That's the intended
     play. The AI keeps normal taxes, except that a full city (95% of its
     capacity) pays high: it can't grow, so that costs nothing. That lifted
     AI income ~11% and got more of its cities to level 3 in full games.
   - Conquest: exterminating pays most for ~10 turns (its plunder is ~6
     turns of the city's income, and halved cities regrow fast); occupying
     overtakes it after ~18 turns, enslaving sits between (and, since its
     losses were halved, is the best 25-turn choice in about half the cities).
     The AI enslaved, or exterminated when short of gold, and never occupied
     (changed since: see "The AI occupies", under Sieges).
   - Population caps (8k / 20k by level, then the land) matter: a city at
     its level cap gains nothing from low taxes.
   - Accepted exception: exterminating a big city (near its level's cap)
     can pay a poor conqueror more even over 50–100 turns, because the
     plunder buys early buildings and the halved city regrows fast.
     Camulodunon, taken by a faction with 394 gold, was +15% at 50 turns.
     Cutting plunder (30 gold per 1,000, or no level bonus) was measured and
     rejected: the exception is fine as long as it stays rare.
   `tests/balance.test.ts` keeps these trade-offs from collapsing: it allows
   exterminating to be the long-run best for only a few cities.
Always measure before and after: `npm run compare -- --base master`
plays the same seeds with both versions (one game is too noisy: a single
early war changes everything after it), `npm run simulate` shows one game
in detail, and `npm run levers` covers the economy.

- **Farms and ports earn a trickle of gold** (0.5 / 1 / 1.5 per plains tile
  and per sea tile on the coast), and the port's growth bonus went from
  +20/40/60% to +30/60/90% (still scaled by the sea share). Growth
  compounds through city levels (farms bring the Forum at turn 46 instead of
  54, the Senate at 79 instead of 99, and nearly double a city's income by
  turn 100), but on its own it only caught up with gold buildings around
  turn 90, so Fields paid for themselves in a third of level-1 cities and a
  Jetty almost never (its +8% growth at the median sea share hardly
  compounds). The player chose a smaller trickle plus stronger ports over a
  big trickle (it would make farms out-earn the market) or growth alone.
  Modelled, one city at a time: Fields pay back by turn 41 (was never),
  a Jetty by 38 (was never), the market (29) and quarry (15) unchanged;
  farms + port + market earns 6,135 gold by turn 100 against 3,328, while
  gold buildings still lead over the first 50 turns. In 8 AI games the
  AI's median income rose 11% (311 to 345), it built more farms and ports,
  and still nobody went into debt; cities taken 197 (was 219), factions
  fallen 13 (was 12).

- **Trade between a faction's own cities.** Roads were movement only and last in
  the AI's order; ports paid a trickle per sea tile. Now a land route joins two own
  cities whose land borders, both with roads; a sea route two own ports within 6 / 16
  / 40 sea steps. The player chose own cities only (no diplomacy: every faction is at
  war) and the building at both ends. A route runs at the lower level and pays each
  end 0.4 / 0.7 / 1 gold per 1,000 people at the other end; a siege at either end cuts
  it. Routes are mapped once at setup (`City.landNeighbours`, `City.seaDistances`).
  The market became trade-focused: +25 / 50 / 80% on other income (was 30 / 60 /
  100%), +50 / 100 / 150% on trade. Sea trade replaced the port's per-tile gold.
  Peacetime gold by turn 25 / 50 / 100: 48k / 143k / 573k to 45k / 142k / 675k (the
  early dip is the weaker market before routes exist). 4 seeds, normal then
  `--garrison`: AI net income −2% / −1%, treasuries +13% / +2%, city levels and
  factions fallen about the same, battles −4% / −17%; trade is 13–20% of AI city gold
  at turn 100 (22–36 routes), and no AI city built level-3 roads or ports. At
  start-size cities a pair of Tracks pays back in 60 turns, of Jetties 75 (faster as
  cities grow); a market square in 38 without trade (was 29), 21 with it. Rome
  gains most: its cities share coasts, so a Roman port has up to 6 partners, against
  1–3 for most AIs. A coastal city with no port of its own in range earns nothing
  from a port but its growth.
- **Enemy armies cut trading roads.** A land route runs along its road; a foreign army
  on the road or next to it (its zone of control) cuts it, paying nothing while it
  stays. The owner is told once when it's cut and once when it's open again
  (`City.cutRoads`); the map draws built roads by level and the player's own cut roads
  in red dashes. Cut status isn't shown for other factions' roads: it would give away
  armies in the fog. With the movement change above, 4 seeds against master (normal,
  then `--garrison`): AI net income +10% / +10%, battles +27% / +21% (armies move fast
  along roads), land trade routes at the end 10 to 12 / 10 to 14, trade 17% to 18% /
  15% to 22% of AI city gold, factions fallen 3 to 3 / 2 to 3, level-1 cities 9 to 12 /
  8 to 10; no invalid orders or debt. **The AI almost never cuts a road**: 0–1% of land
  route-turns. A trading road joins two cities of one faction, so it runs through that
  faction's interior, and only about 5 exist at a time. AI raiding was built and
  measured (spare regiments sent to sit on a rival's trading road): even with a 12-tile
  reach, a rival road was in range 5 times in 121 chances, and none was ever occupied.
  The player chose to ship without it, so cutting roads is a tool for the player.

## Interface

- **3D campaign map** (three.js), tilted camera, raised terrain. The 2D
  canvas map was removed. Models are built in code; real `.glb` files can
  replace them via `models/models.json`.
- **An army is one standard-bearer** with a banner showing its strength and a
  pip per regiment, whatever it contains. It only animates while actually
  moving (walks tile to tile over land, including when merging into another
  army). A garrison isn't drawn: the city's banner shows its strength
  instead; half-mast banner = undefended; enemy cities in fog show a plain
  banner.
- **Panels**: box grids for regiments, units and
  buildings, with queues below. Minimal explanatory text (the player found
  the UI too wordy): show what's blocked and why; details go in tooltips.
- **No army block in the side panel.** Its size, owner, upkeep and "Choose
  regiments to order" took space the regiment cards in the bar already
  cover; the panel keeps only an army's orders (march, what blocks it,
  Besiege).
- **Cards in a bottom bar, facts and city work in the side panel.** One panel
  held too much. The selection bar (bottom centre) shows what's selected as
  cards: Army (regiments, ticked for orders) and Town (buildings built), for
  enemy cities too. The side panel (top left) keeps facts, taxes and the
  Construction / Recruitment / Retraining tabs. Selecting a city opens the
  bar on Army. Construction lists only buildings the city can build next
  (`buildingAvailable`): ones it can't yet are hidden, ones it can't afford
  are greyed out. The reports moved under the turn panel to free the bottom.
- **Reports** replace the log: notifications at the start of the player's
  turn, filtered to what concerns them plus world news. They last one turn:
  ending the turn clears them, and there's no history view (a running log
  piled up).
- **Enemy turns play out on the map.** The player couldn't tell when or
  where they were attacked: the controller ran each AI turn in one go. Now
  it can hand each AI action to the browser (`showAiAction`), which plays
  the ones the player can see (camera glide, faster enemy walks, a clash
  and banner for battles) and skips the rest, so the fog gives nothing
  away. The player chose always-on and quick over a setting: enemy walks
  0.15 s a tile (at most 0.9 s), holds of 80 ms after a move and 450 ms
  after a battle, and a 40 ms pause per AI turn (was 150). A round takes
  about 2 s with nothing in sight and 3–6 s with enemies close; Space or
  Esc skips. Banners never put a verb after a faction's name (Greeks,
  Gauls and Pontus would need different ones).
- **An army that attacks strikes**, with the same clip as a siege's first blow,
  lunging at the target: the player's armies too, whose result opens about a second
  later so the blow can be seen. The player's army that wins its way onto a tile
  strikes, then walks in; an AI army has already walked in by the time its battle
  plays, so it shows no blow. Nor does an attacker that was beaten and fled.
- **Besiegers strike once, as the siege starts, then stand ready.** A strike
  every few seconds kept going off for as long as a siege lasted, and the player
  didn't like it. The map view remembers the first blow, as an army's figure is
  rebuilt whenever its look changes.
- **Money breakdown** under the treasury; per-city income line in the city
  panel. March routes are coloured per turn.

## Backlog and known issues

- **Phase 9: save and load** (not started; keep state serializable).
- Late-game spending: a city still trains only one regiment a turn. Recruitment
  slots by city level (1/2/3) were proposed; unit buildings and tiers gate
  units instead.
- The AI doesn't single out the player; it targets whoever is cheapest to
  take.
- Territory can straddle a sea crossing (cosmetic).
- The test suite plays whole games and checks invariants; there are no unit
  tests of single rules yet, and no automated browser checks.
- Public order / unrest was discussed, not built.
- A faction whose last city is besieged earns nothing but still pays upkeep, and can fall
  in debt (Thrace, −8, in one compare game at the 1.25 growth curve). `npm test` would
  fail on it as an AI in debt. Fix: skip fallen factions in the debt check, or keep upkeep
  from taking a treasury below zero.
- Regrowth (a city below its old size grows faster until it's back) is proposed, not
  built: `docs/proposals/regrowth.md`.
