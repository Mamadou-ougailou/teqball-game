import { Vector3 } from '@babylonjs/core/Maths/math.vector';

export const SCALE = 1.5; // Global scale factor

export const DOUBLE_TAP_WINDOW_MS = 260;
export const P1_KICK_GRACE_MS = 2500;
export const KICK_CHARGE_TABLE: Array<[number, number]> = [
  [300,      0.80],
  [700,      1.00],
  [1200,     1.20],
  [2000,     1.45],
  [Infinity, 1.75],
];

// Spawn ball well above the table surface (table top is ~0.76 m; ball radius 0.11 m)
export const BALL_SPAWN_POSITION = new Vector3(0, 1.5 * SCALE, 0);
export const BALL_MAX_UPWARD_SPEED = 8 * SCALE;
export const BALL_MAX_DOWNWARD_SPEED = 18 * SCALE;
export const BALL_RESET_HEIGHT = 8 * SCALE;
export const BALL_RESET_MIN_Y = -4 * SCALE;
export const BALL_RESET_X_LIMIT = 10 * SCALE;
export const BALL_RESET_Z_LIMIT = 14 * SCALE;
export const PLAYER_MODEL_YAW_OFFSET = -Math.PI / 2;
export const ENABLE_P1_AI = false; // AI vs AI preview mode
export const ENABLE_P2_AI = true;
export const SERVE_LINE_Z = 3.5 * SCALE;
export const PLAYER_SPAWN_Z = 4.2 * SCALE;
export const PLAYER_TABLE_CLEARANCE_Z = 2.3 * SCALE;
export const PURE_BALL_PHYSICS = true;
export const ENABLE_BALL_ASSIST = !PURE_BALL_PHYSICS; // scripted ball arcs for auto-touches + aim kick
export const TABLE_SCALE = 1.0;
export const WORLD_BOUNCE_RESTITUTION = 0.82;
export const TABLE_BOUNCE_RESTITUTION = 0.84;
export const BALL_BOUNCE_RESTITUTION = 0.84;
export const GLOBAL_KICK_VELOCITY_MULTIPLIER = 1.20;
export const ENABLE_NO_GROUND_FALL_GUARD = true;
export const NO_GROUND_FALL_TRIGGER_HEIGHT = 0.07 * SCALE;
export const NO_GROUND_FALL_REBOUND_MIN_SPEED = 2.2 * SCALE;
export const NO_GROUND_FALL_RESTITUTION = 0.82;
export const NO_GROUND_FALL_LATERAL_DAMPING = 0.97;

export const getCourtCenterFacing = (position: Vector3): number => Math.atan2(-position.x, -position.z);
export const getLateralReceptionFacing = (position: Vector3, ballPosition: Vector3): number => {
  const centerFacing = getCourtCenterFacing(position);
  const towardBallSide = ballPosition.x >= position.x ? -1 : 1;
  return centerFacing + towardBallSide * (Math.PI / 2);
};

export const AI_BEHIND_SERVE_TARGET_Z = SERVE_LINE_Z + 0.55 * SCALE;
export const AI_PREP_STEP_IN_TARGET_Z = SERVE_LINE_Z - 0.65 * SCALE;
export const AI_FINAL_KICK_TARGET_Z = SERVE_LINE_Z - 1.00 * SCALE;
export const AI_SHORT_RETURN_STEP_IN_Z = SERVE_LINE_Z - 0.35 * SCALE;
export const AI_LOW_SPEED_RETURN_THRESHOLD = 2.8 * SCALE;

export const SERVE_READY_PAUSE_SECONDS = 0.35;
export const SERVE_FLIGHT_LOCK_MAX_SECONDS = PURE_BALL_PHYSICS ? 4.0 : 1.6;
export const SERVE_TOSS_RIGHT_ANGLE_DEG = -45;
export const SERVE_TOSS_FORWARD_ANGLE_DEG = -30;
export const SERVE_TOSS_HEIGHT_MULT = 3.15;
export const SERVE_TOSS_CONTACT_RIGHT_MAX = 0.16;
export const SERVE_TOSS_CONTACT_FORWARD_MAX = 0.12;

export type CourtSide = 0 | 1; // 0 = P1/negative Z side, 1 = P2/positive Z side
export type OffensiveAction =
  | 'header' | 'chest' | 'knee' | 'scissor' // legacy aliases
  | 'receptionChest' | 'receptionToe' | 'receptionInnerRight'
  | 'prepChest' | 'prepInnerRight'
  | 'kickCloseHead' | 'kickCloseRightFoot' | 'kickHead'
  | 'kickHighLeft' | 'kickJumpHead' | 'kickSoleRight' | 'kickBicycleLeft' | 'kickChest';

export const SOCKET_HEIGHT_CALIBRATION_ACTIONS: OffensiveAction[] = [
  'receptionChest',
  'receptionToe',
  'receptionInnerRight',
  'prepChest',
  'prepInnerRight',
  'kickCloseHead',
  'kickCloseRightFoot',
  'kickHead',
  'kickHighLeft',
  'kickJumpHead',
  'kickSoleRight',
  'kickBicycleLeft',
  'kickChest',
];

export type ServePhase = 'ready' | 'toss' | 'strike' | 'flight';
export type ServeState = {
  active: boolean;
  server: CourtSide;
  phase: ServePhase;
  timer: number;
  tossReleased: boolean;
  strikeApplied: boolean;
  animationStarted: boolean;
  foot: 'left' | 'right';
  hand: 'left' | 'right';
};
