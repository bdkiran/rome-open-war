import { nextAction } from "@/ai/ai.js";
import { applyAction, type Action, type ActionResult } from "@/core/actions.js";
import type { GameContext } from "@/core/context.js";
import { currentFaction, type FactionId, type GameState } from "@/core/state.js";

/** Stops a buggy AI from looping forever within one turn. */
const MAX_AI_ACTIONS_PER_TURN = 200;

export type StateListener = (state: GameState) => void;

/** One AI action, as it happened: for the UI to play it back. */
export interface AiStep {
  factionId: FactionId;
  action: Action;
  before: GameState;
  after: GameState;
}

export interface ControllerOptions {
  /** Pause before each AI turn so the turn order is visible. 0 for instant. */
  aiTurnDelayMs: number;
  /**
   * Called after every AI action, once listeners have seen the new state; the
   * next action waits until it resolves. The browser uses it to show the
   * enemy's moves one at a time. Without it, listeners hear once per AI turn.
   */
  showAiAction?: (step: AiStep) => Promise<void>;
}

/**
 * Owns the current GameState, applies actions to it, runs AI turns, and tells
 * the UI when anything changes. The UI never modifies state directly.
 */
export class GameController {
  private state: GameState;
  private readonly listeners = new Set<StateListener>();
  private aiRunning = false;

  constructor(
    readonly ctx: GameContext,
    initial: GameState,
    private readonly options: ControllerOptions = { aiTurnDelayMs: 150 },
  ) {
    this.state = initial;
  }

  getState(): GameState {
    return this.state;
  }

  /** Call the listener on every state change. Returns an unsubscribe function. */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Notify listeners of the initial state and run AI turns if an AI moves first. */
  start(): void {
    this.emit();
    void this.runAiTurns();
  }

  /** Apply an action on behalf of a faction. Used by the human player's UI. */
  dispatch(factionId: FactionId, action: Action): ActionResult {
    const result = applyAction(this.ctx, this.state, factionId, action);
    if (result.ok) {
      this.state = result.state;
      this.emit();
      void this.runAiTurns();
    }
    return result;
  }

  private async runAiTurns(): Promise<void> {
    if (this.aiRunning) return;
    this.aiRunning = true;
    try {
      while (currentFaction(this.state).controller === "ai" && this.anyHumanAlive()) {
        const faction = currentFaction(this.state);
        await delay(this.options.aiTurnDelayMs);

        // Ask the AI for one action at a time until it ends its turn.
        for (let step = 0; step < MAX_AI_ACTIONS_PER_TURN; step++) {
          const before = this.state;
          const action = nextAction(this.ctx, before, faction.id);
          const result = applyAction(this.ctx, before, faction.id, action);
          if (!result.ok) {
            console.warn(`${faction.name} attempted an invalid action:`, action, result.reason);
            break;
          }
          this.state = result.state;
          if (this.options.showAiAction) {
            this.emit();
            await this.options.showAiAction({ factionId: faction.id, action, before, after: this.state });
          }
          if (currentFaction(this.state).id !== faction.id) break;
        }

        // Safety net: an AI that doesn't end its turn would freeze the game.
        if (currentFaction(this.state).id === faction.id) {
          console.warn(`${faction.name} did not end its turn; ending it automatically.`);
          const forced = applyAction(this.ctx, this.state, faction.id, { type: "endTurn" });
          if (forced.ok) this.state = forced.state;
        }

        this.emit();
      }
    } finally {
      this.aiRunning = false;
    }
  }

  /** With no human left, AI turns stop instead of running forever in the background. */
  private anyHumanAlive(): boolean {
    return this.state.factions.some((f) => f.controller === "human" && f.alive);
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.state);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
