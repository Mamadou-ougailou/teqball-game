import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Skeleton } from '@babylonjs/core/Bones/skeleton';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { ICharacter, CharacterState, GameAction, CharacterStats } from '@core/interfaces';
import { EventBus } from '@core/EventBus';
import { KICK_COOLDOWN } from '@core/constants';
import { AnimationSystem } from '@animation/AnimationSystem';
import { AnimationEvents } from '@animation/AnimationEvents';

/** Frame within the kick clip at which foot/leg makes ball contact */
const KICK_IMPACT_FRAME = 12;
/** Duration in seconds a character remains stunned */
const STUN_DURATION = 1.5;
/** Fast blend for reactive actions (kick, stun) so they feel snappy */
const REACTIVE_BLEND = 0.05;

/**
 * Player controller entity.
 * Owns its AnimationSystem and AnimationEvents and drives the state machine
 * from input actions each frame.
 *
 * Lifecycle:
 *   1. new Character(id, stats)
 *   2. character.initialize(mesh, skeleton, animGroups, animationMap)  ← after GLB load
 *   3. character.update(deltaTime)  ← every frame
 *   4. character.setGrounded(true/false)  ← from PhysicsWorld collision callbacks
 *   5. character.setInputAction(action, pressed)  ← from InputManager
 */
export class Character implements ICharacter {
  readonly id: number;
  readonly stats: CharacterStats;

  private _state: CharacterState = CharacterState.IDLE;
  private _mesh: AbstractMesh | null = null;
  private _skeleton: Skeleton | null = null;

  private animSystem: AnimationSystem | null = null;
  private animEvents: AnimationEvents | null = null;

  private inputPressed: Map<GameAction, boolean> = new Map();
  private kickCooldownRemaining = 0;
  private stunTimeRemaining = 0;
  private _isGrounded = true;

  // Stored so EventBus.off() can match the exact reference
  private stunHandler = (): void => this.applyStun();

  constructor(id: number, stats: CharacterStats) {
    this.id = id;
    this.stats = stats;
  }

  /**
   * Call once after the character's .glb has been loaded.
   * Wires up the animation system, frame events, and stun listener.
   */
  initialize(
    mesh: AbstractMesh,
    skeleton: Skeleton | null,
    animGroups: AnimationGroup[],
    animationMap: Record<string, string>
  ): void {
    this._mesh = mesh;
    this._skeleton = skeleton;

    this.animSystem = new AnimationSystem(animGroups, animationMap);
    this.animEvents = new AnimationEvents(this.animSystem);

    // Kick impact fires kick:impact:<id> at frame 12 of the kick clip.
    // PhysicsWorld / Ball listens to this to apply the impulse at the right moment.
    this.animEvents.registerFrameEvent(
      CharacterState.KICKING,
      KICK_IMPACT_FRAME,
      `kick:impact:${this.id}`,
      false // non-looping clip, but keep false so rapid kicks still fire
    );

    // Return to IDLE automatically when the kick animation finishes
    const kickGroup = this.animSystem.getAnimationGroup(CharacterState.KICKING);
    if (kickGroup) {
      kickGroup.onAnimationGroupEndObservable.add(() => {
        if (this._state === CharacterState.KICKING) {
          this.transitionTo(CharacterState.IDLE);
        }
      });
    }

    // Return to IDLE when the jump animation finishes (landing handled by setGrounded too)
    const jumpGroup = this.animSystem.getAnimationGroup(CharacterState.JUMPING);
    if (jumpGroup) {
      jumpGroup.onAnimationGroupEndObservable.add(() => {
        if (this._state === CharacterState.JUMPING && this._isGrounded) {
          this.transitionTo(CharacterState.IDLE);
        }
      });
    }

    // Allow external systems (e.g. collision with power-up) to stun this character
    EventBus.on(`character:stun:${this.id}`, this.stunHandler);

    // Start in IDLE immediately with no blend (first frame)
    this.animSystem.playAnimation(CharacterState.IDLE, true, 0);
  }

  // ── ICharacter ────────────────────────────────────────────────────────────

  get currentState(): CharacterState {
    return this._state;
  }

  get position(): Vector3 {
    return this._mesh?.position ?? Vector3.Zero();
  }

  get mesh(): AbstractMesh {
    if (!this._mesh) throw new Error(`Character ${this.id}: not initialized — call initialize() after GLB load`);
    return this._mesh;
  }

  get skeleton(): Skeleton | null {
    return this._skeleton;
  }

  setInputAction(action: GameAction, isPressed: boolean): void {
    this.inputPressed.set(action, isPressed);
  }

  getCurrentAnimation(): string {
    return this.animSystem?.getCurrentAnimationName() ?? '';
  }

  playAnimation(stateName: string, loop = true): void {
    this.animSystem?.playAnimation(stateName, loop);
  }

  setRotation(rotation: Quaternion): void {
    if (this._mesh) this._mesh.rotationQuaternion = rotation;
  }

  getKickDirection(): Vector3 {
    if (!this._mesh) return Vector3.Forward();
    return this._mesh.getDirection(Vector3.Forward()).normalize();
  }

  canKick(): boolean {
    return (
      this.kickCooldownRemaining <= 0 &&
      this._state !== CharacterState.KICKING &&
      this._state !== CharacterState.STUNNED
    );
  }

  // ── IEntity ───────────────────────────────────────────────────────────────

  update(deltaTime: number): void {
    // Stun blocks all input processing
    if (this._state === CharacterState.STUNNED) {
      this.tickStun(deltaTime);
      this.animSystem?.update(deltaTime);
      return;
    }

    this.kickCooldownRemaining = Math.max(0, this.kickCooldownRemaining - deltaTime);

    // Input → state transitions (priority: kick > jump > move)
    this.processKick();
    this.processJump();
    this.processMovement();

    this.animSystem?.update(deltaTime);
    this.animEvents?.flushPending();
  }

  dispose(): void {
    EventBus.off(`character:stun:${this.id}`, this.stunHandler);
    this.animSystem?.dispose();
    this.animEvents?.dispose();
    this._mesh?.dispose();
    this._mesh = null;
    this._skeleton = null;
  }

  // ── Physics callbacks ─────────────────────────────────────────────────────

  /**
   * Called by PhysicsWorld when the character lands on or leaves the ground.
   * Triggers IDLE when landing from a jump.
   */
  setGrounded(grounded: boolean): void {
    const wasAirborne = !this._isGrounded;
    this._isGrounded = grounded;

    if (grounded && wasAirborne && this._state === CharacterState.JUMPING) {
      this.transitionTo(CharacterState.IDLE);
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private transitionTo(newState: CharacterState): void {
    if (this._state === newState) return;
    this._state = newState;

    switch (newState) {
      case CharacterState.IDLE:
        this.animSystem?.playAnimation(CharacterState.IDLE, true);
        break;

      case CharacterState.MOVING:
        this.animSystem?.playAnimation(CharacterState.MOVING, true);
        break;

      case CharacterState.JUMPING:
        this.animSystem?.playAnimation(CharacterState.JUMPING, false);
        this._isGrounded = false;
        break;

      case CharacterState.KICKING:
        // Fast blend so the kick feels snappy regardless of current pose
        this.animSystem?.playAnimation(CharacterState.KICKING, false, REACTIVE_BLEND);
        this.kickCooldownRemaining = KICK_COOLDOWN;
        EventBus.emit(`character:kick:${this.id}`);
        break;

      case CharacterState.STUNNED:
        this.animSystem?.playAnimation(CharacterState.STUNNED, true, REACTIVE_BLEND);
        break;

      case CharacterState.DASHING:
        this.animSystem?.playAnimation(CharacterState.DASHING, false, REACTIVE_BLEND);
        break;
    }
  }

  private processMovement(): void {
    // Movement state only applies when grounded and not in a locked state
    if (
      this._state === CharacterState.KICKING ||
      this._state === CharacterState.JUMPING
    ) return;

    const isMoving =
      this.inputPressed.get(GameAction.MOVE_LEFT) === true ||
      this.inputPressed.get(GameAction.MOVE_RIGHT) === true ||
      this.inputPressed.get(GameAction.MOVE_FORWARD) === true ||
      this.inputPressed.get(GameAction.MOVE_BACKWARD) === true;

    if (isMoving && this._state === CharacterState.IDLE) {
      this.transitionTo(CharacterState.MOVING);
    } else if (!isMoving && this._state === CharacterState.MOVING) {
      this.transitionTo(CharacterState.IDLE);
    }
  }

  private processJump(): void {
    if (
      !this._isGrounded ||
      this._state === CharacterState.JUMPING ||
      this._state === CharacterState.KICKING
    ) return;

    if (this.inputPressed.get(GameAction.JUMP) === true) {
      this.transitionTo(CharacterState.JUMPING);
    }
  }

  private processKick(): void {
    if (this.inputPressed.get(GameAction.KICK) !== true || !this.canKick()) return;
    this.transitionTo(CharacterState.KICKING);
  }

  private tickStun(deltaTime: number): void {
    this.stunTimeRemaining -= deltaTime;
    if (this.stunTimeRemaining <= 0) {
      this.stunTimeRemaining = 0;
      this.transitionTo(CharacterState.IDLE);
    }
  }

  private applyStun(): void {
    this.stunTimeRemaining = STUN_DURATION;
    this.transitionTo(CharacterState.STUNNED);
  }
}
