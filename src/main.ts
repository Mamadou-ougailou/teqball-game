/**
 * MAIN ENTRY POINT
 * Phase 0: Initialization scaffold
 * TODO: Implement full startup sequence in later phases
 */

import { BabylonEngine } from './core/Engine';

async function main(): Promise<void> {
  try {
    // Get canvas
    const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
    if (!canvas) {
      throw new Error('Canvas element not found');
    }

    // Initialize BabylonJS Engine
    const engine = BabylonEngine.init(canvas);
    console.log('✓ BabylonJS Engine initialized');

    // TODO Phase 1: SceneManager.init()
    // TODO Phase 1: AssetManager.init()
    // TODO Phase 1: InputManager.init()
    // TODO Phase 1: Create game loop

    // Hide loading screen when ready
    setTimeout(() => {
      const loadingScreen = document.getElementById('loading-screen');
      if (loadingScreen) {
        loadingScreen.style.display = 'none';
      }
    }, 1000);

    console.log('✓ Game initialized - engine running');
  } catch (error) {
    console.error('Failed to initialize game:', error);
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
      loadingScreen.innerHTML = `<p style="color: #ff6b6b;">Error: ${error}</p>`;
    }
  }
}

main().catch(console.error);
