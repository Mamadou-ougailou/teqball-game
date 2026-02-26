import { IEntity, IAudioSystem } from '@core/interfaces';

/**
 * AudioSystem - Wraps BabylonJS Sound + Howler.js
 * TODO Phase 3: Load and manage all game audio
 */
export class AudioSystem implements IEntity, IAudioSystem {
  play(_soundId: string, _volume?: number): void {
    // TODO Phase 3
  }

  playLoop(_soundId: string, _volume?: number): void {
    // TODO Phase 3
  }

  stop(_soundId: string): void {
    // TODO Phase 3
  }

  setGlobalVolume(_volume: number): void {
    // TODO Phase 3
  }

  update(_deltaTime: number): void {
    // TODO Phase 3
  }

  dispose(): void {
    // TODO Phase 3
  }
}
