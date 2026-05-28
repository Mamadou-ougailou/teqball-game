import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Character } from '../entities/Character';
import { Ball } from '../entities/Ball';
import { BallPredictor } from './BallPredictor';
import { BallGuide } from './BallGuide';
import { AnimSelector, AnimSelection } from './AnimSelector';
import { AnimTimer } from './AnimTimer';
import { ZoneSelector, TableZone, SpeedTier } from './ZoneSelector';
import { getAnimConfigForClip, ANIM_CONFIG_FPS } from '../data/animationConfig';
import { ISceneMetrics } from '../core/SceneMetrics';

export type TouchPhase = 'reception' | 'preparation' | 'kick';

export interface TouchResult {
  contactFired: boolean;
  clipKey: string;
  velocity?: Vector3;
}

export class KickSystem {
  private _phase: TouchPhase | null = null;
  private _timer = 0;
  private _contactFired = false;
  private _selection: AnimSelection | null = null;
  private _speedRatio = 1.0;
  private _contactTime = 0;
  private _animStartDelay = 0;
  private _animStarted = false;
  private _targetZone: TableZone | null = null;
  private _player: Character;
  private _ball: Ball;
  private _metrics: ISceneMetrics;
  private _gravity: number;
  private _onContactCallback?: (velocity: Vector3) => void;

  get isActive(): boolean { return this._phase !== null; }
  get currentPhase(): TouchPhase | null { return this._phase; }

  constructor(player: Character, ball: Ball, metrics: ISceneMetrics, gravity = 9.8) {
    this._player = player;
    this._ball = ball;
    this._metrics = metrics;
    this._gravity = gravity;
  }

  /**
   * Start a touch sequence.
   * @param phase - which touch phase this is
   * @param targetZone - for kick phase, where to aim
   * @param speedTier - Normal | Fast | Maximum
   * @param onContact - callback fired when ball impulse is applied
   */
  startTouch(
    phase: TouchPhase,
    targetZone: TableZone | null,
    speedTier: SpeedTier,
    onContact?: (velocity: Vector3) => void,
  ): void {
    this._phase = phase;
    this._timer = 0;
    this._contactFired = false;
    this._targetZone = targetZone;
    this._onContactCallback = onContact;

    // Get current ball state
    const ballPos = this._ball.mesh.position.clone();
    const ballVel = this._ball.mesh.physicsBody
      ? this._ball.mesh.physicsBody.getLinearVelocity()
      : Vector3.Zero();

    // Contact height: player Y + 1.0
    const contactY = this._player.mesh.position.y + 1.0;

    // Predict ball arrival
    const prediction = BallPredictor.ballAtArrival(ballPos, ballVel, contactY, this._gravity);

    // Select animation based on phase
    let selection: AnimSelection;
    if (phase === 'reception') {
      selection = AnimSelector.selectReception(prediction.position, this._metrics.tableTopY);
    } else if (phase === 'preparation') {
      // Use kick-side based on target zone or ball position
      const kickSide = (targetZone?.center.x ?? prediction.position.x) < 0 ? 'left' : 'right';
      selection = AnimSelector.selectPreparation(prediction.position.x, kickSide);
    } else {
      // kick
      const targetZoneX = targetZone?.center.x ?? 0;
      selection = AnimSelector.selectKick(prediction.position, this._metrics.tableTopY, targetZoneX);
    }

    this._selection = selection;

    // Get animation config and compute speed ratio
    const config = getAnimConfigForClip(selection.clipKey);
    if (config) {
      this._speedRatio = AnimTimer.computeSpeedRatio(config, prediction.timeSeconds);
      const animDuration = AnimTimer.timeToContact(config, this._speedRatio);
      // Fire contact exactly when ball arrives. If the animation is shorter than
      // arrival time (long fly), delay starting it so the contact frame lands at
      // arrival — keeps the animation playing at full speed and gives the player
      // extra time to position into the ball's landing spot.
      this._contactTime = Math.max(animDuration, prediction.timeSeconds);
      this._animStartDelay = Math.max(0, this._contactTime - animDuration);
    } else {
      this._speedRatio = 1.0;
      this._contactTime = 0.5;
      this._animStartDelay = 0;
    }

    this._animStarted = false;
    if (this._animStartDelay <= 0.001) {
      this._player.playAnimation(selection.clipKey, false, selection.mirrorX);
      this._animStarted = true;
    }
  }

  /** Call every frame. Returns true when touch sequence is complete. */
  update(deltaTime: number): boolean {
    if (this._phase === null) return true;

    this._timer += deltaTime;

    if (!this._animStarted && this._selection && this._timer >= this._animStartDelay) {
      this._player.playAnimation(this._selection.clipKey, false, this._selection.mirrorX);
      this._animStarted = true;
    }

    if (this._timer >= this._contactTime && !this._contactFired) {
      // Determine contact bone position
      const selection = this._selection;
      let bonePos: Vector3;

      if (selection) {
        // Head clips use the head bone; all others (chest, knee, foot) use the
        // activeBone from AnimConfig via getStrikeBonePosition().
        const isHeadClip = selection.clipKey.includes('head');

        if (isHeadClip) {
          bonePos = this._player.getHeadControlPosition();
        } else {
          // Pass the ball's pre-snap position as the reference so foot/knee
          // bone resolution picks whichever side is actually reaching for the ball.
          const ballNow = this._ball.mesh.position;
          const strikeBonePos = this._player.getStrikeBonePosition();
          // If bone not found, fall back to a sensible height above the root.
          bonePos = strikeBonePos.equals(this._player.mesh.position)
            ? this._player.mesh.position.clone().add(new Vector3(0, 1.0, 0))
            : strikeBonePos;
        }
      } else {
        bonePos = this._player.mesh.position.clone().add(new Vector3(0, 1.0, 0));
      }

      // Snap ball to bone
      this._ball.mesh.position.copyFrom(bonePos);

      // Compute velocity based on phase
      let velocity: Vector3;

      // Which way is "toward the net" for this player
      const towardNet = this._player.mesh.position.z <= 0 ? 1 : -1;

      if (this._phase === 'reception') {
        // Ball pops perfectly straight up to ~head height above the player. Bypass
        // the arc-velocity helper to guarantee zero horizontal drift — any tiny
        // numerical noise on vx/vz would otherwise carry the ball sideways.
        const desiredApexY = Math.max(this._player.mesh.position.y + 3.5, bonePos.y + 2.0);
        const arcHeight = desiredApexY - bonePos.y;
        const vy = Math.sqrt(2 * arcHeight * this._gravity);
        velocity = new Vector3(0, vy, 0);
      } else if (this._phase === 'preparation') {
        // Ball arcs forward toward the net and to a comfortable kick height so the
        // player can step in and hit cleanly on the third touch.
        const prepTarget = new Vector3(
          bonePos.x * 0.5,                       // slight centering on X
          this._metrics.tableTopY + 1.0,          // foot/knee kick height above table
          bonePos.z + towardNet * 1.5,            // 1.5 units forward toward net
        );
        velocity = BallGuide.computeArcVelocity(bonePos, prepTarget, 1.5, this._gravity);
      } else {
        // Kick: low, flat arc straight at the target zone on the opponent's table.
        if (this._targetZone) {
          const landingTarget = ZoneSelector.getLandingTarget(this._targetZone, 0.85);
          velocity = BallGuide.computeArcVelocity(bonePos, landingTarget, 0.9, this._gravity);
        } else {
          // No zone: kick straight over the net
          const fallbackTarget = new Vector3(
            bonePos.x,
            this._metrics.tableTopY + 0.05,
            bonePos.z + towardNet * 3.0,
          );
          velocity = BallGuide.computeArcVelocity(bonePos, fallbackTarget, 0.9, this._gravity);
        }
      }

      // Apply velocity. Zero angular velocity too so the incoming ball's spin
      // doesn't curve the rebound — receptions in particular need a clean pop-up.
      if (this._ball.mesh.physicsBody) {
        this._ball.mesh.physicsBody.setLinearVelocity(velocity);
        this._ball.mesh.physicsBody.setAngularVelocity(Vector3.Zero());
      }

      this._contactFired = true;
      this._onContactCallback?.(velocity);
    }

    // Sequence complete 0.5s after contact
    if (this._timer >= this._contactTime + 0.5) {
      this.reset();
      return true;
    }

    return false;
  }

  reset(): void {
    this._phase = null;
    this._timer = 0;
    this._contactFired = false;
    this._animStarted = false;
    this._animStartDelay = 0;
  }
}
