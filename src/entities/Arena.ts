import { IEntity, IArenaConfig } from '@core/interfaces';
import { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math.color';

export class Arena implements IEntity {
  readonly config: IArenaConfig;
  private _scene: Scene;
  private _bgMusic: HTMLAudioElement | null = null;

  constructor(scene: Scene, config: IArenaConfig) {
    this._scene = scene;
    this.config = config;
  }

  loadEnvironment(): void {
    this._scene.fogMode = 3; // FOGMODE_LINEAR
    this._scene.fogStart = 20;
    this._scene.fogEnd = 80;
    this._scene.fogColor = new Color3(
      this.config.fogColor.x,
      this.config.fogColor.y,
      this.config.fogColor.z,
    );

    if (this.config.gravityModifier !== 1.0 && this._scene.gravity) {
      this._scene.gravity.y = -9.81 * this.config.gravityModifier;
    }

    if (this.config.backgroundMusicPath) {
      try {
        this._bgMusic = new Audio(this.config.backgroundMusicPath);
        this._bgMusic.loop = true;
        this._bgMusic.volume = 0.35;
        this._bgMusic.play().catch(() => { /* autoplay policy blocked */ });
      } catch {
        // Audio API not available in this context
      }
    }
  }

  update(_deltaTime: number): void {}

  dispose(): void {
    this._scene.fogMode = 0; // FOGMODE_NONE
    if (this._bgMusic) {
      this._bgMusic.pause();
      this._bgMusic.src = '';
      this._bgMusic = null;
    }
  }
}
