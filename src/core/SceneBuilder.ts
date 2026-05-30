import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
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

    // Setup camera
    const camera = new ArcRotateCamera(
      'camera',
      -Math.PI / 2,
      Math.PI / 3,
      20 * SCALE,
      new Vector3(0, 0, 0),
      scene
    );
    camera.attachControl(canvas, true);
    camera.wheelPrecision = 50;
    // Arrow keys are reserved for player controls; keep mouse/touch camera input.
    camera.keysUp = [];
    camera.keysDown = [];
    camera.keysLeft = [];
    camera.keysRight = [];

    // Setup lighting - increase intensity for better visibility
    const light = new HemisphericLight('light', new Vector3(0, 1, 0), scene);
    light.intensity = 1.5;
    light.diffuse = new Color3(0.5, 0.3, 0.9); // Surreal purple/blue
    light.groundColor = new Color3(0.1, 0.0, 0.2);

    if (!options?.debug) {
      const pipeline = new DefaultRenderingPipeline("default", true, scene, [camera]);
      pipeline.chromaticAberration.aberrationAmount = 25;
      pipeline.chromaticAberration.radialIntensity = 1;
      pipeline.chromaticAberrationEnabled = true;
      // Bloom disabled: it made the bright white court lines and the scoreboard
      // text glow.  The ball-fire effect uses its own GlowLayer, so it is
      // unaffected by turning bloom off here.
      pipeline.bloomEnabled = false;
    }

    // Initialize physics engine
    const havokInstance = await HavokPhysics({
      locateFile: () => '/HavokPhysics.wasm'
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
