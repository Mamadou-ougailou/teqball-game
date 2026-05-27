import { IEntity } from '@core/interfaces';
import { AnimationSystem } from './AnimationSystem';

/**
 * AnimationEvents — gutted to no-op. Animation system has been removed.
 */
export class AnimationEvents implements IEntity {
  private animSystem: AnimationSystem;

  constructor(animSystem: AnimationSystem) {
    this.animSystem = animSystem;
  }

  registerFrameEvent(_stateName: string, _frameNumber: number, _eventName: string, _onlyOnce = false): void {}

  flushPending(): void {}

  update(_deltaTime: number): void {}

  dispose(): void {}
}
