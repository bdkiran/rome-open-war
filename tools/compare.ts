/**
 * Balance comparison: plays the same AI-vs-AI games (one per seed) with the
 * current code and, with --base, with another version from git, and prints
 * the two side by side. A single game is noisy (one early war changes
 * everything after it), so judge a change by the medians over several seeds.
 *
 *   npm run compare                                  # current code, seeds 1-4
 *   npm run compare -- --base master                 # against master
 *   npm run compare -- --base HEAD~1 --seeds 6 --turns 60 --garrison
 *
 * --base takes any git ref. That version is checked out in a temporary
 * worktree, built there and removed afterwards; uncommitted changes count as
 * the current code. Games run in parallel, one Node process each (--jobs to
 * limit them). --garrison gives the passive player strong garrisons, as in
 * `npm run simulate`.
 *
 * Each game runs in a worker process started with the register hook of the
 * version it plays, so the `@/` imports below the worker resolve to that
 * version's build. That's why the worker loads the game modules by path and
 * reads the final state field by field: it must work with older versions.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { GameState } from "@/core/state.js";

/** One game's numbers. */
interface GameMetrics {
  seed: number;
  invalid: number;
  stuck: number;
  aiInDebt: number;
  factionsFallen: number;
  citiesChangedHands: number;
  battles: number;
  level1: number;
  level2: number;
  level3: number;
  medianAiIncome: number;
  medianAiGold: number;
  aiSoldiers: number;
  watchtowers: number;
  veterans: number;
  seasoned: number;
  topLevel: number;
  regiments: number;
  seconds: number;
}

/** The rows of the table, in order, with how to label them. */
const ROWS: { key: keyof GameMetrics; label: string }[] = [
  { key: "medianAiIncome", label: "Median AI net income/turn" },
  { key: "medianAiGold", label: "Median AI treasury" },
  { key: "aiSoldiers", label: "AI soldiers" },
  { key: "citiesChangedHands", label: "Cities not with first owner" },
  { key: "factionsFallen", label: "Factions fallen" },
  { key: "battles", label: "Battles" },
  { key: "level1", label: "Cities at level 1" },
  { key: "level2", label: "Cities at level 2" },
  { key: "level3", label: "Cities at level 3" },
  { key: "watchtowers", label: "Watchtowers" },
  { key: "regiments", label: "Regiments alive" },
  { key: "veterans", label: "Regiments at experience 1-2" },
  { key: "seasoned", label: "Regiments at experience 3-5" },
  { key: "topLevel", label: "Regiments at experience 6" },
  { key: "seconds", label: "Seconds per game" },
];

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};

if (flag("worker")) {
  await runWorker();
} else {
  await runComparison();
}

// ---- Worker: one game -------------------------------------------------------

/** Plays one game with the version at --root and prints its numbers as JSON. */
async function runWorker(): Promise<void> {
  const root = option("root")!;
  const load = (path: string) => import(pathToFileURL(join(root, "build", path)).href);
  const { simulate } = await load("tools/simulation.js");
  const { factionIncome } = await load("src/systems/cities.js");
  const { factionUpkeep } = await load("src/systems/armies.js");

  const seed = Number(option("seed"));
  let firstOwners: Record<string, string> | null = null;
  const started = performance.now();
  const result = simulate({
    turns: Number(option("turns")),
    seed,
    garrison: flag("garrison"),
    onRound: (s: GameState) => {
      firstOwners ??= Object.fromEntries(Object.values(s.cities).map((c) => [c.id, c.owner]));
    },
  });
  const state: GameState = result.state;

  const ai = state.factions.filter((f) => f.controller === "ai");
  const aliveAi = ai.filter((f) => f.alive);
  const aiIds = new Set(ai.map((f) => f.id));
  const cities = Object.values(state.cities);
  const level = (n: number) => cities.filter((c) => c.buildings.government === n).length;
  // Versions before experience have no such file or field: every regiment counts as level 0.
  const experienceLevel: (points: number) => number = await load("src/data/experience.js").then(
    (m) => m.experienceLevel,
    () => () => 0,
  );
  const levels = Object.values(state.armies).flatMap((a) =>
    a.regiments.map((r) => experienceLevel((r as { experience?: number }).experience ?? 0)),
  );
  const metrics: GameMetrics = {
    seed,
    invalid: result.invalid.length,
    stuck: result.stuck.length,
    aiInDebt: ai.filter((f) => f.gold < 0).length,
    factionsFallen: state.factions.filter((f) => !f.alive).length,
    citiesChangedHands: cities.filter((c) => firstOwners && firstOwners[c.id] !== c.owner).length,
    battles: state.nextBattleNumber - 1,
    level1: level(1),
    level2: level(2),
    level3: level(3),
    medianAiIncome: median(aliveAi.map((f) => Math.round(factionIncome(state, f.id) - factionUpkeep(state, f.id)))),
    medianAiGold: median(aliveAi.map((f) => f.gold)),
    aiSoldiers: Object.values(state.armies)
      .filter((a) => aiIds.has(a.owner))
      .reduce((n, a) => n + a.regiments.reduce((m, r) => m + r.soldiers, 0), 0),
    // Versions before watchtowers have none.
    watchtowers: Object.keys((state as { watchtowers?: object }).watchtowers ?? {}).length,
    regiments: levels.length,
    veterans: levels.filter((l) => l >= 1 && l <= 2).length,
    seasoned: levels.filter((l) => l >= 3 && l <= 5).length,
    topLevel: levels.filter((l) => l >= 6).length,
    seconds: Math.round((performance.now() - started) / 100) / 10,
  };
  process.stdout.write(JSON.stringify(metrics));
}

// ---- Comparison: many games, two versions ---------------------------------

async function runComparison(): Promise<void> {
  const here = fileURLToPath(import.meta.url); // build/tools/compare.js
  const current = resolve(dirname(here), "..", "..");
  const seeds = Number(option("seeds") ?? 4);
  const turns = Number(option("turns") ?? 100);
  const base = option("base");
  const games = seeds * (base ? 2 : 1);
  const jobs = Number(option("jobs") ?? Math.max(1, Math.min(games, availableParallelism() - 1)));

  let baseRoot: string | null = null;
  try {
    if (base) baseRoot = prepareBase(current, base);
    console.log(
      `Playing ${seeds} seed${seeds === 1 ? "" : "s"} × ${base ? 2 : 1} version${base ? "s" : ""}, ` +
        `${turns} turns${flag("garrison") ? ", garrisoned player" : ""}, ${jobs} at a time…`,
    );

    const tasks: { version: "base" | "current"; root: string; seed: number }[] = [];
    for (let seed = 1; seed <= seeds; seed++) {
      if (baseRoot) tasks.push({ version: "base", root: baseRoot, seed });
      tasks.push({ version: "current", root: current, seed });
    }
    const results = await runAll(tasks, jobs, (t) => playGame(here, t.root, t.seed, turns));
    const byVersion = (v: string) => results.filter((_, i) => tasks[i].version === v);
    printReport(byVersion("current"), baseRoot ? byVersion("base") : null, base ?? null);
  } finally {
    if (baseRoot) removeBase(current, baseRoot);
  }
}

/** Checks out a git ref in a temporary worktree and builds it. Returns its folder. */
function prepareBase(current: string, ref: string): string {
  const folder = mkdtempSync(join(tmpdir(), "unlimited-war-base-"));
  rmSync(folder, { recursive: true });
  run("git", ["worktree", "add", "--detach", folder, ref], current);
  try {
    symlinkSync(join(current, "node_modules"), join(folder, "node_modules"));
    console.log(`Building ${ref} in ${folder}…`);
    run("npx", ["tsc", "-p", "tsconfig.node.json"], folder);
    if (!existsSync(join(folder, "build", "tools", "simulation.js"))) {
      throw new Error(`${ref} has no tools/simulation.ts to play games with`);
    }
  } catch (error) {
    removeBase(current, folder);
    throw error;
  }
  return folder;
}

function removeBase(current: string, folder: string): void {
  spawnSync("git", ["worktree", "remove", "--force", folder], { cwd: current });
}

function run(command: string, commandArgs: string[], cwd: string): void {
  const result = spawnSync(command, commandArgs, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(" ")} failed:\n${result.stdout}${result.stderr}`);
  }
}

/** Plays one game in a worker process for the version at `root`. */
function playGame(script: string, root: string, seed: number, turns: number): Promise<GameMetrics> {
  const workerArgs = [
    "--import", pathToFileURL(join(root, "tests", "register.mjs")).href,
    script, "--worker", "--root", root, "--seed", String(seed), "--turns", String(turns),
    ...(flag("garrison") ? ["--garrison"] : []),
  ];
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, workerArgs, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => {
      if (code !== 0) return fail(new Error(`Seed ${seed} in ${root} failed:\n${err}`));
      done(JSON.parse(out) as GameMetrics);
    });
  });
}

/** Runs tasks with at most `limit` at once, keeping results in task order. */
async function runAll<T, R>(tasks: T[], limit: number, work: (t: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(tasks.length);
  let next = 0;
  const lane = async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await work(tasks[i]);
      process.stdout.write(".");
    }
  };
  await Promise.all(Array.from({ length: limit }, lane));
  process.stdout.write("\n");
  return results;
}

// ---- Report -----------------------------------------------------------------

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** "median (min–max)" for one metric over the games (whole numbers, except seconds). */
function cell(games: GameMetrics[], key: keyof GameMetrics): string {
  const values = games.map((g) => g[key]);
  const range = values.length > 1 ? ` (${Math.min(...values)}–${Math.max(...values)})` : "";
  return `${median(values)}${range}`;
}

function printReport(current: GameMetrics[], base: GameMetrics[] | null, baseRef: string | null): void {
  const header = base ? ["", baseRef!, "current", "change"] : ["", "current"];
  const rows = ROWS.map(({ key, label }) => {
    if (!base) return [label, cell(current, key)];
    const before = median(base.map((g) => g[key]));
    const after = median(current.map((g) => g[key]));
    const change = before === 0 ? (after === 0 ? "" : "new") : `${after >= before ? "+" : ""}${Math.round(((after - before) / Math.abs(before)) * 100)}%`;
    return [label, cell(base, key), cell(current, key), change];
  });
  const widths = header.map((_, i) => Math.max(...[header, ...rows].map((r) => r[i].length)));
  const line = (r: string[]) => r.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join("   ");
  console.log(`\nMedians over seeds, with the range in brackets.\n`);
  console.log(line(header));
  for (const r of rows) console.log(line(r));

  // What must never happen, game by game: the same checks npm test fails on.
  const problems = (label: string, games: GameMetrics[]) =>
    games.flatMap((g) => {
      const found = [
        g.invalid && `${g.invalid} invalid AI orders`,
        g.stuck && `${g.stuck} stuck AI turns`,
        g.aiInDebt && `${g.aiInDebt} AI factions in debt`,
      ].filter(Boolean);
      return found.length ? [`  ${label}, seed ${g.seed}: ${found.join(", ")}`] : [];
    });
  const found = [...(base ? problems(baseRef!, base) : []), ...problems("current", current)];
  console.log(found.length ? `\nProblems:\n${found.join("\n")}` : `\nNo invalid AI orders, stuck AI turns or AI debt.`);
}
