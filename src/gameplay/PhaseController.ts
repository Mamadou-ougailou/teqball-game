export type RallyPhase = 'waiting' | 'reception' | 'preparation' | 'kick' | 'done';

export interface PhaseState {
  phase: RallyPhase;
  touchCount: number;       // 1=reception, 2=preparation, 3=kick
  timer: number;
}

export class PhaseController {
  private _state: PhaseState = { phase: 'waiting', touchCount: 0, timer: 0 };
  private _playerId: number;

  get currentPhase(): RallyPhase { return this._state.phase; }
  get touchCount(): number { return this._state.touchCount; }

  constructor(playerId: number) { this._playerId = playerId; }

  /** Called when ball enters this player's half and they should receive */
  beginReception(): void {
    this._state = { phase: 'reception', touchCount: 1, timer: 0 };
  }

  /** Called after successful reception contact */
  advanceToPreparation(): void {
    if (this._state.touchCount < 3) {
      this._state = { phase: 'preparation', touchCount: 2, timer: 0 };
    }
  }

  /** Called after successful preparation contact */
  advanceToKick(): void {
    if (this._state.touchCount < 3) {
      this._state = { phase: 'kick', touchCount: 3, timer: 0 };
    }
  }

  /** Called when kick fires */
  completeTurn(): void {
    this._state = { phase: 'done', touchCount: 3, timer: 0 };
  }

  /** Reset for next rally */
  reset(): void {
    this._state = { phase: 'waiting', touchCount: 0, timer: 0 };
  }

  canTouch(): boolean {
    return this._state.phase === 'reception' || this._state.phase === 'preparation' || this._state.phase === 'kick';
  }

  exceedsTouchLimit(): boolean {
    return this._state.touchCount > 3;
  }

  update(deltaTime: number): void {
    this._state.timer += deltaTime;
  }
}
