import { IEntity } from '@core/interfaces';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';

/**
 * AnimationSystem - Holds AnimationGroup map per character
 * TODO Phase 2: Play clips by character state, manage blending (Phase 4)
 */
export class AnimationSystem implements IEntity {
  private animationMap: Map<string, AnimationGroup> = new Map();

  playAnimation(_animName: string, _loop?: boolean): void {
    // TODO Phase 2
  }

  stopCurrentAnimation(): void {
    // TODO Phase 2
  }

  update(_deltaTime: number): void {
    // TODO Phase 2
  }

  dispose(): void {
    // TODO Phase 2
  }
}
