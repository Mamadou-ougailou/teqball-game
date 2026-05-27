import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Character } from '../entities/Character';
import { Ball } from '../entities/Ball';
import { BallGuide } from '../systems/BallGuide';
import { getAnimConfigForClip } from '../data/animationConfig';
import { ISceneMetrics } from '../core/SceneMetrics';

export type ServePhase = 'idle' | 'ready' | 'toss' | 'strike' | 'flight' | 'done';

export interface ServeResult {
  scored: false; // serve systems just report completion
  strikeApplied: boolean;
}

export class ServeSystem {
  private _phase: ServePhase = 'idle';
  private _timer = 0;
  private _tossReleased = false;
  private _strikeApplied = false;
  private _animStarted = false;
  private _clipKey: string = 'serveleftfoot';

  private _server: Character;
  private _ball: Ball;
  private _metrics: ISceneMetrics;
  private _gravity: number;

  get phase(): ServePhase { return this._phase; }
  get isActive(): boolean { return this._phase !== 'idle' && this._phase !== 'done'; }

  constructor(server: Character, ball: Ball, metrics: ISceneMetrics, gravity = 9.8) {
    this._server = server;
    this._ball = ball;
    this._metrics = metrics;
    this._gravity = gravity;
  }

  /** Call to begin a serve. clipKey = e.g. 'serveleftfoot', 'headserveleft'. */
  start(clipKey: string): void {
    this._clipKey = clipKey;
    this._phase = 'ready';
    this._timer = 0;
    this._tossReleased = false;
    this._strikeApplied = false;
    this._animStarted = false;
  }

  /** Call every frame during the serve. Returns true when serve is complete. */
  update(deltaTime: number): boolean {
    const config = getAnimConfigForClip(this._clipKey);

    // Fallback config values if clip is not found
    const tossFrame = config?.tossFrame ?? 21;
    const contactFrame = config?.contactFrame ?? 65;
    const serveHand = config?.serveHand ?? 'left';

    const tossReleaseTime = tossFrame / 30;
    const contactTime = contactFrame / 30;

    switch (this._phase) {
      case 'ready': {
        // Keep ball at hand position; wait for external caller to proceed to toss
        const handPos = this._server.getHandControlPosition(serveHand);
        this._ball.mesh.position.copyFrom(handPos);
        // Transition to toss on next update (external: caller calls start() to begin)
        // Since ready is entered immediately, transition to toss right away
        this._phase = 'toss';
        this._timer = 0;
        break;
      }

      case 'toss': {
        // On entry (timer was just reset), start the animation
        if (!this._animStarted) {
          this._server.playAnimation(this._clipKey, false);
          this._animStarted = true;
        }

        this._timer += deltaTime;

        const handPos = this._server.getHandControlPosition(serveHand);

        if (!this._tossReleased) {
          // Keep ball glued to hand
          this._ball.mesh.position.copyFrom(handPos);

          if (this._timer >= tossReleaseTime) {
            // Release ball — arc to head position
            const headPos = this._server.getHeadControlPosition();

            // Spec §6.2: tossHeight = 0.5 * g * ((contactFrame - tossFrame) / 30)²
            const frameDelta = Math.max(1, contactFrame - tossFrame);
            const tossArcHeight = 0.5 * this._gravity * (frameDelta / 30) ** 2;
            const clampedArcHeight = Math.max(0.3, Math.min(3.0, tossArcHeight));

            const tossVelocity = BallGuide.computeArcVelocity(
              handPos,
              headPos,
              clampedArcHeight,
              this._gravity,
            );
            if (this._ball.mesh.physicsBody) {
              this._ball.mesh.physicsBody.setLinearVelocity(tossVelocity);
            }
            this._tossReleased = true;
          }
        }

        if (this._timer >= contactTime) {
          this._phase = 'strike';
          this._timer = 0;
        }
        break;
      }

      case 'strike': {
        this._timer += deltaTime;

        if (!this._strikeApplied) {
          // Determine contact bone: head-based serves use head, foot-based use hand fallback
          const isHeadServe = this._clipKey.startsWith('headserve');
          const contactPos = isHeadServe
            ? this._server.getHeadControlPosition()
            : this._server.getHandControlPosition(serveHand);

          // Check if ball is near the contact bone (within 0.8m)
          const dist = Vector3.Distance(this._ball.mesh.position, contactPos);
          const shouldApply = dist < 0.8 || this._timer >= 0.2;

          if (shouldApply) {
            // Compute kick direction toward opponent's side of the table
            // If server is on neg-Z side (tableCenterZ <= 0), target toward pos-Z
            const tableCenterZ = this._metrics.tableCenterZ;
            const tableHalfLength = this._metrics.tableHalfLength;
            const tableTopY = this._metrics.tableTopY;

            // Target on opponent side (opposite side of net)
            const serverZ = this._server.mesh.position.z;
            const targetZ = serverZ <= 0
              ? tableCenterZ + tableHalfLength * 0.3
              : tableCenterZ - tableHalfLength * 0.3;

            const target = new Vector3(contactPos.x * 0.5, tableTopY + 0.1, targetZ);
            const strikeVelocity = BallGuide.computeArcVelocity(
              contactPos,
              target,
              0.6,
              this._gravity,
            );

            if (this._ball.mesh.physicsBody) {
              this._ball.mesh.physicsBody.setLinearVelocity(strikeVelocity);
            }
            this._strikeApplied = true;
            this._phase = 'flight';
            this._timer = 0;
          }
        }

        // Timeout fallback
        if (this._timer >= 0.2 && !this._strikeApplied) {
          this._strikeApplied = true;
          this._phase = 'flight';
          this._timer = 0;
        }
        break;
      }

      case 'flight': {
        this._timer += deltaTime;
        if (this._timer >= 1.5) {
          this._phase = 'done';
          return true;
        }
        break;
      }

      case 'idle':
      case 'done':
        break;
    }

    return false;
  }

  /** Reset to idle (e.g. on point award mid-serve). */
  reset(): void {
    this._phase = 'idle';
    this._timer = 0;
  }
}
