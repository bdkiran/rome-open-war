"""
Plays a whole game with the AI controlling every faction except the player,
who just ends their turns, and prints how it went. Use it after any change to
the rules, the numbers in src/data/ or the AI, to check that:

  - the AI never issues an invalid order (the count must be 0),
  - nobody ends up in debt,
  - cities grow and advance, treasuries don't pile up, and the war moves.

It runs the real game code (the compiled modules in dist/) in a headless
browser, building its own game from them, so the game must be built and
served first:

    npm run dev                       # in another terminal (serves on :3000)
    pip install playwright && python -m playwright install chromium
    python3 tools/simulate.py                  # 100 turns
    python3 tools/simulate.py --turns 60 --garrison

--garrison gives the passive player a strong garrison in each city, so the AIs
fight each other instead of just overrunning the player.
"""

import argparse
import sys

from playwright.sync_api import sync_playwright

SIMULATION = """
async ({ turns, garrison }) => {
  const A = await import('@/core/actions.js');
  const S = await import('@/core/state.js');
  const AI = await import('@/ai/ai.js');
  const Ar = await import('@/systems/armies.js');
  const C = await import('@/systems/cities.js');
  const U = await import('@/data/units.js');
  const { createGame } = await import('@/core/setup.js');
  const { ROMAN_WORLD } = await import('@/data/scenarios/romanWorld.js');
  // A fresh game, built the same way src/main.ts builds one.
  const map = ROMAN_WORLD.mapEngine.createMap();
  const ctx = { topology: map.topology };
  let st = createGame(ctx, map, ROMAN_WORLD);
  const player = st.factions.find(f => f.controller === 'human').id;
  const out = [];

  if (garrison) {
    for (const c of S.citiesOf(st, player)) {
      const here = S.armyAt(st, c.tile);
      if (here) delete st.armies[here.id];
      const units = ['spearmen', 'spearmen', 'archers', 'archers', 'cavalry', 'cavalry'];
      st.armies['g' + c.id] = {
        id: 'g' + c.id, owner: player, tile: c.tile, destination: null,
        regiments: units.map((u, i) => ({ id: 'g' + c.id + i, unit: u, soldiers: U.regimentSize(u), movementLeft: 0, fresh: false, pinned: false })),
      };
    }
  }

  const byType = {};
  let actions = 0, invalid = 0, most = 0;
  const snapshots = new Set();
  const started = performance.now();
  const summary = () => st.factions.map(f => {
    const soldiers = S.armiesOf(st, f.id).reduce((n, a) => n + S.armySoldiers(a), 0);
    const net = Math.round(C.factionIncome(st, f.id) - Ar.factionUpkeep(st, f.id));
    return `${f.shortName}${f.alive ? '' : ' (fallen)'}: ${S.citiesOf(st, f.id).length} cities, ${soldiers} soldiers, ${f.gold} gold, ${net >= 0 ? '+' : ''}${net}/turn`;
  });

  while (st.turn <= turns && st.factions.filter(f => f.alive).length > 1) {
    const f = S.currentFaction(st);
    if (f.controller === 'human') {
      if ([25, 50, 75].includes(st.turn) && !snapshots.has(st.turn)) {
        snapshots.add(st.turn);
        out.push(`Turn ${st.turn}:\\n  ` + summary().join('\\n  '));
      }
      // Decide any captured city's fate so the turn can end, then end it.
      for (const c of S.citiesOf(st, f.id).filter(c => c.unsettled)) {
        st = A.applyAction(ctx, st, f.id, { type: 'settleCity', cityId: c.id, choice: 'occupy' }).state;
      }
      st = A.applyAction(ctx, st, f.id, { type: 'endTurn' }).state;
      continue;
    }
    let n = 0;
    for (; n < 200; n++) {
      const a = AI.nextAction(ctx, st, f.id);
      byType[a.type] = (byType[a.type] ?? 0) + 1;
      const r = A.applyAction(ctx, st, f.id, a);
      if (!r.ok) {
        invalid++;
        out.push(`INVALID ${f.id}: ${JSON.stringify(a)}: ${r.reason}`);
        st = A.applyAction(ctx, st, f.id, { type: 'endTurn' }).state;
        break;
      }
      st = r.state;
      actions++;
      if (S.currentFaction(st).id !== f.id) break;
    }
    most = Math.max(most, n + 1);
  }

  const ms = performance.now() - started;
  const cities = Object.values(st.cities);
  const levels = [1, 2, 3].map(l => cities.filter(c => c.buildings.government === l).length);
  const pops = cities.map(c => c.population).sort((a, b) => b - a);
  out.push(`Final (turn ${st.turn}):\\n  ` + summary().join('\\n  '));
  out.push(`City levels: ${levels[0]} at level 1, ${levels[1]} at level 2, ${levels[2]} at level 3`);
  out.push(`Largest cities: ${cities.sort((a, b) => b.population - a.population).slice(0, 5).map(c => `${c.name} ${c.population}`).join(', ')}; median ${pops[Math.floor(pops.length / 2)]}`);
  out.push(`AI: ${actions} actions in ${(ms / 1000).toFixed(1)}s (${(ms / Math.max(actions, 1)).toFixed(2)} ms each), most in one turn ${most}, INVALID ${invalid}`);
  out.push(`Actions by type: ${Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(', ')}`);
  const debt = st.factions.filter(f => f.gold < 0);
  out.push(`In debt: ${debt.length ? debt.map(f => `${f.shortName} ${f.gold}`).join(', ') : 'nobody'}`);
  return { text: out.join('\\n'), invalid };
}
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--turns", type=int, default=100, help="turns to play (default 100)")
    parser.add_argument("--garrison", action="store_true", help="give the passive player strong garrisons")
    parser.add_argument("--url", default="http://localhost:3000/", help="where the game is served")
    args = parser.parse_args()

    with sync_playwright() as p:
        # SwiftShader lets headless Chromium run the 3D map without a GPU.
        browser = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        page = browser.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        # The page is only needed for its import map and compiled modules;
        # the simulation builds its own game from them.
        page.goto(args.url, wait_until="load")
        result = page.evaluate(SIMULATION, {"turns": args.turns, "garrison": args.garrison})
        browser.close()

    print(result["text"])
    if errors:
        print("Page errors:", *errors[:5], sep="\n  ")
    sys.exit(1 if result["invalid"] or errors else 0)


if __name__ == "__main__":
    main()
