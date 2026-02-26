import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Skeleton } from '@babylonjs/core/Bones/skeleton';

/**
 * Core interfaces - shared contracts for all systems
 * These define how different modules communicate
 */

/**
 * Base entity interface - all game objects that need updates
 */
export interface IEntity {
  update(deltaTime: number): void;
  dispose(): void;
}

/**
 * Ball physics system
 */
export interface IBallSystem extends IEntity {
  readonly velocity: Vector3;
  readonly position: Vector3;
  readonly mesh: AbstractMesh;

  applyKickImpulse(direction: Vector3, power: number): void;
  applyEffect(effectId: string): void;
  resetPosition(position: Vector3): void;
}

/**
 * Character/Player system
 */
export interface ICharacter extends IEntity {
  readonly id: number; // 0 or 1
  readonly position: Vector3;
  readonly mesh: AbstractMesh;
  readonly skeleton: Skeleton | null;
  readonly currentState: CharacterState;
  readonly stats: CharacterStats;

  setInputAction(action: GameAction, isPressed: boolean): void;
  getCurrentAnimation(): string;
  playAnimation(animName: string, loop?: boolean): void;
  setRotation(rotation: Quaternion): void;
  getKickDirection(): Vector3; // Unit vector of kick direction
  canKick(): boolean;
}

/**
 * Character configuration loaded from JSON
 */
export interface CharacterConfig {
  id: string;
  displayName: string;
  modelPath: string;
  stats: CharacterStats;
  superpowerAbility: string;
  limitation: string;
  animationMap: Record<string, string>; // state -> animation name
}

/**
 * Character stats
 */
export interface CharacterStats {
  speed: number; // movement speed m/s
  jump: number; // jump height
  power: number; // kick power multiplier
  spin: number; // ball spin effect
}

/**
 * Character state machine
 */
export enum CharacterState {
  IDLE = 'IDLE',
  MOVING = 'MOVING',
  JUMPING = 'JUMPING',
  KICKING = 'KICKING',
  STUNNED = 'STUNNED',
  DASHING = 'DASHING',
}

/**
 * Input actions
 */
export enum GameAction {
  MOVE_LEFT = 'MOVE_LEFT',
  MOVE_RIGHT = 'MOVE_RIGHT',
  MOVE_FORWARD = 'MOVE_FORWARD',
  MOVE_BACKWARD = 'MOVE_BACKWARD',
  JUMP = 'JUMP',
  KICK = 'KICK',
  USE_POWER = 'USE_POWER',
}

/**
 * Arena configuration
 */
export interface IArenaConfig {
  id: string;
  displayName: string;
  skyboxPath: string;
  fogColor: Vector3;
  gravityModifier: number; // 1.0 = default
  ambientParticlesPath: string;
  backgroundMusicPath: string;
}

/**
 * Ability/Superpower system
 */
export interface IAbility extends IEntity {
  readonly id: string;
  readonly isActive: boolean;
  readonly cooldownPercent: number; // 0-1

  activate(activator: ICharacter): void;
  deactivate(): void;
  tick(deltaTime: number): void;
}

/**
 * Match state and scoring
 */
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

/**
 * Rule evaluation result
 */
export interface RuleResult {
  isValid: boolean;
  reason: string;
  point?: number; // which team scores
}

/**
 * Rally event for rule engine
 */
export interface RallyEvent {
  type: 'touch' | 'net_touch' | 'hand_touch' | 'boundary_cross';
  playerIdTouching: number;
  ballPosition: Vector3;
  timestamp: number;
}

/**
 * VFX system
 */
export interface IVFXSystem extends IEntity {
  playEffect(effectId: string, position: Vector3, rotation?: Quaternion): void;
  stopEffect(effectId: string): void;
}

/**
 * Audio system
 */
export interface IAudioSystem extends IEntity {
  play(soundId: string, volume?: number): void;
  playLoop(soundId: string, volume?: number): void;
  stop(soundId: string): void;
  setGlobalVolume(volume: number): void;
}

/**
 * Input controller interface
 */
export interface IInputManager {
  getActionState(playerId: number, action: GameAction): boolean;
  getAxisInput(playerId: number, axis: 'horizontal' | 'vertical'): number;
  isUsingGamepad(): boolean;
}

/**
 * Camera controller interface
 */
export interface ICameraManager extends IEntity {
  setTarget(position: Vector3): void;
  zoomOut(distance: number): void;
  getActiveCameraRotation(): Quaternion;
}

/**
 * Match flow events
 */
export enum MatchEvent {
  POINT_SCORED = 'point_scored',
  SET_WON = 'set_won',
  MATCH_WON = 'match_won',
  SERVE_RESET = 'serve_reset',
  BALL_KICKED = 'ball_kicked',
  BALL_NET_TOUCH = 'ball_net_touch',
  ABILITY_ACTIVATED = 'ability_activated',
}
