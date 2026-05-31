import { Character } from '../entities/Character';
import { Ball } from '../entities/Ball';
import { PhaseController } from '../gameplay/PhaseController';
import { KickSystem, TouchPhase } from './KickSystem';
import { TableZone, SpeedTier } from './ZoneSelector';
import { ISceneMetrics } from '../core/SceneMetrics';

export type RallyState =
  | 'SERVE_SETUP'
  | 'SERVING'
  | 'RECEPTION_OPEN'
  | 'RECEIVING'
  | 'PREPARATION'
  | 'KICK_PENDING'
  | 'BALL_IN_FLIGHT'
  | 'FAULT';

export interface RallyManagerOptions {
  players: [Character, Character];
  ball: Ball;
  metrics: ISceneMetrics;
  opponentZones: [TableZone[], TableZone[]]; // opponentZones[i] = zones player i aims at
  gravity?: number;
  onFault?: (scoringPlayer: 0 | 1) => void;
  onServeComplete?: () => void;
  // Called to select a zone for each phase. Return null for reception/preparation
  // (ball stays on the player's side). For kick, return the target zone to aim at.
  selectZone?: (activePlayerIdx: 0 | 1, phase: TouchPhase) => TableZone | null;
}

export class RallyManager {
  private _state: RallyState = 'SERVE_SETUP';
  private _serverIndex: 0 | 1 = 0;
  private _activePlayerIndex: 0 | 1 = 0;
  private _phases: [PhaseController, PhaseController];
  private _kickSystems: [KickSystem, KickSystem];
  private _options: RallyManagerOptions;
  private _stateTimer = 0;
  private _pendingTargetZone: TableZone | null = null;
  private _pendingSpeedTier: SpeedTier = 'Normal';

  get state(): RallyState { return this._state; }
  get serverIndex(): 0 | 1 { return this._serverIndex; }
  get activePlayerIndex(): 0 | 1 { return this._activePlayerIndex; }

  /** True when playerIdx is actively in a touch sequence (reception/preparation/kick). */
  isPlayerInRallySequence(playerIdx: 0 | 1): boolean {
    if (this._activePlayerIndex !== playerIdx) return false;
    return (
      this._state === 'RECEIVING' ||
      this._state === 'PREPARATION' ||
      this._state === 'KICK_PENDING'
    );
  }

  constructor(options: RallyManagerOptions) {
    this._options = options;
    this._phases = [
      new PhaseController(0),
      new PhaseController(1),
    ];
    this._kickSystems = [
      new KickSystem(options.players[0], options.ball, options.metrics, options.gravity ?? 9.8),
      new KickSystem(options.players[1], options.ball, options.metrics, options.gravity ?? 9.8),
    ];
  }

  setServer(idx: 0 | 1): void { this._serverIndex = idx; }

  /** Reset to SERVE_SETUP — call after a point is awarded. */
  setupForServe(): void {
    this._state = 'SERVE_SETUP';
    this._stateTimer = 0;
    this._phases[0].reset();
    this._phases[1].reset();
    this._kickSystems[0].reset();
    this._kickSystems[1].reset();
    this._pendingTargetZone = null;
    // Both players return to idle
    this._options.players[0].playAnimation('idle', true);
    this._options.players[1].playAnimation('idle', true);
  }

  notifyServeStarted(): void {
    this._state = 'SERVING';
    this._stateTimer = 0;
  }

  /** Call when serve ball bounces on receiver's side and rally should begin. */
  notifyServeComplete(): void {
    this._state = 'RECEPTION_OPEN';
    this._activePlayerIndex = (this._serverIndex === 0 ? 1 : 0);
    this._phases[this._activePlayerIndex].beginReception();
    this._stateTimer = 0;
    this._options.onServeComplete?.();
  }

  /** Begin reception for the active player immediately. */
  startReception(targetZone: TableZone | null, speedTier: SpeedTier): void {
    const active = this._activePlayerIndex;
    this._kickSystems[active].startTouch('reception', targetZone, speedTier);
    this._state = 'RECEIVING';
    this._stateTimer = 0;
  }

  // kept for external callers that need manual control
  startPreparation(targetZone: TableZone | null, speedTier: SpeedTier): void {
    const active = this._activePlayerIndex;
    this._kickSystems[active].startTouch('preparation', targetZone, speedTier);
    this._state = 'PREPARATION';
    this._stateTimer = 0;
  }

  startKick(targetZone: TableZone | null, speedTier: SpeedTier): void {
    const active = this._activePlayerIndex;
    this._kickSystems[active].startTouch('kick', targetZone, speedTier);
    this._state = 'KICK_PENDING';
    this._stateTimer = 0;
  }

  setPendingTargetZone(zone: TableZone): void { this._pendingTargetZone = zone; }
  setPendingSpeedTier(tier: SpeedTier): void { this._pendingSpeedTier = tier; }
  getPendingTargetZone(): TableZone | null { return this._pendingTargetZone; }

  /** Main update — call every frame. Drives the full reception→preparation→kick cycle. */
  update(deltaTime: number): RallyState {
    this._stateTimer += deltaTime;

    const active = this._activePlayerIndex;
    const phase = this._phases[active];
    const ks = this._kickSystems[active];

    switch (this._state) {
      case 'RECEPTION_OPEN':
        // Waiting for startReception() to be called externally (happens at serve-unlock).
        break;

      case 'RECEIVING':
        if (ks.isActive) {
          const done = ks.update(deltaTime);
          if (done) {
            phase.advanceToPreparation();
            this._state = 'PREPARATION';
            this._stateTimer = 0;
            // Auto-start preparation: ball will arc up, player winds up.
            const prepZone = this._options.selectZone?.(active, 'preparation') ?? null;
            ks.startTouch('preparation', prepZone, 'Normal');
          }
        }
        break;

      case 'PREPARATION':
        if (ks.isActive) {
          const done = ks.update(deltaTime);
          if (done) {
            phase.advanceToKick();
            this._state = 'KICK_PENDING';
            this._stateTimer = 0;
            // Auto-start kick toward selected zone.
            const kickZone = this._options.selectZone?.(active, 'kick') ?? null;
            ks.startTouch('kick', kickZone, 'Fast');
          }
        }
        break;

      case 'KICK_PENDING':
        if (ks.isActive) {
          const done = ks.update(deltaTime);
          if (done) {
            phase.completeTurn();
            this._state = 'BALL_IN_FLIGHT';
            this._stateTimer = 0;
            // Kicker returns to idle
            this._options.players[active].playAnimation('idle', true);
          }
        }
        break;

      case 'BALL_IN_FLIGHT':
        if (this._hasBallCrossedNet()) {
          this._switchActivePlayer(); // auto-starts reception, sets state to RECEIVING
        } else if (this._isBallFault()) {
          this._handleFault();
        } else if (this._stateTimer > 5.0) {
          // Timeout: ball didn't cross net — fault against kicker
          this._handleFault();
        }
        break;

      case 'FAULT':
        break;
    }

    // Touch limit fault
    if (phase.exceedsTouchLimit()) {
      this._handleFault();
    }

    phase.update(deltaTime);
    return this._state;
  }

  private _hasBallCrossedNet(): boolean {
    const ball = this._options.ball;
    const netZ = this._options.metrics.netCenterZ;
    const ballZ = ball.mesh.position.z;
    const active = this._activePlayerIndex;
    // Player 0 is on neg-Z, kicks toward pos-Z
    if (active === 0) return ballZ > netZ + 0.1;
    return ballZ < netZ - 0.1;
  }

  private _isBallFault(): boolean {
    return this._options.ball.mesh.position.y < -0.5;
  }

  private _handleFault(): void {
    const scorer: 0 | 1 = (this._activePlayerIndex === 0 ? 1 : 0);
    this._state = 'FAULT';
    this._options.onFault?.(scorer);
  }

  private _switchActivePlayer(): void {
    this._activePlayerIndex = (this._activePlayerIndex === 0 ? 1 : 0);
    const newActive = this._activePlayerIndex;
    this._phases[newActive].beginReception();
    this._kickSystems[newActive].reset();
    // Auto-start reception for the new receiver
    const zone = this._options.selectZone?.(newActive, 'reception') ?? null;
    this._kickSystems[newActive].startTouch('reception', zone, 'Normal');
    this._state = 'RECEIVING';
    this._stateTimer = 0;
  }
}
