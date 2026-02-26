import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';

/**
 * Singleton Engine wrapper
 * Manages the WebGL context and render loop
 * Created once during application startup
 */
export class BabylonEngine {
  private static instance: BabylonEngine;
  private engine: Engine;
  private canvas: HTMLCanvasElement;

  private constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: false,
      antialias: true,
    });

    // Resize handler
    window.addEventListener('resize', () => {
      this.engine.resize();
    });
  }

  /**
   * Initialize or get the singleton Engine instance
   */
  public static init(canvas: HTMLCanvasElement): BabylonEngine {
    if (!BabylonEngine.instance) {
      BabylonEngine.instance = new BabylonEngine(canvas);
    }
    return BabylonEngine.instance;
  }

  /**
   * Get the singleton instance (must call init first)
   */
  public static getInstance(): BabylonEngine {
    if (!BabylonEngine.instance) {
      throw new Error('Engine not initialized. Call BabylonEngine.init() first.');
    }
    return BabylonEngine.instance;
  }

  /**
   * Start the render loop for a given scene
   */
  public render(scene: Scene): void {
    this.engine.runRenderLoop(() => {
      scene.render();
    });
  }

  /**
   * Stop the render loop
   */
  public stopRender(): void {
    this.engine.stopRenderLoop();
  }

  /**
   * Get the native BabylonJS Engine
   */
  public getNativeEngine(): Engine {
    return this.engine;
  }

  /**
   * Get the canvas element
   */
  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Dispose of engine and cleanup
   */
  public dispose(): void {
    this.engine.dispose();
  }
}
