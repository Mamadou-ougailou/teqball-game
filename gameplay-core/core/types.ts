/**
 * Pure contracts shared across the gameplay core.
 *
 * EXTRACTION NOTE: the original `src/core/interfaces.ts` mixed view-agnostic
 * contracts (IEntity, IMatchManager, CharacterStats, RuleResult…) with
 * BabylonJS-bound ones (ICharacter/IBallSystem referencing `AbstractMesh`,
 * `Skeleton`, `Vector3`, `Quaternion`). Importing anything from that file
 * therefore dragged in `@babylonjs/core`.
 *
 * Here we lift out ONLY the rendering-free contracts the pure systems actually
 * need, so the core has no Babylon dependency.
 */

/** Base entity interface — anything ticked by the game loop. */
export interface IEntity {
  update(deltaTime: number): void;
  dispose(): void;
}

/** Match state and scoring contract (verbatim shape from the original). */
export interface IMatchManager extends IEntity {
  readonly score: [number, number]; // [team1, team2]
  readonly sets: [number, number];
  readonly currentServer: number;
  readonly isMatchActive: boolean;

  recordPoint(scoringTeam: number): void;
  recordSetWin(winningTeam: number): void;
  resetServe(server: number): void;
  endMatch(winningTeam: number): void;
}

/** Character tuning stats (rendering-free subset of the original CharacterConfig). */
export interface CharacterStats {
  speed: number; // movement speed m/s
  jump: number; // jump height
  power: number; // kick power multiplier
  spin: number; // ball spin effect
}

/** Character state machine values (no mesh/animation coupling). */
export enum CharacterState {
  IDLE = 'IDLE',
  MOVING = 'MOVING',
  JUMPING = 'JUMPING',
  KICKING = 'KICKING',
  STUNNED = 'STUNNED',
  DASHING = 'DASHING',
}

/** Input actions (device-agnostic intent enum, verbatim from the original). */
export enum GameAction {
  MOVE_LEFT = 'MOVE_LEFT',
  MOVE_RIGHT = 'MOVE_RIGHT',
  MOVE_FORWARD = 'MOVE_FORWARD',
  MOVE_BACKWARD = 'MOVE_BACKWARD',
  JUMP = 'JUMP',
  KICK = 'KICK',
  USE_POWER = 'USE_POWER',
}

/** Match flow event names (verbatim from the original MatchEvent enum). */
export enum MatchEvent {
  POINT_SCORED = 'point_scored',
  SET_WON = 'set_won',
  MATCH_WON = 'match_won',
  SERVE_RESET = 'serve_reset',
  BALL_KICKED = 'ball_kicked',
  BALL_NET_TOUCH = 'ball_net_touch',
  ABILITY_ACTIVATED = 'ability_activated',
}
