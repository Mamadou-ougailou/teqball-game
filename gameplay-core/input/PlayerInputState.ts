/**
 * View-agnostic input logic.
 *
 * EXTRACTION NOTE: this is the real logic of src/input/PlayerInput.ts with the
 * rendering/DOM coupling removed. The original called
 * `document.addEventListener('keydown'/'keyup', ...)` in its constructor and
 * imported `TableZone`/`SpeedTier` from the rendering-side ZoneSelector.
 *
 * Here the host owns the device listeners and simply forwards raw key state via
 * {@link PlayerInputState.setKey}. The movement / speed-tier / zone-navigation
 * / kick logic is preserved verbatim. `getSelectedZone` is made generic so it
 * no longer depends on the rendering `TableZone` type.
 *
 *   // DOM host:
 *   window.addEventListener('keydown', e => input.setKey(e.key, true));
 *   window.addEventListener('keyup',   e => input.setKey(e.key, false));
 *   // Babylon host: feed scene.onKeyboardObservable the same way.
 */

export type SpeedTier = 'Normal' | 'Maximum';

export interface MovementInput {
  x: number; // -1 to +1
  z: number; // -1 to +1
}

export class PlayerInputState {
  private _pressedKeys = new Set<string>();
  private _selectedZoneIndex = 2;
  private _zoneSelectionActive = false;
  private _playerId: number;

  constructor(playerId: number) {
    this._playerId = playerId;
  }

  get isZoneSelectionActive(): boolean { return this._zoneSelectionActive; }

  openZoneSelection(): void { this._zoneSelectionActive = true; }
  closeZoneSelection(): void { this._zoneSelectionActive = false; }

  /**
   * Forward a raw key event. `key` follows the `KeyboardEvent.key` convention
   * (e.g. 'a', 'ArrowLeft', ' '); it is lower-cased internally, exactly like
   * the original listeners did.
   */
  setKey(key: string, pressed: boolean): void {
    const k = key === ' ' ? ' ' : key.toLowerCase();
    if (pressed) {
      this._pressedKeys.add(k);
      // Zone-selection navigation (verbatim from the original keydown handler).
      if (this._zoneSelectionActive) {
        if (k === 'arrowleft')  this._selectedZoneIndex = Math.max(0, this._selectedZoneIndex - 1);
        if (k === 'arrowright') this._selectedZoneIndex = Math.min(5, this._selectedZoneIndex + 1);
        if (k === 'arrowup')    this._selectedZoneIndex = Math.max(0, this._selectedZoneIndex - 3);
        if (k === 'arrowdown')  this._selectedZoneIndex = Math.min(5, this._selectedZoneIndex + 3);
      }
    } else {
      this._pressedKeys.delete(k);
    }
  }

  getMovementInput(): MovementInput {
    let x = 0;
    let z = 0;
    if (this._playerId === 0) {
      if (this._pressedKeys.has('a') || this._pressedKeys.has('arrowleft'))  x -= 1;
      if (this._pressedKeys.has('d') || this._pressedKeys.has('arrowright')) x += 1;
      if (this._pressedKeys.has('w') || this._pressedKeys.has('arrowup'))    z -= 1;
      if (this._pressedKeys.has('s') || this._pressedKeys.has('arrowdown'))  z += 1;
    } else {
      if (this._pressedKeys.has('arrowleft'))  x -= 1;
      if (this._pressedKeys.has('arrowright')) x += 1;
      if (this._pressedKeys.has('arrowup'))    z += 1;
      if (this._pressedKeys.has('arrowdown'))  z -= 1;
    }
    return { x, z };
  }

  getSpeedTier(): SpeedTier {
    if (this._pressedKeys.has('control') || this._pressedKeys.has('controlleft') || this._pressedKeys.has('controlright')) {
      return 'Maximum';
    }
    return 'Normal';
  }

  getSelectedZoneIndex(): number { return this._selectedZoneIndex; }

  /** Generic over the zone type so it no longer depends on the rendering layer. */
  getSelectedZone<T>(zones: T[]): T | null {
    if (zones.length === 0) return null;
    return zones[Math.min(this._selectedZoneIndex, zones.length - 1)];
  }

  isKickPressed(): boolean {
    return this._pressedKeys.has(' ') || this._pressedKeys.has('space');
  }
}
