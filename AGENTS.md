# Unlimited War

A browser-based, turn-based grand strategy game set in the Mediterranean world
of 218 BC. The player is Rome; 13 AI factions share a hex map from Iberia to
Syria and from Egypt to Britain. 3D map (three.js), turn-based rules engine,
AI opponents. TypeScript, no bundler, no framework.

`README.md` is the player-facing rulebook. `docs/DECISIONS.md` records why the
rules and numbers are what they are; read it before changing game rules,
balance or the AI.

## Commands

```sh
npm install              # once; three.js is served straight from node_modules
npm run dev              # tsc --watch + static server on http://localhost:3000
npm run build            # tsc; must finish with no errors
python3 tools/simulate.py [--turns 100] [--garrison] [--url URL]
                         # headless AI-vs-AI game; needs the game served (npm run dev)
                         # and `pip install playwright && python -m playwright install chromium`
```

Regenerating the map (only when changing coastlines, terrain or islands):

```sh
pip install shapely
curl -L -o tools/ne_50m_land.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson
python3 tools/build_europe_map.py        # rewrites src/map/europe/europeTerrain.ts
```

Coastlines come from Natural Earth; mountain ranges, deserts, forests and
hills are rough outlines inside the script, so edit them there.

## Architecture

Game state is plain data. Rules are pure functions. Everything else reads
state and sends actions.

```
src/
  core/        state.ts (all types, small helpers), actions.ts (Action union +
               applyAction, the ONLY way state changes), setup.ts (new game),
               context.ts (fixed info: the map topology), rng.ts (seeded)
  data/        every tunable number: terrain, units, economy, buildings,
               combat, siege, conquest, vision, ai, gameSetup; scenarios/
               romanWorld.ts (factions, cities, colours)
  systems/     the rules, as pure functions of state: armies (movement,
               marches, zone of control, merging), combat (battles, battleSides,
               previews), cities (growth, income, capture), buildings
               (construction queue), recruitment (training/retraining queue),
               siege, conquest (occupy/enslave/exterminate), vision (fog),
               turn (start/end of each faction's turn), victory, pathfinding
  ai/          ai.ts (nextAction: one action at a time), assess.ts (targets,
               threats, relief of besieged cities)
  game/        controller.ts: holds the state, runs AI turns, notifies the UI
  map/         hex topology, sea crossings (europe/europeMapEngine.ts),
               generated terrain (europe/europeTerrain.ts: do not hand-edit)
  render/      three/ (the 3D map: mapView3d, terrain3d, models, camera3d),
               mapView.ts (ViewState, MapCamera), input.ts, figures.ts (SVG
               unit art for panels), colors.ts, format.ts
  ui/          panels as HTML strings: infoPanel (army + city tabs), turnPanel
               (scoreboard, money breakdown), battlePanel, battleResult,
               siegePanel, settlementPanel, reports (notifications), gameOver
  main.ts      wires it all together; view state; player input
tools/         build_europe_map.py (map generator), simulate.py (AI games)
models/        optional .glb models listed in models/models.json
```

Imports use the `@/` alias with a `.js` extension (`@/systems/combat.js`),
never `../`, resolved by tsconfig `paths` and the import map in `index.html`
(`@/` → `dist/`, `three` → `node_modules`). Keep it bundler-free.

`core`, `data`, `map`, `systems`, `ai` and `game` never import from `render`.
Only the map engine's own files may assume hexes; everything else uses
`MapTopology` (`map/topology.ts`) and the tile data, so a new `MapEngine` can
be swapped in through a scenario.

## Rules that must not break

- **State changes only through `applyAction`** (`core/actions.ts`). Systems
  return new state objects; never mutate. After every successful action,
  `dropStrayRetraining` tidies recruitment queues.
- **State stays plain, serializable data** (no classes, Maps or functions):
  save/load (Phase 9) depends on it.
- **The AI never issues an invalid action.** It decides from a *fogged* view
  (`systems/vision.ts`: only what it can see) but plans moves against the real
  state. `tools/simulate.py` must report `INVALID 0` and nobody in debt.
- **Every number lives in `src/data/`.** Don't hardcode rules numbers
  elsewhere. Regiment sizes differ by unit: use `regimentSize(unit)`, never a
  fixed 100.
- **No `Math.random` in game logic.** Use the seeded RNG in `core/rng.ts`.
- **One army per tile**, at most 10 regiments. A city's garrison is the army
  on its tile.
- **Log entries** go through `addLog(state, text, { kind, factions, major })`
  so the reports tray can tell who hears about what.
- The player's decisions that block ending a turn (a captured city's fate)
  must also be handled by the AI (`settleAction` in `ai/ai.ts`).

## Conventions

- Plain-English doc comment on every exported function and on any logic whose
  *why* isn't obvious. Name things in game terms (garrison, siege, regiment).
- Strict TypeScript; `npm run build` clean before finishing any change.
- Game-facing text is short. The UI deliberately avoids explanatory
  paragraphs: say what's blocked and why, nothing more. Longer detail goes in
  `title` tooltips.
- When a rule changes, update `README.md` (the rulebook) in the same change,
  and add a line to `docs/DECISIONS.md` if the *why* matters.

## Testing a change

1. `npm run build` with no errors.
2. For rules, data or AI changes: `python3 tools/simulate.py` (and
   `--garrison`). Check INVALID 0, nobody in debt, city levels spread across
   1–3, treasuries not piling up, and factions still conquering each other.
3. For UI or map changes: check in a browser. Headless Chromium can run the
   3D map with `--use-gl=angle --use-angle=swiftshader
   --enable-unsafe-swiftshader`. The debug hook at the end of `src/main.ts`
   (`Object.assign(window, { game: … })`) exposes `game.state`,
   `game.controller` (`dispatch(factionId, action)`, `options.aiTurnDelayMs`),
   `game.camera`, `game.topology`, `game.view` and `game.mapView.screenOf(tile)`
   (a tile's screen position, for clicking it). Keep that hook; if it's
   missing, restore it. (`tools/simulate.py` doesn't need it: it imports the
   game modules and builds its own game.)

## Working with this user

- They direct the design.
- Keep references to other commercial games out of the repo: code, comments,
  docs and commit messages.
- For balance changes, **plan first**: measure the current numbers (e.g. with
  `tools/simulate.py`), then propose changes as a before/after table, and
  implement after they agree.
- Implement what's asked; if a request is ambiguous, say which reading you
  took. If a change has knock-on effects (e.g. smaller cities making the
  early economy poorer), fix or flag them rather than leaving them silent.
- Report results with the evidence: what was tested and what it showed.
