import { IEntity } from '@core/interfaces';

/**
 * AssetManager - Handles loading of .glb models, textures, audio
 * Wraps BabylonJS AssetsManager
 * TODO Phase 0: Queue all assets and fire onReady callback
 */
export class AssetManager implements IEntity {
  private loadingProgress = 0;

  async loadAssets(): Promise<void> {
    // TODO Phase 1: Load all game assets
  }

  update(_deltaTime: number): void {
    // TODO Phase 1
  }

  dispose(): void {
    // TODO Phase 1
  }
}
