import { RuleResult, RallyEvent } from './interfaces';
import {
  POINTS_PER_SET,
  SETS_TO_WIN,
  MAX_TOUCHES_PER_PLAYER,
  TABLE_WIDTH,
} from './constants';

/**
 * RULE ENGINE - Pure Functions
 * No BabylonJS dependency. Fully unit-testable.
 * Evaluates teqball rules and returns decisions.
 *
 * EXTRACTION NOTE: copied verbatim from src/gameplay/RuleEngine.ts. It was
 * already the cleanest piece of view-agnostic logic in the project — the only
 * thing it referenced from the engine was the `Vector3` *type* on
 * `RallyEvent.ballPosition`, which now resolves to the self-contained Vec3.
 *
 * Teqball Rules:
 * - Each player max 3 touches before ball must go over net
 * - No hand touches above net height
 * - Ball must land within boundaries
 * - Net touch counts as opponent's touch
 * - First to 25 points wins a set, first to 2 sets wins match
 */

export interface RallySituation {
  touchCount: number; // consecutive touches by current player
  lastTouchPlayerId: number; // who touched last
  ballIsOnTeam1Side: boolean;
  ballHasPassedNet: boolean;
  pointsTeam1: number;
  pointsTeam2: number;
  setsTeam1: number;
  setsTeam2: number;
}

/**
 * Initialize rally state
 */
export function initializeRallyState(): RallySituation {
  return {
    touchCount: 0,
    lastTouchPlayerId: -1,
    ballIsOnTeam1Side: true,
    ballHasPassedNet: false,
    pointsTeam1: 0,
    pointsTeam2: 0,
    setsTeam1: 0,
    setsTeam2: 0,
  };
}

/**
 * Evaluate a touch event (player kicks ball)
 */
export function evaluatePlayerTouch(
  situation: RallySituation,
  event: RallyEvent,
  playerTeam: number
): RuleResult {
  const otherTeam = playerTeam === 1 ? 2 : 1;

  // Check if same player is touching consecutively
  if (event.playerIdTouching === situation.lastTouchPlayerId) {
    situation.touchCount++;
  } else {
    situation.touchCount = 1;
    situation.lastTouchPlayerId = event.playerIdTouching;
  }

  // Rule: Max 3 touches before passing to other team
  if (situation.touchCount > MAX_TOUCHES_PER_PLAYER) {
    return {
      isValid: false,
      reason: `Max ${MAX_TOUCHES_PER_PLAYER} touches exceeded`,
      point: otherTeam,
    };
  }

  return {
    isValid: true,
    reason: `Touch ${situation.touchCount} valid`,
  };
}

/**
 * Evaluate hand touch above net (not allowed)
 */
export function evaluateHandTouch(
  situation: RallySituation,
  event: RallyEvent,
  netHeight: number
): RuleResult {
  if (event.ballPosition.y > netHeight) {
    return {
      isValid: false,
      reason: 'Hand touch above net height - fault',
      point: situation.lastTouchPlayerId === 0 ? 2 : 1,
    };
  }

  return {
    isValid: true,
    reason: 'Hand touch below net - valid',
  };
}

/**
 * Evaluate ball boundary crossing
 */
export function evaluateBoundary(
  situation: RallySituation,
  event: RallyEvent,
  tableWidth: number = TABLE_WIDTH
): RuleResult {
  const halfWidth = tableWidth / 2;

  if (Math.abs(event.ballPosition.x) > halfWidth) {
    const faultingTeam = situation.lastTouchPlayerId < 2 ? 1 : 2;
    const scoringTeam = faultingTeam === 1 ? 2 : 1;

    return {
      isValid: false,
      reason: 'Ball out of bounds',
      point: scoringTeam,
    };
  }

  return {
    isValid: true,
    reason: 'Ball in bounds',
  };
}

/**
 * Evaluate net touch event
 */
export function evaluateNetTouch(situation: RallySituation, _playerTeam: number): RuleResult {
  situation.lastTouchPlayerId = -1; // Net reset touch counter
  situation.touchCount = 0;

  return {
    isValid: true,
    reason: 'Net touch - possession change',
  };
}

/**
 * Record a point and determine if set is won
 */
export function recordPoint(
  situation: RallySituation,
  scoringTeam: number
): { setWon: boolean; matchWon: boolean } {
  if (scoringTeam === 1) {
    situation.pointsTeam1++;
  } else {
    situation.pointsTeam2++;
  }

  let setWon = false;
  let matchWon = false;

  const points1 = situation.pointsTeam1;
  const points2 = situation.pointsTeam2;

  // Check set win (first to 25, with min 2 point lead)
  if (points1 >= POINTS_PER_SET && points1 - points2 >= 2) {
    situation.setsTeam1++;
    setWon = true;
    situation.pointsTeam1 = 0;
    situation.pointsTeam2 = 0;
  } else if (points2 >= POINTS_PER_SET && points2 - points1 >= 2) {
    situation.setsTeam2++;
    setWon = true;
    situation.pointsTeam1 = 0;
    situation.pointsTeam2 = 0;
  }

  // Check match win (first to 2 sets)
  if (situation.setsTeam1 >= SETS_TO_WIN) {
    matchWon = true;
  } else if (situation.setsTeam2 >= SETS_TO_WIN) {
    matchWon = true;
  }

  return { setWon, matchWon };
}

/**
 * Validate complete rally situation (sanity check)
 */
export function validateRallySituation(situation: RallySituation): RuleResult {
  if (situation.pointsTeam1 > POINTS_PER_SET + 5) {
    return {
      isValid: false,
      reason: 'Points exceed maximum for set',
    };
  }

  if (situation.setsTeam1 > SETS_TO_WIN + 1 || situation.setsTeam2 > SETS_TO_WIN + 1) {
    return {
      isValid: false,
      reason: 'Sets exceed match win condition',
    };
  }

  return {
    isValid: true,
    reason: 'Rally state valid',
  };
}

/**
 * Reset rally state for new serve
 */
export function resetRallyForServe(situation: RallySituation): void {
  situation.touchCount = 0;
  situation.lastTouchPlayerId = -1;
  situation.ballIsOnTeam1Side = true;
  situation.ballHasPassedNet = false;
}
