import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { ICharacter, CharacterState, GameAction, CharacterStats } from '@core/interfaces';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Skeleton } from '@babylonjs/core/Bones/skeleton';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { AnimationSystem, PLAYER_ANIM } from '../animation/AnimationSystem';

export { CharacterState };

/**
 * Character/Player entity — wraps the root mesh, skeleton and animation system.
 * Animation is driven externally by calling setMovement() each frame.
 */
export class Character implements ICharacter {
  readonly id: number;
  readonly stats: CharacterStats;
  readonly mesh: AbstractMesh;
  readonly skeleton: Skeleton | null;

  private _state: CharacterState = CharacterState.IDLE;
  private _anim: AnimationSystem | null = null;
  private _kickTimer = 0;   // seconds remaining in kick animation

  get currentState(): CharacterState { return this._state; }

  get position(): Vector3 {
    return this.mesh.position;
  }

  constructor(
    id: number,
    mesh: AbstractMesh,
    skeleton: Skeleton | null,
    stats: CharacterStats,
    animationGroups?: AnimationGroup[],
  ) {
    this.id       = id;
    this.mesh     = mesh;
    this.skeleton = skeleton;
    this.stats    = stats;

    if (animationGroups && animationGroups.length > 0) {
      // Retarget all shadow-armature animation groups to the visible skeleton.
      // This is a no-op if there is only one skeleton (i.e. after a proper
      // single-armature re-export from Blender).
      if (skeleton && animationGroups.length > 1) {
        AnimationSystem.retargetToSkeleton(animationGroups, skeleton);
      }
      this._anim = new AnimationSystem(animationGroups);
      this._anim.play('idle');
    }
  }

  /**
   * Drive the animation state from the movement vector and kick flag.
   * Call this every frame (from the render loop).
   * @param moveX  horizontal input (-1 / 0 / +1)
   * @param moveZ  forward/back input (-1 / 0 / +1)
   * @param kick   true on the frame a kick is triggered
   * @param deltaTime seconds since last frame
   */
  setMovement(moveX: number, moveZ: number, kick: boolean, deltaTime: number): void {
    if (!this._anim) return;

    // Kick has priority — run the one-shot then return to idle/jog
    if (kick && this._kickTimer <= 0) {
      this._kickTimer = 0.7;   // ~0.7 s for a kick clip
      this._anim.playOnce('kick2', 'idle');
      this._state = CharacterState.IDLE; // will resolve via callback
      return;
    }

    // Countdown kick cooldown once clip ends
    if (this._kickTimer > 0) {
      this._kickTimer = Math.max(0, this._kickTimer - deltaTime);
      return;
    }

    // Movement-based state
    if (moveZ < -0.1) {
      if (this._state !== CharacterState.MOVING) {
        this._state = CharacterState.MOVING;
        this._anim.play('jogForward');
      }
    } else if (moveZ > 0.1) {
      if (this._state !== CharacterState.MOVING) {
        this._state = CharacterState.MOVING;
        this._anim.play('jogBack');
      }
    } else if (moveX < -0.1) {
      if (this._state !== CharacterState.MOVING) {
        this._state = CharacterState.MOVING;
        this._anim.play('strafeLeft');
      }
    } else if (moveX > 0.1) {
      if (this._state !== CharacterState.MOVING) {
        this._state = CharacterState.MOVING;
        this._anim.play('strafeRight');
      }
    } else {
      if (this._state !== CharacterState.IDLE) {
        this._state = CharacterState.IDLE;
        this._anim.play('idle');
      }
    }
  }

  /** Force a specific animation by key (for scripted sequences). */
  playAnimation(key: keyof typeof PLAYER_ANIM | string, loop = true): void {
    this._anim?.play(key as keyof typeof PLAYER_ANIM, loop);
  }

  getCurrentAnimation(): string {
    return String(this._anim?.activeIndex ?? -1);
  }

  setInputAction(_action: GameAction, _isPressed: boolean): void {}

  setRotation(): void {}

  getKickDirection(): Vector3 {
    return this.mesh.forward ?? Vector3.Forward();
  }

  canKick(): boolean {
    return this._kickTimer <= 0;
  }

  update(deltaTime: number): void {
    if (this._kickTimer > 0) {
      this._kickTimer = Math.max(0, this._kickTimer - deltaTime);
    }
  }

  dispose(): void {
    this._anim?.dispose();
  }
}
