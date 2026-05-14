import { IEntity } from '@core/interfaces';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';

interface BlendState {
  outgoing: AnimationGroup;
  incoming: AnimationGroup;
  elapsed: number;
  duration: number;
}

/**
 * Manages AnimationGroups for a single character.
 * Supports instant play and smooth crossfade blending between clips.
 */
export class AnimationSystem implements IEntity {
  private animationMap: Map<string, AnimationGroup> = new Map();
  private currentAnimation: AnimationGroup | null = null;
  private blend: BlendState | null = null;

  static readonly DEFAULT_BLEND = 0.15; // seconds

  /**
   * @param animationGroups  All AnimationGroups extracted from the loaded .glb
   * @param stateToAnimName  Map of CharacterState key → animation clip name in the .glb
   */
  constructor(animationGroups: AnimationGroup[], stateToAnimName: Record<string, string>) {
    // Build lookup by CharacterState key (e.g. "IDLE") and by raw clip name
    for (const group of animationGroups) {
      this.animationMap.set(group.name, group);

      const stateKey = Object.keys(stateToAnimName).find(
        k => stateToAnimName[k] === group.name
      );
      if (stateKey) {
        this.animationMap.set(stateKey, group);
      }

      group.stop();
    }
  }

  /** Returns the AnimationGroup for a given state key or clip name, or null. */
  getAnimationGroup(key: string): AnimationGroup | null {
    return this.animationMap.get(key) ?? null;
  }

  /** Returns the name of the currently playing clip. */
  getCurrentAnimationName(): string {
    return this.currentAnimation?.name ?? '';
  }

  /**
   * Crossfade to an animation.
   * @param key           CharacterState key or raw clip name
   * @param loop          Whether the clip should loop
   * @param blendDuration Crossfade duration in seconds (0 = instant cut)
   */
  playAnimation(key: string, loop = true, blendDuration = AnimationSystem.DEFAULT_BLEND): void {
    const next = this.animationMap.get(key);
    if (!next || next === this.currentAnimation) return;

    const outgoing = this.currentAnimation;

    // Start the incoming clip at weight 0 so it blends in gradually
    next.play(loop);
    next.setWeightForAllAnimatables(blendDuration > 0 && outgoing ? 0 : 1);

    if (outgoing && blendDuration > 0) {
      outgoing.setWeightForAllAnimatables(1);
      this.blend = { outgoing, incoming: next, elapsed: 0, duration: blendDuration };
    } else {
      // Instant cut — stop the previous clip immediately
      outgoing?.stop();
      this.blend = null;
    }

    this.currentAnimation = next;
  }

  /** Immediately stops the current animation and any ongoing blend. */
  stopCurrentAnimation(): void {
    this.blend?.outgoing.stop();
    this.currentAnimation?.stop();
    this.currentAnimation = null;
    this.blend = null;
  }

  update(deltaTime: number): void {
    if (!this.blend) return;

    this.blend.elapsed += deltaTime;
    const t = Math.min(this.blend.elapsed / this.blend.duration, 1);

    this.blend.incoming.setWeightForAllAnimatables(t);
    this.blend.outgoing.setWeightForAllAnimatables(1 - t);

    if (t >= 1) {
      this.blend.outgoing.stop();
      this.blend = null;
    }
  }

  dispose(): void {
    for (const group of this.animationMap.values()) {
      group.stop();
    }
    this.animationMap.clear();
    this.currentAnimation = null;
    this.blend = null;
  }
}
