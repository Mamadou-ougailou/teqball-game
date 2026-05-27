import { TableZone, SpeedTier } from '../systems/ZoneSelector';

export interface MovementInput {
  x: number; // -1 to +1
  z: number; // -1 to +1
}

export class PlayerInput {
  private _pressedKeys = new Set<string>();
  private _selectedZoneIndex = 2;
  private _zoneSelectionActive = false;
  private _playerId: number;

  constructor(playerId: number) {
    this._playerId = playerId;
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
  }

  get isZoneSelectionActive(): boolean { return this._zoneSelectionActive; }

  openZoneSelection(): void { this._zoneSelectionActive = true; }
  closeZoneSelection(): void { this._zoneSelectionActive = false; }

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
    if (this._pressedKeys.has('shift') || this._pressedKeys.has('shiftleft') || this._pressedKeys.has('shiftright')) {
      return 'Fast';
    }
    return 'Normal';
  }

  getSelectedZoneIndex(): number { return this._selectedZoneIndex; }

  getSelectedZone(zones: TableZone[]): TableZone | null {
    if (zones.length === 0) return null;
    return zones[Math.min(this._selectedZoneIndex, zones.length - 1)];
  }

  isKickPressed(): boolean {
    return this._pressedKeys.has(' ') || this._pressedKeys.has('space');
  }

  dispose(): void {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
  }

  private _onKeyDown = (e: KeyboardEvent): void => {
    const key = e.key.toLowerCase();
    this._pressedKeys.add(key);

    if (this._zoneSelectionActive) {
      if (key === 'arrowleft')  this._selectedZoneIndex = Math.max(0, this._selectedZoneIndex - 1);
      if (key === 'arrowright') this._selectedZoneIndex = Math.min(5, this._selectedZoneIndex + 1);
      if (key === 'arrowup')    this._selectedZoneIndex = Math.max(0, this._selectedZoneIndex - 3);
      if (key === 'arrowdown')  this._selectedZoneIndex = Math.min(5, this._selectedZoneIndex + 3);
    }
  };

  private _onKeyUp = (e: KeyboardEvent): void => {
    this._pressedKeys.delete(e.key.toLowerCase());
  };
}
