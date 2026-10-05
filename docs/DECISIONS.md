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
- **Sicily is a round island**: the generator draws it as a disc of 19 hexes
  (`ROUND_ISLANDS`) instead of its coastline, which at this scale came out
  as a thin strip too small to share between three cities (Rome's Messana,
  the Greeks' Syracusae, Carthage's Lilybaeum). Land touching the disc is
  turned to sea, so the Strait of Messina stays open.
- **Sea crossings** (Pillars of Hercules, Messina, Sicily–Africa, the
  Channel, Corsica–Sardinia, Corsica–Italy, Sardinia–Africa) are ordinary steps in the
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
- **Bigger territories, cities spread apart.** With a 2-tile radius only 16%
  of the land belonged to any city. The radius is now 3, and a city closer
  than 7 tiles to one already placed moves up to 4 steps over land (never
  across the sea) to keep their land apart; where it can't, it goes as far
  from its neighbours as it can and the land is split by nearest city. The
  player wanted cities moved rather than sharing, and cities of unequal
  size. Median land per city went from 13 tiles to about 24.
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
- **The city list is the player's**: 15 factions with 2 to 7 cities each
  (Rome holds 7 in Italy and Sicily). Parthia and Armenia were left out:
  their cities are beyond the map's eastern edge; Seleucia sits on the edge.
  The player chose plain historical names for factions and regions.
- **Crowded cities were moved or dropped** so every city can still reach
  level 3 (the player chose that over letting small cities top out at 2).
  With halved capacity, ten crowded or edge cities had too little land.
  Seven moved up to 1.5° from their real sites (Seleucia, Sidon, Ariminum,
  Memphis, Sparta, Mediolanum, Rhodos); three with no such site were
  dropped (Thessalonica beside Pella, Thermon in crowded Greece, Thebae,
  which could only fit in Sinai).

## Factions

- 14 factions: Rome (the player, 4 cities including Syracusae) and 13 AIs with
  3 cities each. Colours were chosen against each faction's *neighbours*
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
- **Roads** (any city, three levels) cut the cost of entering the city's
  tiles: Tracks make rough ground cost like plains, Roads the mountains too,
  Paved roads make every tile cost 1. They help every army, enemies
  included: roads are for whoever marches on them, so building them near a
  border is a real risk. Costs stay whole numbers so movement reads the same.
  All tile costs go through `enterCost` (systems/pathfinding.ts).
- **Zone of control:** entering a tile next to an enemy army ends the move;
  the army can still attack. Armies can't slip past each other.
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
  bring everything. Losing side loses every army that fought.
- **Besieged garrisons are shut in**: they can't move, march or lay siege,
  can only attack their besiegers (from their own walls), and only join
  battles against them. Letting them walk out left the city empty for free.

## Sieges

- Clicking an enemy city lays siege and opens the siege screen (Continue /
  Storm / Withdraw). An empty city in sight is simply taken.
- **Supplies are a countdown to surrender**, not starvation: 3/4/5 turns by
  city level, +1 for capitals. Attrition from turn one (garrison −5%, people
  −1% a turn). When supplies run out the city surrenders and its garrison is
  destroyed. The old "starve then lose 25% a turn" model felt too abrupt.
- **The AI defends its cities**: raises war taxes, trains a relief force in
  the nearest free city, marches every field army there, attacks besiegers at
  even odds, and its garrison sallies at even odds, at 0.6 when two turns
  from surrender, and at any odds on its last turn ("last stand").

- **AI priorities**, one action at a time from a fresh look at the game:
  merge damaged regiments; attack at good odds (20% stronger, counting joined
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
- **An army can't stage an attack from inside one of its own besieged
  cities** (except on the besiegers): marching in shuts it in. This was
  allowed by mistake and only showed once the AI laid sieges.

## Armies and recruitment

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
  plains.
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
     The AI enslaves, or exterminates when short of gold; it never occupies.
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
Always measure with `npm run simulate` (and `npm run levers` for the
economy) before and after.

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
