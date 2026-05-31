import { Vec3 as Vector3 } from '../math/Vec3';
import { BallGuide } from './BallGuide';

/**
 * EXTRACTION NOTE: copied verbatim from src/systems/BallPredictor.ts. Pure
 * trajectory prediction (Vector3 → Vec3 import swap only).
 */
export interface ArrivalPrediction {
  position: Vector3;   // ball world position at arrival
  timeSeconds: number; // seconds until arrival
  willLand: boolean;   // true if ball is heading toward a contact zone
}

export class BallPredictor {
  /**
   * Predict where the ball will be when it descends to `targetY`.
   */
  static ballAtArrival(
    pos0: Vector3,
    vel0: Vector3,
    targetY: number,
    gravity = 9.8,
    maxTime = 4.0,
  ): ArrivalPrediction {
    const exactTime = BallGuide.timeToReachY(pos0, vel0, targetY, gravity);

    if (exactTime !== null && exactTime <= maxTime) {
      const position = BallGuide.simulatePosition(pos0, vel0, exactTime, gravity);
      const vyAtArrival = vel0.y - gravity * exactTime;
      const willLand = vyAtArrival < 0;
      return { position, timeSeconds: exactTime, willLand };
    }

    const STEP = 0.05;
    let bestTime = 0;
    let bestDist = Math.abs(pos0.y - targetY);
    let bestPos = pos0.clone();

    for (let t = STEP; t <= maxTime; t += STEP) {
      const pos = BallGuide.simulatePosition(pos0, vel0, t, gravity);
      const dist = Math.abs(pos.y - targetY);
      if (dist < bestDist) {
        bestDist = dist;
        bestTime = t;
        bestPos = pos;
      }
    }

    const vyAtBest = vel0.y - gravity * bestTime;
    const willLand = vyAtBest < 0 && bestPos.y <= pos0.y + vel0.y * bestTime * 0.5;

    return { position: bestPos, timeSeconds: bestTime, willLand };
  }

  /** Return the ball position at exactly `t` seconds from now. */
  static futurePosition(pos0: Vector3, vel0: Vector3, t: number, gravity = 9.8): Vector3 {
    return BallGuide.simulatePosition(pos0, vel0, t, gravity);
  }

  /**
   * Estimate time for ball to cross Z = targetZ (net crossing detection).
   * Returns null if ball is not heading toward targetZ.
   */
  static timeToCrossZ(pos0: Vector3, vel0: Vector3, targetZ: number): number | null {
    if (vel0.z === 0) {
      return null;
    }
    const t = (targetZ - pos0.z) / vel0.z;
    if (t <= 0) {
      return null;
    }
    return t;
  }
}
