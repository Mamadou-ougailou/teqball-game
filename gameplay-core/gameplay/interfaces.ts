import { Vec3 } from '../math/Vec3';

/**
 * EXTRACTION NOTE: from src/gameplay/interfaces.ts. The ONLY change is the ball
 * position type: the original used BabylonJS `Vector3`; here it is the
 * self-contained {@link Vec3}, removing the engine dependency.
 */

/**
 * Result returned by every rule evaluation function.
 */
export interface RuleResult {
  isValid: boolean;
  reason: string;
  /** Which team scores (1 or 2). Undefined when no point is awarded. */
  point?: number;
}

/**
 * Event produced whenever the ball is touched or crosses a boundary.
 */
export interface RallyEvent {
  playerIdTouching: number;
  ballPosition: Vec3;
  timestamp: number;
}
