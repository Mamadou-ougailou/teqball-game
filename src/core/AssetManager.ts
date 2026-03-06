import { Scene } from '@babylonjs/core/scene';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Skeleton } from '@babylonjs/core/Bones/skeleton';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { IEntity } from '@core/interfaces';
import '@babylonjs/loaders/glTF';

export interface ModelData {
  meshes: AbstractMesh[];
  skeletons: Skeleton[];
  animationGroups: AnimationGroup[];
}

/**
 * AssetManager - Handles loading of .glb models
 * Wraps BabylonJS SceneLoader with a simple name-based API.
 */
export class AssetManager implements IEntity {
  private _scene: Scene;
  private _cache: Map<string, ModelData> = new Map();

  // Map model name → path under /models/
  private static readonly _paths: Record<string, string> = {
    table:        'table.glb',
    ball01:       'ball01.glb',
    character:    'character.glb',
    character_p2: 'character.glb',  // second independent load for player 2
  };

  constructor(scene: Scene) {
    this._scene = scene;
  }

  /** Pre-load all known assets so they are ready when needed. */
  async loadAllAssets(): Promise<void> {
    await Promise.all(
      Object.keys(AssetManager._paths).map((name) => this.loadModel(name))
    );
  }

  /** Load (or return cached) a named model. Returns meshes + skeletons. */
  async loadModel(name: string): Promise<ModelData> {
    if (this._cache.has(name)) {
      return this._cache.get(name)!;
    }

    const file = AssetManager._paths[name];
    if (!file) {
      throw new Error(`Unknown model name: "${name}"`);
    }

    // Try /models/ first, fall back to /assets/models/
    let result;
    try {
      result = await SceneLoader.ImportMeshAsync('', '/models/', file, this._scene);
    } catch {
      result = await SceneLoader.ImportMeshAsync('', '/assets/models/', file, this._scene);
    }

    const data: ModelData = {
      meshes:          result.meshes as AbstractMesh[],
      skeletons:       result.skeletons,
      animationGroups: result.animationGroups,
    };
    this._cache.set(name, data);
    return data;
  }

  update(_deltaTime: number): void {}

  dispose(): void {
    this._cache.clear();
  }
}
