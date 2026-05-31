import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import HavokPhysics from '@babylonjs/havok';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import { BabylonEngine } from './Engine';
import { SCALE } from '../config/GameConfig';

export class SceneBuilder {
  public static async createSurrealisticScene(canvas: HTMLCanvasElement, options?: { debug?: boolean }): Promise<{
    engine: BabylonEngine;
    scene: Scene;
    camera: ArcRotateCamera;
    havokPlugin: HavokPlugin;
  }> {
    // Initialize BabylonJS Engine
    const engine = BabylonEngine.init(canvas);

    // Create game scene
    const scene = new Scene(engine.getNativeEngine());
    scene.collisionsEnabled = true;
    scene.clearColor = new Color4(0.10, 0.10, 0.14, 1); // Dark-charcoal arena feel (V1)

    // Setup camera — side view, close enough to read the game clearly (V1 style)
    const camera = new ArcRotateCamera(
      'camera',
      0,
      Math.PI / 2.8,
      9 * SCALE,
      new Vector3(0, SCALE * 0.9, 0),
      scene
    );
    // Camera is fixed — user inputs disabled so the view stays locked (V1 style)
    camera.inputs.clear();

    // Bright neutral lighting — clear visibility of players and ball (V1 style)
    const light = new HemisphericLight('light', new Vector3(0, 1, 0), scene);
    light.intensity = 2.2;
    light.diffuse     = new Color3(1.0, 1.0, 1.0);  // Pure white — neutral, no colour cast
    light.groundColor = new Color3(0.45, 0.45, 0.50); // Warm grey fill from below

    // Subtle glow — keeps neon emissive colors punchy without darkening the scene (V1)
    const glowLayer = new GlowLayer('glow', scene);
    glowLayer.intensity = 0.5;

    const pipeline = new DefaultRenderingPipeline('default', true, scene, [camera]);
    pipeline.chromaticAberrationEnabled = false;
    pipeline.bloomEnabled = true;
    pipeline.bloomThreshold = 0.82;
    pipeline.bloomWeight    = 0.20;

    // Initialize physics engine
    const havokInstance = await HavokPhysics({
      // Relative path: resolves against the page URL, so it works both at the
      // domain root and on a GitHub Pages sub-path.
      locateFile: () => 'HavokPhysics.wasm'
    });
    const havokPlugin = new HavokPlugin(true, havokInstance);
    scene.enablePhysics(new Vector3(0, -9.81, 0), havokPlugin);

    // Run physics at 120 Hz (half-step) — halves the tunnelling window
    // for fast-moving objects like the ball passing through thin surfaces.
    havokPlugin.setTimeStep(1 / 120);

    // Bump solver iterations from the Havok default (4) to 10 velocity + 4 position.
    // The extra passes significantly improve ball-to-curved-surface contact accuracy
    // for a sports simulation at the cost of a small (~15 %) CPU overhead.
    const hk = (havokPlugin as unknown as { _hknp?: Record<string, (...a: unknown[]) => unknown> })._hknp;
    const havokWorld = (havokPlugin as unknown as { world?: unknown }).world;
    if (hk && havokWorld !== undefined) {
      (hk['HP_World_SetNumConstraintSolverVelocityIterations'] as (...args: unknown[]) => void)?.(havokWorld, 10);
      (hk['HP_World_SetNumConstraintSolverPositionIterations'] as (...args: unknown[]) => void)?.(havokWorld, 4);
    }

    return { engine, scene, camera, havokPlugin };
  }
}
