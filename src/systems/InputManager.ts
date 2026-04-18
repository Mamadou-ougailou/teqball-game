import { IEntity, GameAction, IInputManager } from '@core/interfaces';

/** Per-player key binding config. */
interface PlayerBindings {
  left: string;
  right: string;
  forward: string;
  backward: string;
  kick: string;
  serve: string;
}

const DEFAULT_BINDINGS: [PlayerBindings, PlayerBindings] = [
  { left: 'a', right: 'd', forward: 'w', backward: 's', kick: 'space', serve: 'space' },
  { left: 'arrowleft', right: 'arrowright', forward: 'arrowup', backward: 'arrowdown', kick: 'u', serve: 'enter' },
];

/**
 * InputManager — wraps the existing pressedKeys set (owned by main.ts) and
 * exposes gameplay-oriented helpers.
 *
 * Pass the shared `pressedKeys` set in the constructor.  The manager reads
 * directly from it, so no second copy is maintained.  It also registers its
 * own keydown listener to track consume-once presses (kick / serve).
 */
export class InputManager implements IEntity, IInputManager {
  /** Reference to the shared key-state set (owned by the caller). */
  readonly keys: Set<string>;

  private readonly _bindings: [PlayerBindings, PlayerBindings];
  private readonly _kickConsumed: [boolean, boolean] = [false, false];
  private readonly _serveConsumed: [boolean, boolean] = [false, false];

  constructor(
    sharedKeys: Set<string>,
    bindings?: [Partial<PlayerBindings>, Partial<PlayerBindings>],
  ) {
    this.keys = sharedKeys;
    this._bindings = [
      { ...DEFAULT_BINDINGS[0], ...bindings?.[0] },
      { ...DEFAULT_BINDINGS[1], ...bindings?.[1] },
    ];
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  private _onKeyDown = (e: KeyboardEvent): void => {
    const key = e.key === ' ' ? 'space' : e.key.toLowerCase();
    // Reset consumed flag when the key is freshly pressed.
    for (let p = 0; p < 2; p++) {
      if (key === this._bindings[p].kick) this._kickConsumed[p] = false;
      if (key === this._bindings[p].serve) this._serveConsumed[p] = false;
    }
  };

  private _onKeyUp = (e: KeyboardEvent): void => {
    const key = e.key === ' ' ? 'space' : e.key.toLowerCase();
    // Also reset consumed so the next press is fresh.
    for (let p = 0; p < 2; p++) {
      if (key === this._bindings[p].kick) this._kickConsumed[p] = false;
      if (key === this._bindings[p].serve) this._serveConsumed[p] = false;
    }
  };

  // -------------------------------------------------------------------------
  // IInputManager
  // -------------------------------------------------------------------------

  getActionState(playerId: number, action: GameAction): boolean {
    const b = this._bindings[playerId as 0 | 1];
    if (!b) return false;
    switch (action) {
      case GameAction.MOVE_LEFT:     return this.keys.has(b.left);
      case GameAction.MOVE_RIGHT:    return this.keys.has(b.right);
      case GameAction.MOVE_FORWARD:  return this.keys.has(b.forward);
      case GameAction.MOVE_BACKWARD: return this.keys.has(b.backward);
      case GameAction.KICK:          return this.keys.has(b.kick);
      default: return false;
    }
  }

  getAxisInput(playerId: number, axis: 'horizontal' | 'vertical'): number {
    const b = this._bindings[playerId as 0 | 1];
    if (!b) return 0;
    if (axis === 'horizontal') {
      return (this.keys.has(b.right) ? 1 : 0) - (this.keys.has(b.left) ? 1 : 0);
    }
    return (this.keys.has(b.backward) ? 1 : 0) - (this.keys.has(b.forward) ? 1 : 0);
  }

  isUsingGamepad(): boolean {
    return false; // gamepad support deferred
  }

  // -------------------------------------------------------------------------
  // Extended API
  // -------------------------------------------------------------------------

  getMoveX(playerId: number): number {
    return this.getAxisInput(playerId, 'horizontal');
  }

  getMoveZ(playerId: number): number {
    return this.getAxisInput(playerId, 'vertical');
  }

  isKickDown(playerId: number): boolean {
    const b = this._bindings[playerId as 0 | 1];
    return b ? this.keys.has(b.kick) : false;
  }

  /** Returns true once per physical press; false on repeats until released. */
  consumeKickPress(playerId: number): boolean {
    const p = playerId as 0 | 1;
    if (this._kickConsumed[p]) return false;
    if (!this.isKickDown(p)) return false;
    this._kickConsumed[p] = true;
    return true;
  }

  isServeDown(playerId: number): boolean {
    const b = this._bindings[playerId as 0 | 1];
    return b ? this.keys.has(b.serve) : false;
  }

  consumeServePress(playerId: number): boolean {
    const p = playerId as 0 | 1;
    if (this._serveConsumed[p]) return false;
    if (!this.isServeDown(p)) return false;
    this._serveConsumed[p] = true;
    return true;
  }

  update(_deltaTime: number): void {}

  dispose(): void {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }
}
