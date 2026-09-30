@AGENTS.md

## Claude Code

- Before changing game rules, balance numbers or the AI, read
  `docs/DECISIONS.md` (it isn't loaded automatically, to save context). It
  records what was tried and why, including rejected alternatives.
- For balance or design changes, use plan mode: measure first with
  `tools/simulate.py`, propose a before/after table, then implement.
- Finish every change with `npm run build` clean; for rules, data or AI
  changes also run `python3 tools/simulate.py` and report INVALID and debt.
