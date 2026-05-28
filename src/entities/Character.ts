import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { ICharacter, CharacterState, GameAction, CharacterStats } from '@core/interfaces';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Skeleton } from '@babylonjs/core/Bones/skeleton';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { AnimationSystem, CharacterAnimData, PlayerAnimKey } from '../animation/AnimationSystem';
import { ANIM_CONFIG_FPS, AnimConfig, getAnimConfigForClip } from '../data/animationConfig';

export { CharacterState };

type GameplayAction =
  | 'header' | 'chest' | 'knee' | 'scissor' // legacy aliases
  | 'receptionChest' | 'receptionToe' | 'receptionInnerRight'
  | 'prepChest' | 'prepInnerRight'
  | 'kickCloseHead' | 'kickCloseRightFoot' | 'kickHead'
  | 'kickHighLeft' | 'kickJumpHead' | 'kickSoleRight' | 'kickBicycleLeft' | 'kickChest'
  | 'leftHeadKick' | 'rightHeadKick' | 'centerHeadKick';

type ActionDefinition = {
  clipKey: PlayerAnimKey  ;
  timer: number;
  strikeBone: 'head' | 'chest' | 'foot';
  autoMirrorByFoot: boolean;
  forceMirror: boolean | null;
};

/**
 * Character/Player entity — wraps the root mesh, skeleton and animation system.
 * Animation is driven externally by calling setMovement() each frame.
 */
export class Character implements ICharacter {
  private static readonly ACTION_ANIM_SPEED_RATIO = 1.35;
  private static readonly ACTION_LOCK_FOLLOW_THROUGH_FRAMES = 8;

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
  private _currentActionKey: string | null = null;
  private readonly _socketGroundDistanceByAction = new Map<string, number>();
  private _strikeBoneContactLocalPosition: Vector3 | null = null;

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
    ['serverightfoot', 60],
    ['serve', 0],
    ['chestkick', 180],
    ['chestreception', 180],
    ['chestprepleft', 180],
    ['chestprepright', 180],
    ['jogforward001', 0],
    ['closetablelowheadkick', 180],
    ['closetablerightfootkick', 0],
    ['highkickleftfoot', 180],
    ['leftfootkick', 180],
    ['jumpheadkick', 180],
    ['solerightfootkick', 0],
    ['bicycle', 180],
    ['righttoefootreception', 5],
    ['rightkneereception', 0],
    ['leftkneereception', 0],
    ['innerleftfootreception', 0],
    ['innerrightfootreception', 0],
    ['bridgereceptionleftfoot', 0],
    ['bridgereceptionrightfoot', 0],
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
    animData?: CharacterAnimData,
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
      this._anim = new AnimationSystem(animationGroups, animData);
      this._anim.play('idle', true, 1.0, this._getStartupTrimFrames('idle'));
      this._setFacingCompensationForKey('idle');
    }
  }

  private _getFacingCompensationForKey(key: PlayerAnimKey  ): number {
    const token = this._normalizeToken(String(key));
    for (const [fragment, deg] of Character.FACING_COMPENSATION_DEG) {
      if (token.includes(fragment)) {
        return (deg * Math.PI) / 180;
      }
    }
    // Key token didn't match (e.g. 'jogFwdDiag1') — resolve to actual clip name and retry.
    const clipName = this._anim?.getClipNameForKey(String(key));
    if (clipName) {
      const clipToken = this._normalizeToken(clipName);
      for (const [fragment, deg] of Character.FACING_COMPENSATION_DEG) {
        if (clipToken.includes(fragment)) {
          return (deg * Math.PI) / 180;
        }
      }
    }
    return 0;
  }

  private _setFacingCompensationForKey(key: PlayerAnimKey  ): void {
    this._animationFacingCompensationYaw = this._getFacingCompensationForKey(key);
  }

  private _getStartupTrimFrames(clipKey: PlayerAnimKey  ): number {
    const animConfig = getAnimConfigForClip(String(clipKey));
    return Math.max(0, Math.round(animConfig?.startupTrimFrames ?? 3));
  }

  private _computeActionLockSeconds(animConfig: AnimConfig | null, fallbackSeconds: number, speedRatio: number): number {
    if (!animConfig) {
      return fallbackSeconds;
    }

    const clipLengthFrames = Math.max(1, Math.round(animConfig.clipLengthFrames ?? 1));
    const contactEndFrame = animConfig.contactWindow
      ? Math.max(animConfig.contactWindow[0], animConfig.contactWindow[1])
      : animConfig.contactFrame;
    const lockEndFrame = Math.min(
      clipLengthFrames,
      Math.max(animConfig.contactFrame, contactEndFrame) + Character.ACTION_LOCK_FOLLOW_THROUGH_FRAMES,
    );

    const fps = Math.max(1, ANIM_CONFIG_FPS);
    const clampedSpeedRatio = Math.max(0.1, speedRatio);
    const lockSeconds = lockEndFrame / fps / clampedSpeedRatio;
    return Math.max(fallbackSeconds, lockSeconds);
  }

  private _resolveActionDefinition(action: string): ActionDefinition | null {
    switch (action) {
      case 'header':
      case 'kickHead':
        return {
          clipKey: 'header',
          timer: 0.65,
          strikeBone: 'head',
          autoMirrorByFoot: false,
          forceMirror: false,
        };
      case 'kickCloseHead':
        return {
          clipKey: 'closeTableLowHeader',
          timer: 0.68,
          strikeBone: 'head',
          autoMirrorByFoot: false,
          forceMirror: false,
        };
      case 'kickJumpHead':
        return {
          clipKey: 'jumpingHeaderKick',
          timer: 0.78,
          strikeBone: 'head',
          autoMirrorByFoot: false,
          forceMirror: false,
        };
      case 'chest':
      case 'kickChest':
        return {
          clipKey: 'chestKick',
          timer: 0.58,
          strikeBone: 'chest',
          autoMirrorByFoot: false,
          forceMirror: null,
        };
      case 'receptionChest':
      case 'prepChest':
        return {
          clipKey: 'chestReception',
          timer: 0.56,
          strikeBone: 'chest',
          autoMirrorByFoot: false,
          forceMirror: null,
        };
      case 'knee':
        return {
          clipKey: 'knee1',
          timer: 0.55,
          strikeBone: 'foot',
          autoMirrorByFoot: true,
          forceMirror: null,
        };
      case 'receptionToe':
        return {
          clipKey: 'toeReceptionRight',
          timer: 0.52,
          strikeBone: 'foot',
          autoMirrorByFoot: true,
          forceMirror: null,
        };
      case 'receptionInnerRight':
      case 'prepInnerRight':
        return {
          clipKey: 'bridgeReception1Left',
          timer: 0.54,
          strikeBone: 'foot',
          autoMirrorByFoot: true,
          forceMirror: null,
        };
      case 'kickCloseRightFoot':
        return {
          clipKey: 'closeTableKickRight',
          timer: 0.66,
          strikeBone: 'foot',
          autoMirrorByFoot: true,
          forceMirror: null,
        };
      case 'kickSoleRight':
        return {
          clipKey: 'soleKickRight',
          timer: 0.70,
          strikeBone: 'foot',
          autoMirrorByFoot: true,
          forceMirror: null,
        };
      case 'kickHighLeft':
        return {
          clipKey: 'highKickLeft',
          timer: 0.74,
          strikeBone: 'foot',
          autoMirrorByFoot: true,
          forceMirror: null,
        };
      case 'kickBicycleLeft':
        return {
          clipKey: 'bicycleKickLeft',
          timer: 0.82,
          strikeBone: 'foot',
          autoMirrorByFoot: true,
          forceMirror: null,
        };
      case 'scissor':
        return {
          clipKey: 'scissorKick',
          timer: 0.65,
          strikeBone: 'foot',
          autoMirrorByFoot: true,
          forceMirror: null,
        };
      default:
        return null;
    }
  }

  private _sampleSocketGroundDistanceForAction(definition: ActionDefinition): number | null {
    if (!this._anim) return null;

    const animConfig = getAnimConfigForClip(String(definition.clipKey));
    if (!animConfig) return null;

    const clip = this._anim.getClipByKey(definition.clipKey);
    if (!clip) return null;

    const startupTrim = this._getStartupTrimFrames(definition.clipKey);
    const contactFrame = Math.max(0, Math.round(animConfig.contactFrame ?? 0));
    const sampleFrame = Math.max(clip.from, Math.min(clip.to, clip.from + startupTrim + contactFrame));

    const prevStrikeBone = this._currentStrikeBone;
    const prevStrikeBoneName = this._currentStrikeBoneName;

    this._anim.stop();
    clip.start(false, 1.0, clip.from, clip.to, false);
    clip.goToFrame(sampleFrame);
    clip.pause();

    // goToFrame sets bone TRS properties but _absoluteMatrix is stale until
    // computeAbsoluteTransforms is called — without this, getAbsolutePosition
    // returns the idle pose instead of the sought contact frame.
    this.skeleton?.computeAbsoluteMatrices();
    this._currentStrikeBone = definition.strikeBone;
    this._currentStrikeBoneName = animConfig.activeBone?.trim() ? animConfig.activeBone : null;
    this.mesh.computeWorldMatrix(true);
    const socketPos = this.getStrikeBonePosition();

    this._currentStrikeBone = prevStrikeBone;
    this._currentStrikeBoneName = prevStrikeBoneName;
    clip.stop();
    this._anim.play('idle', true, 1.0, this._getStartupTrimFrames('idle'));

    if (!Number.isFinite(socketPos.y)) return null;
    // Court floor top plane is y = 0; distance is socket height above floor.
    return Math.max(0, socketPos.y);
  }

  private _sampleStrikeBoneLocalPositionForAction(definition: ActionDefinition): Vector3 | null {
    if (!this._anim) return null;

    const animConfig = getAnimConfigForClip(String(definition.clipKey));
    if (!animConfig) return null;

    const clip = this._anim.getClipByKey(definition.clipKey);
    if (!clip) return null;

    const startupTrim = this._getStartupTrimFrames(definition.clipKey);
    const contactFrame = Math.max(0, Math.round(animConfig.contactFrame ?? 0));
    const sampleFrame = Math.max(clip.from, Math.min(clip.to, clip.from + startupTrim + contactFrame));

    const prevStrikeBone = this._currentStrikeBone;
    const prevStrikeBoneName = this._currentStrikeBoneName;

    this._anim.stop();
    clip.start(false, 1.0, clip.from, clip.to, false);
    clip.goToFrame(sampleFrame);
    clip.pause();

    // Same reason as in _sampleGroundDistanceForAction: cascade TRS → _absoluteMatrix.
    this.skeleton?.computeAbsoluteMatrices();
    this._currentStrikeBone = definition.strikeBone;
    this._currentStrikeBoneName = animConfig.activeBone?.trim() ? animConfig.activeBone : null;
    this.mesh.computeWorldMatrix(true);
    const strikeWorld = this._getStrikeBonePositionRaw();
    const localPos = Vector3.TransformCoordinates(strikeWorld, this.mesh.getWorldMatrix().clone().invert());

    this._currentStrikeBone = prevStrikeBone;
    this._currentStrikeBoneName = prevStrikeBoneName;
    clip.stop();
    this._anim.play('idle', true, 1.0, this._getStartupTrimFrames('idle'));

    if (!Number.isFinite(localPos.x) || !Number.isFinite(localPos.y) || !Number.isFinite(localPos.z)) {
      return null;
    }
    return localPos;
  }

  private _getStrikeBonePositionRaw(): Vector3 {
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
      const hit =
        names.find(n => hasAll(n.key, ['headsocket'])) ??
        names.find(n => hasAll(n.key, ['headcontroller'])) ??
        names.find(n => hasAll(n.key, ['headctrl'])) ??
        names.find(n => hasAll(n.key, ['headcontrol'])) ??
        names.find(n => hasAll(n.key, ['head'])) ??
        names.find(n => hasAll(n.key, ['neck']));
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

  precomputeActionSocketGroundDistances(actions: Array<string>): void {
    for (const action of actions) {
      const key = String(action);
      if (this._socketGroundDistanceByAction.has(key)) continue;

      const definition = this._resolveActionDefinition(action);
      if (!definition) continue;

      const distance = this._sampleSocketGroundDistanceForAction(definition);
      if (distance === null) continue;

      this._socketGroundDistanceByAction.set(key, distance);
    }
  }

  getActionSocketGroundDistanceAtContact(action: string): number | null {
    const key = String(action);
    const cached = this._socketGroundDistanceByAction.get(key);
    if (cached !== undefined) return cached;

    if (this._kickTimer > 0) {
      return null;
    }

    const definition = this._resolveActionDefinition(action);
    if (!definition) return null;

    const sampled = this._sampleSocketGroundDistanceForAction(definition);
    if (sampled === null) return null;
    this._socketGroundDistanceByAction.set(key, sampled);
    return sampled;
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
      const kickSpeedRatio = Character.ACTION_ANIM_SPEED_RATIO;
      const kickAnimConfig = getAnimConfigForClip('knee1');
      this._kickTimer = this._computeActionLockSeconds(kickAnimConfig, 0.55, kickSpeedRatio);
      this._anim.playOnce(
        'knee1',
        'idle',
        kickSpeedRatio,
        undefined,
        this._getStartupTrimFrames('knee1'),
        this._getStartupTrimFrames('idle'),
      );
      this._state = CharacterState.IDLE; // will resolve via callback
      return;
    }

    // Freeze locomotion updates while an action animation is running.
    if (this._kickTimer > 0) {
      this._kickTimer = Math.max(0, this._kickTimer - deltaTime);
      if (this._kickTimer <= 0) {
        this._currentStrikeBoneName = null;
        this._currentAnimConfig = null;
        this._activeFootSide = 'center';
        this._currentActionKey = null;
      }
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
      // Safety: one-shot clips can set mirrored playback for a strike side.
      // Idle should always return to neutral non-mirrored facing.
      if (this._mirrorX) {
        this._setMirrorX(false);
      }

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
    const clampedSpeed = Math.max(0.82, Math.min(1.65, locomotionSpeed));
    const startupTrim = this._getStartupTrimFrames(desired);
    // Locomotion clips must never rotate the player away from their gameplay
    // facing direction (getCourtCenterFacing). Zero the compensation so that
    // root.rotation.y = motion.facing + PLAYER_MODEL_YAW_OFFSET always.
    this._animationFacingCompensationYaw = 0;
    if (this._locomotionAnim !== desired) {
      this._locomotionAnim = desired;
      this._anim.play(desired, true, clampedSpeed, startupTrim);
      return;
    }

    // Keep current clip phase but continuously update playback speed.
    this._anim.play(desired, true, clampedSpeed, startupTrim);
  }

  performAirAction(action: GameplayAction, ballPosition?: Vector3, mirrorX = false, speedRatio?: number): boolean {
    if (!this._anim || this._kickTimer > 0) {
      return false;
    }

    const definition = this._resolveActionDefinition(action);
    if (!definition) {
      return false;
    }

    const { clipKey, timer, strikeBone } = definition;
    let autoMirrorByFoot = definition.autoMirrorByFoot;
    const forceMirror = definition.forceMirror;

    const animConfig = getAnimConfigForClip(String(clipKey));

    // Foot kicks have later contact frames, so boost animation speed for snappier response.
    let actionSpeedRatio = speedRatio ?? Character.ACTION_ANIM_SPEED_RATIO;
    if (String(clipKey).toLowerCase().includes('scissor')) {
      actionSpeedRatio *= 1.15;
    }
    this._kickTimer = this._computeActionLockSeconds(animConfig, timer, actionSpeedRatio);
    this._currentActionKey = action;
    this._currentStrikeBone = strikeBone;
    this._currentStrikeBoneName = animConfig?.activeBone?.trim() ? animConfig.activeBone : null;
    this._currentAnimConfig = animConfig;
    this._idleReturnRotationOffsetYaw = ((animConfig?.idleReturnRotY ?? 0) * Math.PI) / 180;

    if (animConfig && !animConfig.mirrorSafe) {
      autoMirrorByFoot = false;
    }

    // Determine whether to mirror the animation to match the geometrically
    // closer foot socket.  Only enabled when the clip is mirrorSafe so it can
    // tolerate an X-flip without tearing the rig.
    let shouldMirror = false;
    if (autoMirrorByFoot && animConfig?.mirrorSafe) {
      const isLeftFootCloser = ballPosition ? this._isLeftFootCloser(ballPosition) : false;
      this._activeFootSide = isLeftFootCloser ? 'left' : 'right';

      // activeBone tells us which socket kicks in the non-mirrored version.
      // Mirror when the geometrically closer socket doesn't match the default.
      const activeBoneLower = (animConfig.activeBone ?? '').toLowerCase();
      const defaultIsRight = activeBoneLower.includes('right');
      const defaultIsLeft  = !defaultIsRight && activeBoneLower.includes('left');
      if (defaultIsRight && isLeftFootCloser) shouldMirror = true;
      if (defaultIsLeft  && !isLeftFootCloser) shouldMirror = true;
    } else {
      this._activeFootSide = 'center';
    }

    // Preserve external gameplay facing (table-facing) before clip-specific
    // pre-rotation/mirroring tweaks so we can restore it immediately on end.
    this._captureFacingYaw();

    const preRotationYaw = ((animConfig?.preRotationY ?? 0) * Math.PI) / 180;
    if (Math.abs(preRotationYaw) > 1e-5) {
      this.mesh.rotation.y += preRotationYaw;
      this._lastFacingAngle = this.mesh.rotation.y - this._yawOffset;
      this.mesh.computeWorldMatrix(true);
    }

    this._setMirrorX(shouldMirror);
    this._setFacingCompensationForKey(clipKey);
    this._strikeBoneContactLocalPosition = this._sampleStrikeBoneLocalPositionForAction(definition);
    const startupTrim = this._getStartupTrimFrames(clipKey);
    this._anim.playOnce(
      clipKey,
      'idle',
      actionSpeedRatio,
      () => {
        this._restoreFacingYaw();
        this._setMirrorX(false);
        this._setFacingCompensationForKey('idle');
        this._capturedFacingYaw = null;
      },
      startupTrim,
      this._getStartupTrimFrames('idle'),
    );
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

  private _needsAutoMirrorByKey(key: PlayerAnimKey  ): boolean {
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
    if (this._strikeBoneContactLocalPosition) {
      return Vector3.TransformCoordinates(this._strikeBoneContactLocalPosition, this.mesh.getWorldMatrix());
    }

    return this._getStrikeBonePositionRaw();
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
  playAnimation(key: PlayerAnimKey  , loop = true, mirrorX = false, onEnd?: () => void): boolean {
    if (!this._anim || !this._anim.hasClip(key)) {
      return false;
    }

    this._setMirrorX(false);
    this._setFacingCompensationForKey(key);
    const startupTrim = this._getStartupTrimFrames(key);
    if (loop) {
      this._anim?.play(key, true, 1.0, startupTrim);
      return true;
    }

    this._captureFacingYaw();
    this._anim?.playOnce(
      key,
      'idle',
      1.0,
      () => {
        this._restoreFacingYaw();
        onEnd?.();
      },
      startupTrim,
      this._getStartupTrimFrames('idle'),
    );
    return true;
  }

  getAnimationClipNames(): string[] {
    return this._anim?.getClipNames() ?? [];
  }

  getMirrorFacingCompensationYaw(): number {
    // mirrorSafe clips are authored in their final court-facing orientation.
    // An X-flip mirrors the leg side without needing a yaw compensation.
    if (this._currentAnimConfig?.mirrorSafe) {
      return 0;
    }
    // Keep legacy/global behavior for all animations so serve and other clips
    // preserve their authored facing. Only suppress mirror-yaw for inner-foot
    // reception variants, which otherwise turn side/back.
    const isInnerFootReception =
      this._currentActionKey === 'receptionInnerRight' ||
      this._currentActionKey === 'prepInnerRight';
    if (isInnerFootReception) {
      return 0;
    }
    return this._mirrorX ? Math.PI : 0;
  }

  getAnimationFacingCompensationYaw(): number {
    // The model's gameplay facing (getCourtCenterFacing) already points the
    // character toward the table center at all times.  Applying per-clip
    // facing compensation on top of that causes animations to spin the
    // player away from the table.  Always return 0 so the root rotation is
    // solely driven by motion.facing + PLAYER_MODEL_YAW_OFFSET.
    return 0;
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
      names.find(n => n.key.includes('headsocket')) ??
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

  getHandControlPosition(hand: 'left' | 'right'): Vector3 {
    const side = hand === 'right' ? 'right' : 'left';
    const fallbackLocal = new Vector3(hand === 'right' ? 0.22 : -0.22, 1.28, 0.16);
    if (!this.skeleton) {
      return Vector3.TransformCoordinates(fallbackLocal, this.mesh.getWorldMatrix());
    }

    const names = this.skeleton.bones.map(b => ({
      bone: b,
      key: b.name.toLowerCase().replace(/[._\s-]/g, ''),
    }));

    const hit =
      names.find(n => n.key.includes(`${side}hand`)) ??
      names.find(n => n.key.includes(`${side}wrist`)) ??
      names.find(n => n.key.includes(`${side}palm`)) ??
      names.find(n => n.key.includes(side) && n.key.includes('forearm'));

    if (!hit) {
      return Vector3.TransformCoordinates(fallbackLocal, this.mesh.getWorldMatrix());
    }
    return hit.bone.getAbsolutePosition(this.mesh);
  }

  /** Returns the world position of the left or right foot bone (for foot-serve contact anchoring). */
  getFootControlPosition(side: 'left' | 'right'): Vector3 {
    const fallbackLocal = new Vector3(side === 'right' ? 0.12 : -0.12, 0.08, 0.10);
    if (!this.skeleton) {
      return Vector3.TransformCoordinates(fallbackLocal, this.mesh.getWorldMatrix());
    }

    const names = this.skeleton.bones.map(b => ({
      bone: b,
      key: b.name.toLowerCase().replace(/[._\s-]/g, ''),
    }));

    const hasAll = (name: string, parts: string[]): boolean => parts.every(p => name.includes(p));
    const hit =
      names.find(n => hasAll(n.key, [`${side}foot`])) ??
      names.find(n => hasAll(n.key, [`${side}`, 'foot'])) ??
      names.find(n => hasAll(n.key, [`${side}`, 'toe'])) ??
      names.find(n => n.key.includes('foot'));

    if (!hit) {
      return Vector3.TransformCoordinates(fallbackLocal, this.mesh.getWorldMatrix());
    }
    return hit.bone.getAbsolutePosition(this.mesh);
  }

  playAnimationClipByIndex(index: number, loop = false, mirrorX = false, speedRatio = 1.0, onEnd?: () => void): void {
    this._setMirrorX(false);
    const clipName = this._anim?.getClipNames()?.[index];
    if (clipName) {
      this._setFacingCompensationForKey(clipName);
    }
    const startupTrim = this._getStartupTrimFrames(clipName ?? 'idle');
    if (loop) {
      this._anim?.playByIndex(index, true, speedRatio, startupTrim);
      return;
    }
    this._anim?.playByIndexOnce(index, 'idle', speedRatio, onEnd, startupTrim, this._getStartupTrimFrames('idle'));
  }

  getCurrentAnimation(): string {
    return String(this._anim?.activeIndex ?? -1);
  }

  /** Current frame of the active animation group, in clip-native units (null if idle). */
  getActiveAnimationFrame(): number | null {
    return this._anim?.getActiveMasterFrame() ?? null;
  }

  /** Active clip's `from` frame, or null if no clip is playing. */
  getActiveAnimationFrom(): number | null {
    return this._anim?.getActiveClipFrom() ?? null;
  }

  /**
   * Seeks the active animation to `absoluteFrame`, reads the hand bone
   * world-position, then restores to `restoreFrame`.
   * Used to snapshot the exact hand position at the first serve-animation frame
   * so the ballistic toss arc starts from the correct pose (not idle).
   */
  sampleHandPositionAtFrame(
    absoluteFrame: number,
    restoreFrame: number,
    hand: 'left' | 'right',
  ): Vector3 | null {
    const group = this._anim?.getActiveGroup();
    if (!group) return null;
    group.goToFrame(absoluteFrame);
    this.mesh.computeWorldMatrix(true);
    const result = this.getHandControlPosition(hand).clone();
    group.goToFrame(restoreFrame);
    this.mesh.computeWorldMatrix(true);
    return result;
  }

  /**
   * Temporarily seeks the active animation to `absoluteFrame`, reads the
   * foot or head bone world-position, then restores to `restoreFrame`.
   * Used by the serve system to sample where the strike bone will be at the
   * contact frame so a ballistic arc can be pre-computed.
   * Returns null if no animation is currently active.
   */
  sampleServeBoneAtFrame(
    absoluteFrame: number,
    restoreFrame: number,
    isFootServe: boolean,
    foot: 'left' | 'right',
  ): Vector3 | null {
    const group = this._anim?.getActiveGroup();
    if (!group) return null;

    group.goToFrame(absoluteFrame);
    this.mesh.computeWorldMatrix(true);
    const sampled = isFootServe
      ? this.getFootControlPosition(foot)
      : this.getHeadControlPosition();
    const result = sampled ? sampled.clone() : null;

    group.goToFrame(restoreFrame);
    this.mesh.computeWorldMatrix(true);
    return result;
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
        this._currentActionKey = null;
      }
    }
  }

  clearStrikeBoneContactSnapshot(): void {
    this._strikeBoneContactLocalPosition = null;
  }

  dispose(): void {
    this._anim?.dispose();
  }
}
