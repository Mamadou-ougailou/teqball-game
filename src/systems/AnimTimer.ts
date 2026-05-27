import { AnimConfig } from '../data/animationConfig';

export const ANIM_FPS = 30;
export const MIN_SPEED_RATIO = 1.0;
export const MAX_SPEED_RATIO = 1.6;

export class AnimTimer {
  /**
   * Compute the speedRatio such that the animation's contactFrame fires at `arrivalTimeSeconds`.
   *
   * Formula:
   *   framesNeeded = contactFrame (from config, already trimmed)
   *   naturalDuration = framesNeeded / ANIM_FPS  (seconds to reach contact at speed 1.0)
   *   speedRatio = naturalDuration / arrivalTimeSeconds
   *   Clamp to [MIN_SPEED_RATIO, MAX_SPEED_RATIO].
   *
   * If arrivalTimeSeconds <= 0 or framesNeeded <= 0, returns MAX_SPEED_RATIO.
   */
  static computeSpeedRatio(config: AnimConfig, arrivalTimeSeconds: number): number {
    const framesNeeded = config.contactFrame;

    if (arrivalTimeSeconds <= 0 || framesNeeded <= 0) {
      return MAX_SPEED_RATIO;
    }

    const naturalDuration = framesNeeded / ANIM_FPS;
    const speedRatio = naturalDuration / arrivalTimeSeconds;

    return Math.max(MIN_SPEED_RATIO, Math.min(MAX_SPEED_RATIO, speedRatio));
  }

  /**
   * Given a speedRatio and contactFrame, return the wall-clock time (seconds) until contact.
   */
  static timeToContact(config: AnimConfig, speedRatio: number): number {
    const framesNeeded = config.contactFrame;
    const naturalDuration = framesNeeded / ANIM_FPS;
    return naturalDuration / speedRatio;
  }

  /**
   * Returns true if the arrival time is achievable within [MIN, MAX] speed ratio clamping.
   */
  static isAchievable(config: AnimConfig, arrivalTimeSeconds: number): boolean {
    const framesNeeded = config.contactFrame;

    if (arrivalTimeSeconds <= 0 || framesNeeded <= 0) {
      return false;
    }

    const naturalDuration = framesNeeded / ANIM_FPS;
    const speedRatio = naturalDuration / arrivalTimeSeconds;

    return speedRatio >= MIN_SPEED_RATIO && speedRatio <= MAX_SPEED_RATIO;
  }
}
