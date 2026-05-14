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
  /** How many times each file has been instantiated into the scene. */
  private _instanceCount: Map<string, number> = new Map();

  // Map model name → GLB path served under /models/
  private static readonly _paths: Record<string, string> = {
    ball01:    'ball01.glb',
    character: 'Neymar.glb',
    player:    'Neymar.glb',
    player_alien: 'Neymar.glb',
    alien: 'Neymar.glb',
    neymar: 'Neymar.glb',
    bleachers: 'bleachers.glb',
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
   * Load a model into the scene.  The FIRST call for a given file uses
   * container.addAllToScene() which replicates the old ImportMeshAsync
   * behaviour exactly — the container's own mesh/skeleton/animation objects
   * land in the scene unchanged.
   *
   * SUBSEQUENT calls use instantiateModelsToScene(cloneAnimations=true) to
   * produce a fully independent second (third, …) copy with its own skeleton
   * and retargeted animation groups.
   */
  async loadModel(name: string): Promise<ModelData> {
    const container = await this._ensureContainer(name);
    const file = AssetManager._paths[name];
    const count = this._instanceCount.get(file) ?? 0;
    this._instanceCount.set(file, count + 1);

    if (count === 0) {
      // First instance — add container assets directly to the scene.
      // Animation groups already target these meshes; no retargeting needed.
      container.addAllToScene();
      return {
        meshes:          container.meshes,
        skeletons:       container.skeletons,
        animationGroups: container.animationGroups,
      };
    }

    // Second+ instance — stamp out a fully independent clone.
    const instance = container.instantiateModelsToScene(
      /* nameFunction  */ undefined,
      /* cloneAnimations */ true
    );
    // Include root node at index 0 to mirror the addAllToScene structure
    // so callers can always use meshes[0] for position / rotation.
    return {
      meshes:          instance.rootNodes.flatMap(n =>
                         [n as unknown as AbstractMesh, ...n.getChildMeshes()]),
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
    this._instanceCount.clear();
  }
}
