import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { ICharacter, CharacterState, GameAction, CharacterStats } from '@core/interfaces';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Skeleton } from '@babylonjs/core/Bones/skeleton';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { AnimationSystem, PlayerAnimKey } from '../animation/AnimationSystem';
import { AnimConfig, getAnimConfigForClip } from '../data/animationConfig';

export { CharacterState };

type GameplayAction =
  | 'header' | 'chest' | 'knee' | 'scissor' // legacy aliases
  | 'receptionChest' | 'receptionToe' | 'receptionInnerRight'
  | 'prepChest' | 'prepInnerRight'
  | 'kickCloseHead' | 'kickCloseRightFoot' | 'kickHead'
  | 'kickHighLeft' | 'kickJumpHead' | 'kickSoleRight' | 'kickBicycleLeft' | 'kickChest';

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
  private _kickTimer = 0;   // seconds remaining in current action animation
  private _locomotionAnim: PlayerAnimKey = 'idle';
  private _currentStrikeBone: string | null = null;  // 'head' | 'chest' | 'foot' | null
  private _activeFootSide: 'left' | 'right' | 'center' = 'center';
  private _lastFacingAngle = 0; // track current mesh rotation
  private _baseScaleX = 1;
  private _mirrorTargets: AbstractMesh[] = [];
  private readonly _baseScaleByMeshId = new Map<number, number>();
  private _mirrorX = false;
  private _capturedFacingYaw: number | null = null;
  private readonly _yawOffset: number;
  private _animationFacingCompensationYaw = 0;
  private _idleReturnRotationOffsetYaw = 0;
  private _currentStrikeBoneName: string | null = null;
  private _currentAnimConfig: AnimConfig | null = null;

  // Some source clips are authored with left/right semantics inverted.
  // Apply deterministic correction here and keep manual mirror as an XOR override.
  private static readonly AUTO_MIRROR_KEYS = new Set<string>([
    'serveleft',
    'serve',
  ]);
  private static readonly AUTO_MIRROR_CLIP_FRAGMENTS = [
    'serveleftfoot',
  ];

  // Values derived from the F8 preview pose setup to keep gameplay clips
  // facing the table consistently.
  private static readonly FACING_COMPENSATION_DEG: Array<[string, number]> = [
    ['idle', 5],
    ['jogforward', 180],
    ['quickjogforward', 180],
    ['jogback', 180],
    ['jogbackward', 180],
    ['jogstrafeleft', 90],
    ['strafeleft', 90],
    ['jogstraferight', 0],
    ['straferight', 0],
    ['headkick', 0],
    ['header', 0],
    ['hearserve', 0],
    ['serveleftfoot', 60],
    ['serve', 0],
    ['chestkick', 180],
    ['chestreception', 180],
    ['jogforward001', 0],
    ['closetablelowheadkick', 180],
    ['closetablerightfootkick', 0],
    ['highkickleftfoot', 180],
    ['jumpheadkick', 180],
    ['solerightfootkick', 0],
    ['bicycle', 180],
    ['righttoefootreception', 5],
    ['rightkneereception', 90],
    ['knee1', 5],
    ['scissorkick', 180],
    ['scissor', 180],
  ];

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
    modelYawOffset = 0,
  ) {
    this.id       = id;
    this.mesh     = mesh;
    this.skeleton = skeleton;
    this.stats    = stats;
    this._yawOffset = modelYawOffset;
    this._baseScaleX = Math.abs(mesh.scaling.x) > 1e-4 ? Math.abs(mesh.scaling.x) : 1;

    const allChildren = this.mesh.getChildMeshes(false);
    const topLevelChildren = allChildren.filter((child) => {
      if (child.parent === this.mesh) return true;
      return !(child.parent instanceof AbstractMesh);
    });
    this._mirrorTargets = topLevelChildren.length > 0 ? topLevelChildren : [this.mesh];

    for (const target of this._mirrorTargets) {
      const base = Math.abs(target.scaling.x) > 1e-4 ? Math.abs(target.scaling.x) : 1;
      this._baseScaleByMeshId.set(target.uniqueId, base);
    }

    if (animationGroups && animationGroups.length > 0) {
      // Retarget all shadow-armature animation groups to the visible skeleton.
      // This is a no-op if there is only one skeleton (i.e. after a proper
      // single-armature re-export from Blender).
      if (skeleton && animationGroups.length > 1) {
        AnimationSystem.retargetToSkeleton(animationGroups, skeleton);
      }
      this._anim = new AnimationSystem(animationGroups);
      this._anim.play('idle', true, 1.0, this._getStartupTrimFrames('idle'));
      this._setFacingCompensationForKey('idle');
    }
  }

  private _getFacingCompensationForKey(key: PlayerAnimKey | string): number {
    const token = this._normalizeToken(String(key));
    for (const [fragment, deg] of Character.FACING_COMPENSATION_DEG) {
      if (token.includes(fragment)) {
        return (deg * Math.PI) / 180;
      }
    }
    return 0;
  }

  private _setFacingCompensationForKey(key: PlayerAnimKey | string): void {
    this._animationFacingCompensationYaw = this._getFacingCompensationForKey(key);
  }

  private _getStartupTrimFrames(clipKey: PlayerAnimKey | string): number {
    const animConfig = getAnimConfigForClip(String(clipKey));
    return Math.max(0, Math.round(animConfig?.startupTrimFrames ?? 0));
  }

  /**
   * Drive the animation state from the movement vector and kick flag.
   * Call this every frame (from the render loop).
   * @param moveX  horizontal input (-1 / 0 / +1)
   * @param moveZ  forward/back input (-1 / 0 / +1)
   * @param kick   true on the frame a kick is triggered
   * @param deltaTime seconds since last frame
   */
  setMovement(moveX: number, moveZ: number, kick: boolean, deltaTime: number, locomotionSpeed = 1.0): void {
    if (!this._anim) return;

    // Backward-compatible one-shot trigger
    if (kick && this._kickTimer <= 0) {
      this._kickTimer = 0.55;
      this._anim.playOnce('knee1', 'idle', 1.0, undefined, this._getStartupTrimFrames('knee1'));
      this._state = CharacterState.IDLE; // will resolve via callback
      return;
    }

    // Freeze locomotion updates while an action animation is running.
    if (this._kickTimer > 0) {
      this._kickTimer = Math.max(0, this._kickTimer - deltaTime);
      return;
    }

    const absX = Math.abs(moveX);
    const absZ = Math.abs(moveZ);
    let desired: PlayerAnimKey = 'idle';

    if (absX > 0.08 || absZ > 0.08) {
      const mostlyLateral = absX > absZ * 1.2;
      const mostlyLongitudinal = absZ > absX * 1.2;

      if (mostlyLateral) {
        // 43 (JogStrafeLeft) is ignored for gameplay; always use the right strafe set.
        desired = 'strafeRight';
      } else if (mostlyLongitudinal) {
        // Project convention: use backward clip for forward move and vice-versa.
        desired = moveZ >= 0 ? 'jogBack' : 'jogForward';
      } else if (moveZ >= 0) {
        desired = moveX >= 0 ? 'jogBackDiag2' : 'jogBackDiag1';
      } else {
        desired = moveX >= 0 ? 'jogFwdDiag2' : 'jogFwdDiag1';
      }
    }

    if (desired === 'idle') {
      if (this._state !== CharacterState.IDLE || this._locomotionAnim !== 'idle') {
        this._state = CharacterState.IDLE;
        this._locomotionAnim = 'idle';
        this._setFacingCompensationForKey('idle');
        this._anim.play('idle', true, 1.0, this._getStartupTrimFrames('idle'));
      }
      return;
    }

    // Some rigs only ship a subset of locomotion clips; prefer robust fallbacks.
    if (!this._anim.hasClip(desired)) {
      const isDiag = desired === 'jogFwdDiag1' || desired === 'jogFwdDiag2' || desired === 'jogBackDiag1' || desired === 'jogBackDiag2';
      if (isDiag && this._anim.hasClip('strafeRight')) {
        desired = 'strafeRight';
      } else if (isDiag && this._anim.hasClip(moveZ >= 0 ? 'jogBack' : 'jogForward')) {
        desired = moveZ >= 0 ? 'jogBack' : 'jogForward';
      } else if (desired === 'strafeLeft' && this._anim.hasClip('strafeRight')) {
        desired = 'strafeRight';
      } else if (this._anim.hasClip('jogForward')) {
        if (moveZ < 0) {
          desired = 'jogForward';
        } else {
          desired = this._anim.hasClip('jogBack') ? 'jogBack' : 'jogForward';
        }
      } else if (this._anim.hasClip('jogBack')) {
        desired = 'jogBack';
      }
    }

    this._state = CharacterState.MOVING;
    const clampedSpeed = Math.max(0.78, Math.min(1.40, locomotionSpeed));
    const startupTrim = this._getStartupTrimFrames(desired);
    if (this._locomotionAnim !== desired) {
      this._locomotionAnim = desired;
      this._setFacingCompensationForKey(desired);
      this._anim.play(desired, true, clampedSpeed, startupTrim);
      return;
    }

    // Keep current clip phase but continuously update playback speed.
    this._setFacingCompensationForKey(desired);
    this._anim.play(desired, true, clampedSpeed, startupTrim);
  }

  performAirAction(action: GameplayAction, ballPosition?: Vector3, mirrorX = false): boolean {
    if (!this._anim || this._kickTimer > 0) {
      return false;
    }

    let clipKey: PlayerAnimKey | string = 'header';
    let timer = 0.65;
    let strikeBone: 'head' | 'chest' | 'foot' = 'head';
    let autoMirrorByFoot = false;
    let forceMirror: boolean | null = null;

    switch (action) {
      case 'header':
      case 'kickHead':
        clipKey = 'header';
        timer = 0.65;
        strikeBone = 'head';
        forceMirror = false;
        break;
      case 'kickCloseHead':
        clipKey = 'closeTableLowHeader';
        timer = 0.68;
        strikeBone = 'head';
        forceMirror = false;
        break;
      case 'kickJumpHead':
        clipKey = 'jumpingHeaderKick';
        timer = 0.78;
        strikeBone = 'head';
        forceMirror = false;
        break;
      case 'chest':
      case 'kickChest':
        clipKey = 'chestKick';
        timer = 0.58;
        strikeBone = 'chest';
        break;
      case 'receptionChest':
      case 'prepChest':
        clipKey = 'chestReception';
        timer = 0.56;
        strikeBone = 'chest';
        break;
      case 'knee':
        clipKey = 'knee1';
        timer = 0.55;
        strikeBone = 'foot';
        autoMirrorByFoot = true;
        break;
      case 'receptionToe':
        clipKey = 'toeReceptionRight';
        timer = 0.52;
        autoMirrorByFoot = true;
        break;
      case 'receptionInnerRight':
      case 'prepInnerRight':
        clipKey = 'bridgeReception1Left';
        timer = 0.54;
        strikeBone = 'foot';
        autoMirrorByFoot = true;
        break;
      case 'kickCloseRightFoot':
        clipKey = 'closeTableKickRight';
        timer = 0.66;
        strikeBone = 'foot';
        autoMirrorByFoot = true;
        break;
      case 'kickSoleRight':
        clipKey = 'soleKickRight';
        timer = 0.70;
        strikeBone = 'foot';
        autoMirrorByFoot = true;
        break;
      case 'kickHighLeft':
        clipKey = 'highKickLeft';
        timer = 0.74;
        strikeBone = 'foot';
        autoMirrorByFoot = true;
        break;
      case 'kickBicycleLeft':
        clipKey = 'bicycleKickLeft';
        timer = 0.82;
        strikeBone = 'foot';
        autoMirrorByFoot = true;
        break;
      case 'scissor':
      default:
        clipKey = 'scissorKick';
        strikeBone = 'foot';
        autoMirrorByFoot = true;
        break;
    }

    const animConfig = getAnimConfigForClip(String(clipKey));

    this._kickTimer = timer;
    this._currentStrikeBone = strikeBone;
    this._currentStrikeBoneName = animConfig?.activeBone?.trim() ? animConfig.activeBone : null;
    this._currentAnimConfig = animConfig;
    this._idleReturnRotationOffsetYaw = ((animConfig?.idleReturnRotY ?? 0) * Math.PI) / 180;

    let shouldMirror = mirrorX;
    if (animConfig && !animConfig.mirrorSafe) {
      autoMirrorByFoot = false;
      shouldMirror = false;
    }
    if (autoMirrorByFoot) {
      const isLeftFootCloser = ballPosition ? this._isLeftFootCloser(ballPosition) : false;
      this._activeFootSide = isLeftFootCloser ? 'left' : 'right';
      shouldMirror = mirrorX || isLeftFootCloser;
    } else {
      this._activeFootSide = 'center';
      if (forceMirror !== null) {
        shouldMirror = forceMirror;
      }
    }

    const preRotationYaw = ((animConfig?.preRotationY ?? 0) * Math.PI) / 180;
    if (Math.abs(preRotationYaw) > 1e-5) {
      this.mesh.rotation.y += preRotationYaw;
      this._lastFacingAngle = this.mesh.rotation.y - this._yawOffset;
      this.mesh.computeWorldMatrix(true);
    }

    this._setMirrorX(shouldMirror);
    this._setFacingCompensationForKey(clipKey);
    this._captureFacingYaw();
    const startupTrim = this._getStartupTrimFrames(clipKey);
    this._anim.playOnce(clipKey, 'idle', 1.0, () => this._restoreFacingYaw(), startupTrim);
    return true;
  }

  private _setMirrorX(enabled: boolean): void {
    this._mirrorX = enabled;
    const sign = enabled ? -1 : 1;

    for (const target of this._mirrorTargets) {
      const base = this._baseScaleByMeshId.get(target.uniqueId) ?? (Math.abs(target.scaling.x) > 1e-4 ? Math.abs(target.scaling.x) : 1);
      target.scaling.x = base * sign;
    }

    this.mesh.computeWorldMatrix(true);
  }

  private _normalizeToken(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private _needsAutoMirrorByKey(key: PlayerAnimKey | string): boolean {
    const token = this._normalizeToken(String(key));
    return Character.AUTO_MIRROR_KEYS.has(token);
  }

  private _needsAutoMirrorByClipIndex(index: number): boolean {
    const clips = this._anim?.getClipNames() ?? [];
    if (index < 0 || index >= clips.length) return false;
    const clipToken = this._normalizeToken(clips[index]);
    return Character.AUTO_MIRROR_CLIP_FRAGMENTS.some(fragment => clipToken.includes(fragment));
  }

  private _restoreFacingYaw(): void {
    const restoreYaw = (this._capturedFacingYaw ?? this.mesh.rotation.y) + this._idleReturnRotationOffsetYaw;
    this.mesh.rotation.y = restoreYaw;
    this._lastFacingAngle = restoreYaw - this._yawOffset;
    this._idleReturnRotationOffsetYaw = 0;
    this.mesh.computeWorldMatrix(true);
  }

  private _captureFacingYaw(): void {
    this._capturedFacingYaw = this.mesh.rotation.y;
  }

  /** Determine if left foot is closer to ball than right foot */
  private _isLeftFootCloser(ballPosition: Vector3): boolean {
    if (!this.skeleton) {
      // Default: check ball position relative to player, negative X = left
      const toBall = ballPosition.subtract(this.mesh.position);
      return toBall.x < 0;
    }

    // Try to find left and right foot bones
    const leftFoot = this.skeleton.bones.find(b => 
      b.name.toLowerCase().includes('leftfoot') || b.name.toLowerCase().includes('left_foot')
    );
    const rightFoot = this.skeleton.bones.find(b => 
      b.name.toLowerCase().includes('rightfoot') || b.name.toLowerCase().includes('right_foot')
    );

    if (!leftFoot || !rightFoot) {
      // Fallback heuristic: negative X is left
      const toBall = ballPosition.subtract(this.mesh.position);
      return toBall.x < 0;
    }

    const leftFootPos = leftFoot.getAbsolutePosition(this.mesh);
    const rightFootPos = rightFoot.getAbsolutePosition(this.mesh);
    const distToLeftFoot = Vector3.Distance(leftFootPos, ballPosition);
    const distToRightFoot = Vector3.Distance(rightFootPos, ballPosition);

    return distToLeftFoot < distToRightFoot;
  }

  /** Rotate player to face a target position smoothly */
  rotateToBall(ballPosition: Vector3, deltaTime: number, turnSpeed = 8.5): void {
    if (!this.mesh) return;

    const toBall = ballPosition.subtract(this.mesh.position);
    const flatToBall = new Vector3(toBall.x, 0, toBall.z);
    
    if (flatToBall.length() < 0.01) return;

    const targetAngle = Math.atan2(flatToBall.x, flatToBall.z);
    let angleDiff = targetAngle - this._lastFacingAngle;

    // Normalize to [-PI, PI]
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

    // Smooth turn with capped angular velocity
    const maxTurn = turnSpeed * deltaTime;
    const actualTurn = Math.max(-maxTurn, Math.min(maxTurn, angleDiff));
    this._lastFacingAngle += actualTurn;

    this.mesh.rotation.y = this._lastFacingAngle + this._yawOffset;
  }

  /** Get the world position of the strike bone (head for header, foot for kicks) */
  getStrikeBonePosition(): Vector3 {
    if (!this.skeleton || !this._currentStrikeBone) return this.mesh.position;

    const hasAll = (name: string, parts: string[]): boolean => parts.every(p => name.includes(p));
    const names = this.skeleton.bones.map(b => ({
      bone: b,
      key: b.name.toLowerCase().replace(/[._\s-]/g, ''),
    }));

    if (this._currentStrikeBoneName) {
      const target = this._currentStrikeBoneName.toLowerCase().replace(/[._\s-]/g, '');
      const exact =
        names.find(n => n.key === target) ??
        names.find(n => n.key.includes(target)) ??
        names.find(n => target.includes(n.key));
      if (exact) {
        return exact.bone.getAbsolutePosition(this.mesh);
      }
    }

    let bone = null as Skeleton['bones'][number] | null;
    if (this._currentStrikeBone === 'head') {
      const hit = names.find(n => hasAll(n.key, ['head'])) ?? names.find(n => hasAll(n.key, ['neck']));
      bone = hit?.bone ?? null;
    } else if (this._currentStrikeBone === 'chest') {
      const hit =
        names.find(n => hasAll(n.key, ['chest'])) ??
        names.find(n => hasAll(n.key, ['sternum'])) ??
        names.find(n => hasAll(n.key, ['spine'])) ??
        names.find(n => hasAll(n.key, ['hips'])) ??
        names.find(n => hasAll(n.key, ['torso']));
      bone = hit?.bone ?? null;
    } else {
      const side = this._activeFootSide;
      const primary = side === 'left' ? ['left', 'foot'] : ['right', 'foot'];
      const fallback = side === 'left' ? ['left', 'toe'] : ['right', 'toe'];
      const hit =
        names.find(n => hasAll(n.key, primary)) ??
        names.find(n => hasAll(n.key, fallback)) ??
        names.find(n => hasAll(n.key, ['foot']));
      bone = hit?.bone ?? null;
    }

    if (!bone) {
      // Fallback: use bone at position 10 or higher (usually foot bones)
      if (this._currentStrikeBone === 'foot' && this.skeleton.bones.length > 10) {
        return this.skeleton.bones[this.skeleton.bones.length - 3].getAbsolutePosition(this.mesh);
      }
      if (this._currentStrikeBone === 'chest' && this.skeleton.bones.length > 4) {
        return this.skeleton.bones[Math.min(this.skeleton.bones.length - 4, 4)].getAbsolutePosition(this.mesh);
      }
      return this.mesh.position;
    }

    return bone.getAbsolutePosition(this.mesh);
  }

  /** Check if currently in active strike window */
  isInStrike(): boolean {
    return this._kickTimer > 0 && this._currentStrikeBone !== null;
  }

  /** Get the current strike bone name (for debugging) */
  getActiveStrikeBone(): string | null {
    return this._currentStrikeBone;
  }

  getCurrentAnimConfig(): AnimConfig | null {
    return this._currentAnimConfig;
  }

  /** Force a specific animation by key (for scripted sequences). */
  playAnimation(key: PlayerAnimKey | string, loop = true, mirrorX = false, onEnd?: () => void): void {
    const effectiveMirror = mirrorX !== this._needsAutoMirrorByKey(key);
    this._setMirrorX(effectiveMirror);
    this._setFacingCompensationForKey(key);
    const animConfig = getAnimConfigForClip(String(key));
    const startupTrim = Math.max(0, Math.round(animConfig?.startupTrimFrames ?? 0));
    if (loop) {
        this._anim?.play(key, true, 1.0, startupTrim);
      return;
    }

    this._captureFacingYaw();
    this._anim?.playOnce(key, 'idle', 1.0, onEnd ?? (() => this._restoreFacingYaw()), startupTrim);
  }

  getAnimationClipNames(): string[] {
    return this._anim?.getClipNames() ?? [];
  }

  getMirrorFacingCompensationYaw(): number {
    return this._mirrorX ? Math.PI : 0;
  }

  getAnimationFacingCompensationYaw(): number {
    return this._animationFacingCompensationYaw;
  }

  getHeadControlPosition(): Vector3 {
    if (!this.skeleton) {
      return this.mesh.position.add(new Vector3(0, 1.7, 0));
    }

    const names = this.skeleton.bones.map(b => ({
      bone: b,
      key: b.name.toLowerCase().replace(/[._\s-]/g, ''),
    }));

    const hit =
      names.find(n => n.key.includes('headcontroller')) ??
      names.find(n => n.key.includes('headctrl')) ??
      names.find(n => n.key.includes('headcontrol')) ??
      names.find(n => n.key.includes('head')) ??
      names.find(n => n.key.includes('neck'));

    if (!hit) {
      return this.mesh.position.add(new Vector3(0, 1.7, 0));
    }
    return hit.bone.getAbsolutePosition(this.mesh);
  }

  playAnimationClipByIndex(index: number, loop = false, mirrorX = false, speedRatio = 1.0, onEnd?: () => void): void {
    const effectiveMirror = mirrorX !== this._needsAutoMirrorByClipIndex(index);
    this._setMirrorX(effectiveMirror);
    const clipName = this._anim?.getClipNames()?.[index];
    if (clipName) {
      this._setFacingCompensationForKey(clipName);
    }
    if (loop) {
      this._anim?.playByIndex(index, true, speedRatio);
      return;
    }
    this._anim?.playByIndexOnce(index, 'idle', speedRatio, onEnd);
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
      if (this._kickTimer <= 0 && this._mirrorX) {
        this._setMirrorX(false);
      }
      if (this._kickTimer <= 0) {
        this._currentStrikeBoneName = null;
        this._currentAnimConfig = null;
      }
    }
  }

  dispose(): void {
    this._anim?.dispose();
  }
}
