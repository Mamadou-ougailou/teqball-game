import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';

// -----------------------------------------------------------------------
// Animation index map — each number references one of the 18 AnimationGroups
// that Blender baked from the Mixamo FBX imports into character_master.glb.
//
// The order in the GLB matches the Blender scene order (Armature suffix).
// Adjust these numbers based on the console output that lists all clip names
// at load time (look for '[AnimationSystem] clip[N]: ...' lines).
// -----------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Animation index map
//
// IMPORTANT: this GLB was exported from Blender with 18 separate Mixamo
// armatures (one per FBX clip).  Each animation group only drives the bones
// of its own armature.  The VISIBLE mesh is skinned to Armature index 0.
// Therefore only animation group 0 will visually animate the character;
// the other groups animate shadow armatures that are not bound to any mesh.
//
// Once the Blender file is re-exported with a single merged armature (NLA
// bake), update the indices below to match the new clip order.
// ---------------------------------------------------------------------------
export const PLAYER_ANIM = {
  // All currently point to group 0 (the only group that targets the
  // visible skinned mesh).  Tune these after a proper single-armature export.
  idle:         0,
  jogForward:   0,
  jogBack:      0,
  strafeLeft:   0,
  strafeRight:  0,
  kick2:        0,
  scissorKick:  0,
  header:       0,
  headerBall1:  0,
  headerBall2:  0,
  jogBackDiag1: 0,
  jogBackDiag2: 0,
  jogFwdDiag1:  0,
  jogFwdDiag2:  0,
  kick1:        0,
  knee1:        0,
  knee2:        0,
  extra:        0,
} as const;

export type PlayerAnimKey = keyof typeof PLAYER_ANIM;

/**
 * AnimationSystem — wraps a flat list of AnimationGroups loaded from a GLB
 * and provides a simple play-by-key API with instant-stop crossfade.
 */
export class AnimationSystem {
  private readonly _clips: AnimationGroup[];
  private _active: AnimationGroup | null = null;
  private _activeIndex = -1;

  constructor(groups: AnimationGroup[]) {
    this._clips = groups;
    // Stop every group (Babylon auto-starts the first one)
    groups.forEach((g, i) => {
      g.stop();
      console.log(`[AnimationSystem] clip[${i}]: "${g.name}"`);
    });
  }

  get activeIndex(): number { return this._activeIndex; }

  /**
   * Play animation by key (see PLAYER_ANIM) or by raw index.
   * If the same clip is already playing, does nothing.
   */
  play(keyOrIndex: PlayerAnimKey | number, loop = true, speedRatio = 1.0): void {
    const index = typeof keyOrIndex === 'number' ? keyOrIndex : PLAYER_ANIM[keyOrIndex];
    if (index < 0 || index >= this._clips.length) return;
    if (this._activeIndex === index) return;  // already running

    this._active?.stop();
    this._active      = this._clips[index];
    this._activeIndex = index;
    this._active.start(loop, speedRatio, this._active.from, this._active.to, false);
  }

  /** Play a one-shot animation, then automatically revert to a loop clip. */
  playOnce(keyOrIndex: PlayerAnimKey | number, thenPlay: PlayerAnimKey | number = 'idle'): void {
    const index = typeof keyOrIndex === 'number' ? keyOrIndex : PLAYER_ANIM[keyOrIndex];
    if (index < 0 || index >= this._clips.length) return;

    this._active?.stop();
    const clip = this._clips[index];
    this._active      = clip;
    this._activeIndex = index;

    clip.onAnimationGroupEndObservable.addOnce(() => {
      this.play(thenPlay);
    });
    clip.start(false, 1.0, clip.from, clip.to, false);
  }

  stop(): void {
    this._active?.stop();
    this._active      = null;
    this._activeIndex = -1;
  }

  update(_deltaTime: number): void {}

  dispose(): void {
    this.stop();
  }
}
