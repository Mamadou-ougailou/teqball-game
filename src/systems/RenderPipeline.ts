import { IEntity } from '@core/interfaces';

/**
 * RenderPipeline - Creates DefaultRenderingPipeline
 * Manages bloom, chromatic aberration, post-processing effects
 * TODO Phase 4: Setup post-processing effects
 */
export class RenderPipeline implements IEntity {
  intensifyBloom(): void {
    // TODO Phase 4
  }

  reduceBloom(): void {
    // TODO Phase 4
  }

  update(_deltaTime: number): void {
    // TODO Phase 4
  }

  dispose(): void {
    // TODO Phase 4
  }
}
