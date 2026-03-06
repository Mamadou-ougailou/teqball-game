import { Scene } from '@babylonjs/core/scene';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { AssetContainer } from '@babylonjs/core/assetContainer';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Skeleton } from '@babylonjs/core/Bones/skeleton';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { IEntity } from '@core/interfaces';
import '@babylonjs/loaders/glTF';
// Required side-effect imports so that Scene.beginDirectAnimation and the
// animation scene component are registered before instantiateModelsToScene
// tries to retarget and start animation groups.
import '@babylonjs/core/Animations/animatable';
import '@babylonjs/core/Rendering/boundingBoxRenderer';

export interface ModelData {
  meshes: AbstractMesh[];
  skeletons: Skeleton[];
  animationGroups: AnimationGroup[];
}

/**
 * AssetManager — loads GLB files via AssetContainer so the same file can be
 * instantiated any number of times without Babylon name-collision errors.
 *
 * Each call to loadModel() returns a FRESH set of meshes, skeletons and
 * animation groups cloned into the scene from the shared container.
 * The underlying file is fetched only once per unique path.
 */
export class AssetManager implements IEntity {
  private _scene: Scene;

  /** One container per unique file path — loaded once and never added to scene. */
  private _containers: Map<string, AssetContainer> = new Map();

  // Map model name → GLB path served under /models/
  private static readonly _paths: Record<string, string> = {
    table:     'table.glb',
    ball01:    'ball01.glb',
    character: 'character.glb',
  };

  constructor(scene: Scene) {
    this._scene = scene;
  }

  /** Pre-load every unique file into its AssetContainer. */
  async loadAllAssets(): Promise<void> {
    await Promise.all(
      Object.keys(AssetManager._paths).map(name => this._ensureContainer(name))
    );
  }

  /**
   * Instantiate a fresh copy of the named model into the active scene.
   * Can be called multiple times for the same name — each call returns
   * an independent set of meshes and animation groups.
   */
  async loadModel(name: string): Promise<ModelData> {
    const container = await this._ensureContainer(name);

    // instantiateModelsToScene creates unique clones with independent transforms
    // and fully retargeted animation groups — no shared state between instances.
    const instance = container.instantiateModelsToScene(
      /* nameFunction */ undefined,
      /* cloneAnimations */ true
    );

    return {
      meshes:          instance.rootNodes.flatMap(n => [n, ...n.getChildMeshes()]) as AbstractMesh[],
      skeletons:       instance.skeletons,
      animationGroups: instance.animationGroups,
    };
  }

  /** Load and cache an AssetContainer for the given model name. */
  private async _ensureContainer(name: string): Promise<AssetContainer> {
    const file = AssetManager._paths[name];
    if (!file) throw new Error(`Unknown model name: "${name}"`);

    if (this._containers.has(file)) {
      return this._containers.get(file)!;
    }

    // Try /models/ first (Vite serves public/ at root), then /assets/models/
    // as a legacy fallback.  Both errors are logged so the real cause is visible.
    let container: AssetContainer;
    let firstError: unknown;
    try {
      container = await SceneLoader.LoadAssetContainerAsync('/models/', file, this._scene);
    } catch (err) {
      firstError = err;
      console.warn(`[AssetManager] /models/${file} failed:`, err);
      try {
        container = await SceneLoader.LoadAssetContainerAsync('/assets/models/', file, this._scene);
      } catch (err2) {
        // Both paths failed — surface the original error (more informative)
        throw new Error(
          `[AssetManager] Failed to load "${file}".\n` +
          `/models/ error: ${String(firstError)}\n` +
          `/assets/models/ error: ${String(err2)}`
        );
      }
    }

    this._containers.set(file, container!);
    return this._containers.get(file)!;
  }

  update(_deltaTime: number): void {}

  dispose(): void {
    this._containers.forEach(c => c.dispose());
    this._containers.clear();
  }
}
