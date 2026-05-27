import { Vector3 } from '@babylonjs/core/Maths/math.vector';

export class BallGuide {
  /**
   * Compute the initial velocity needed to follow a parabolic arc from `from` to `to`
   * with the apex at `arcHeight` meters above `from`.
   * Uses the exact formula from the spec:
   *   tUp   = sqrt(2 * arcHeight / gravity)
   *   tDown = sqrt(2 * max(0.01, arcHeight - (to.y - from.y)) / gravity)
   *   tTotal = tUp + tDown
   *   vx = (to.x - from.x) / tTotal
   *   vz = (to.z - from.z) / tTotal
   *   vy = gravity * tUp
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
   * zoneRadius is 1/3 of tableZoneHalfWidth (passed in).
   * Returns the offset target.
   */
  static addVariance(target: Vector3, tableZoneHalfWidth: number, accuracy: number): Vector3 {
    const zoneRadius = tableZoneHalfWidth / 3;
    const offsetMagnitude = zoneRadius * (1 - accuracy);

    // Random direction in XZ plane
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
   * Uses quadratic formula. Takes the larger root (descending pass).
   */
  static timeToReachY(pos0: Vector3, vel0: Vector3, targetY: number, gravity = 9.8): number | null {
    // pos0.y + vel0.y * t - 0.5 * gravity * t^2 = targetY
    // -0.5 * gravity * t^2 + vel0.y * t + (pos0.y - targetY) = 0
    // 0.5 * gravity * t^2 - vel0.y * t - (pos0.y - targetY) = 0
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

    // Take the larger root (descending pass)
    const tLarger = Math.max(t1, t2);
    if (tLarger <= 0) {
      return null;
    }

    return tLarger;
  }
}
