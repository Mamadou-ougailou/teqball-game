import { IEntity } from '@core/interfaces';
import { AnimationEvent } from '@babylonjs/core/Animations/animationEvent';
import { EventBus } from '@core/EventBus';
import { AnimationSystem } from './AnimationSystem';

interface FrameEventConfig {
  stateName: string;
  frameNumber: number;
  eventName: string;
  /** false = fires every loop, true = fires only once */
  onlyOnce: boolean;
}

/**
 * Registers frame-precise callbacks on AnimationGroups.
 * Uses BabylonJS AnimationEvent so timing is driven by the engine,
 * not by elapsed wall-clock time in update().
 *
 * IMPORTANT: We attach the event to only the first targetedAnimation in the
 * group to avoid duplicate fires (one per animated bone/property).
 */
export class AnimationEvents implements IEntity {
  private animSystem: AnimationSystem;
  /** Pending events registered before the AnimationGroup was available */
  private pending: FrameEventConfig[] = [];

  constructor(animSystem: AnimationSystem) {
    this.animSystem = animSystem;
  }

  /**
   * Register an EventBus event to fire at a specific frame of an animation clip.
   *
   * @param stateName   CharacterState key (e.g. "KICKING") or raw clip name
   * @param frameNumber Frame number within the clip (0-based)
   * @param eventName   EventBus event to emit at that frame
   * @param onlyOnce    If true, fires once then is removed (good for non-looping clips).
   *                    If false (default), fires on every loop.
   */
  registerFrameEvent(
    stateName: string,
    frameNumber: number,
    eventName: string,
    onlyOnce = false
  ): void {
    const config: FrameEventConfig = { stateName, frameNumber, eventName, onlyOnce };
    const group = this.animSystem.getClipByKey(stateName as never);

    if (!group || group.targetedAnimations.length === 0) {
      // Group not ready yet — store for deferred registration
      this.pending.push(config);
      return;
    }

    this.attachEvent(config, group);
  }

  /**
   * Flush any pending events whose AnimationGroups are now available.
   * Call this after late-loading of animation clips.
   */
  flushPending(): void {
    this.pending = this.pending.filter(config => {
      const group = this.animSystem.getClipByKey(config.stateName as never);
      if (!group || group.targetedAnimations.length === 0) return true; // keep pending
      this.attachEvent(config, group);
      return false;
    });
  }

  private attachEvent(config: FrameEventConfig, group: import('@babylonjs/core/Animations/animationGroup').AnimationGroup): void {
    const firstAnimation = group.targetedAnimations[0].animation;
    const event = new AnimationEvent(
      config.frameNumber,
      () => EventBus.emit(config.eventName, { stateName: config.stateName, frame: config.frameNumber }),
      config.onlyOnce
    );
    firstAnimation.addEvent(event);
  }

  // AnimationEvents is passive — BabylonJS fires events internally
  update(_deltaTime: number): void {}

  dispose(): void {
    this.pending = [];
  }
}
