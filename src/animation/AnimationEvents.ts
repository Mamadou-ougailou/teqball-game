import { IEntity } from '@core/interfaces';

/**
 * AnimationEvents - Registers frame callbacks on AnimationGroups
 * Fires 'kick:impact' event at correct animation frame for timing
 * TODO Phase 2: Wire up frame-based event triggers
 */
export class AnimationEvents implements IEntity {
  registerFrameEvent(_animName: string, _frameNumber: number, _eventName: string): void {
    // TODO Phase 2
  }

  update(_deltaTime: number): void {
    // TODO Phase 2
  }

  dispose(): void {
    // TODO Phase 2
  }
}
