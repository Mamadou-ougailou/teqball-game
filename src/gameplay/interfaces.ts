import { Vector3 } from '@babylonjs/core/Maths/math.vector';

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
  ballPosition: Vector3;
  timestamp: number;
}
