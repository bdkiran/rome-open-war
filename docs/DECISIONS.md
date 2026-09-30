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
- **Sicily is its own island** (the generator carves the Strait of Messina
  using Sicily's real coastline), reached by sea crossings to Italy and
  Africa. Rome holds Syracusae, Carthage Lilybaeum.
- **Sea crossings** (Pillars of Hercules, Messina, Sicily–Africa, the
  Channel, Corsica–Sardinia, Corsica–Italy) are ordinary steps in the
  topology (`links()`), so every city is reachable by land.
- **Every starting city can reach level 3.** Tarsus's land held only 14,000
  people (the Senate needs 15,000) because the Taurus band buried it in
  mountains. The generator now draws the Cilician plain (`PLAINS`), which
  lifts it to 18,700 and Antiochia to 40,300; `tests/map.test.ts` keeps every
  city at least 10% above the Senate's need. Raising sea or mountain capacity
  instead was rejected: it would have shifted the economy of 20–30 cities.
- **Fixed territory.** Each city claims land within 2 tiles at the start and
  it never changes. Cities never claim sea, but sea tiles in reach count as
  fishing grounds (capacity and growth), because coastal cities were
  otherwise tiny.

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

- Rock-paper-scissors: spearmen beat cavalry, cavalry beat archers, archers
  beat spearmen (×1.5 for the advantaged side only). Small random factor;
  battle odds shown in the battle panel are computed exactly.
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

## Armies and recruitment

- **Regiment sizes differ by unit** (spearmen 200, archers 160, cavalry 120)
  at the same gold per soldier as before (1/2/3), so the balance between
  units holds. Keeping regiment prices at 100/200/300 was rejected: it would
  have made spearmen twice as good per gold.
- **One army per tile, up to 10 regiments**; stacks move at the pace of the
  slowest chosen regiment; moving part of a stack splits it.
- **Recruitment queue** per city (6 orders), shared by training and
  retraining, paid in gold when queued, people taken when done. **Training:
  one new regiment per turn. Retraining: everything queued is done by next
  turn**, wherever it sits in the queue. A regiment that leaves the city (or
  dies) is dropped from the queue and refunded immediately.
- Merging combines only under-strength regiments of the same type.

## Cities and economy

- **The government building sets how big a city can get**: level 1 holds
  8,000 people, level 2 20,000, level 3 whatever its land supports. Forum
  needs 6,000 people, Senate 15,000 (each limit sits above the next
  threshold). This, more than anything, fixed late-game runaway growth and AI
  gold hoarding.
- **Farms only speed growth** (they used to add capacity too).
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
     play. The AI stays on normal, so it plays neither.
   - Conquest: exterminating pays most for ~10 turns (its plunder is ~6
     turns of the city's income, and halved cities regrow fast); occupying
     overtakes it after ~18 turns, enslaving sits between. A real choice.
     The AI enslaves, or exterminates when short of gold; it never occupies.
   - Population caps (8k / 20k by level, then the land) matter: a city at
     its level cap gains nothing from low taxes.
   `tests/balance.test.ts` keeps these trade-offs from collapsing.
Always measure with `npm run simulate` (and `npm run levers` for the
economy) before and after.

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
- Late-game spending: a city still trains only one regiment a turn; recruitment
  slots by city level (1/2/3) was proposed and not yet chosen.
- The AI doesn't single out the player; it targets whoever is cheapest to
  take.
- Territory can straddle a sea crossing (cosmetic).
- The test suite plays whole games and checks invariants; there are no unit
  tests of single rules yet, and no automated browser checks.
- Public order / unrest was discussed, not built.
