import { Vec3 as Vector3 } from '../math/Vec3';

/**
 * EXTRACTION NOTE: copied verbatim from src/systems/BallGuide.ts. Pure ballistic
 * maths — the only change is the import (`@babylonjs/core` Vector3 → self-contained
 * Vec3, aliased to `Vector3` so the body is untouched).
 */
export class BallGuide {
  /**
   * Compute the initial velocity needed to follow a parabolic arc from `from` to `to`
   * with the apex at `arcHeight` meters above `from`.
   */
  static computeArcVelocity(from: Vector3, to: Vector3, arcHeight: number, gravity = 9.8): Vector3 {
    const tUp = Math.sqrt(2 * arcHeight / gravity);
    const fallHeight = Math.max(0.01, arcHeight - (to.y - from.y));
    const tDown = Math.sqrt(2 * fallHeight / gravity);
    const tTotal = tUp + tDown;

    const vx = (to.x - from.x) / tTotal;
    const vz = (to.z - from.z) / tTotal;
    const vy = gravity * tUp;

    return new Vector3(vx, vy, vz);
  }

  /**
   * Add spatial variance to a target position.
   * actualTarget = zoneCenter + randomDirection * zoneRadius * (1 - accuracy)
   */
  static addVariance(target: Vector3, tableZoneHalfWidth: number, accuracy: number): Vector3 {
    const zoneRadius = tableZoneHalfWidth / 3;
    const offsetMagnitude = zoneRadius * (1 - accuracy);

    const angle = Math.random() * 2 * Math.PI;
    const dx = Math.cos(angle) * offsetMagnitude;
    const dz = Math.sin(angle) * offsetMagnitude;

    return new Vector3(target.x + dx, target.y, target.z + dz);
  }

  /**
   * Simulate ball position at time t given initial position, velocity, and gravity.
   * pos(t) = pos0 + vel * t + 0.5 * (0, -gravity, 0) * t^2
   */
  static simulatePosition(pos0: Vector3, vel0: Vector3, t: number, gravity = 9.8): Vector3 {
    const x = pos0.x + vel0.x * t;
    const y = pos0.y + vel0.y * t - 0.5 * gravity * t * t;
    const z = pos0.z + vel0.z * t;
    return new Vector3(x, y, z);
  }

  /**
   * Find the time t when simulatePosition(pos0, vel0, t).y == targetY (descending).
   * Returns null if the ball never reaches targetY while descending.
   */
  static timeToReachY(pos0: Vector3, vel0: Vector3, targetY: number, gravity = 9.8): number | null {
    const a = 0.5 * gravity;
    const b = -vel0.y;
    const c = -(pos0.y - targetY);

    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) {
      return null;
    }

    const sqrtDisc = Math.sqrt(discriminant);
    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);

    const tLarger = Math.max(t1, t2);
    if (tLarger <= 0) {
      return null;
    }

    return tLarger;
  }
}
