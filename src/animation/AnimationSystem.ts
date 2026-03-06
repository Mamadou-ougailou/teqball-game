import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';

// -----------------------------------------------------------------------
// Animation index map — each number references one of the 18 AnimationGroups
// that Blender baked from the Mixamo FBX imports into character_master.glb.
//
// The order in the GLB matches the Blender scene order (Armature suffix).
// Adjust these numbers based on the console output that lists all clip names
// at load time (look for '[AnimationSystem] clip[N]: ...' lines).
// -----------------------------------------------------------------------
export const PLAYER_ANIM = {
  header:       0,   // Header.fbx
  headerBall1:  1,   // Header Soccerball (variant 1)
  headerBall2:  2,   // Header Soccerball (variant 2)
  jogBackDiag1: 3,   // Jog Backward Diagonal (variant 1)
  jogBackDiag2: 4,   // Jog Backward Diagonal (variant 2)
  jogBack:      5,   // Jog Backward
  jogFwdDiag1:  6,   // Jog Forward Diagonal (variant 1)
  jogFwdDiag2:  7,   // Jog Forward Diagonal (variant 2)
  jogForward:   8,   // Jog Forward
  strafeLeft:   9,   // Jog Strafe Left
  strafeRight:  10,  // Jog Strafe Right
  kick1:        11,  // Kick Soccerball (variant 1)
  kick2:        12,  // Kick Soccerball (variant 2)
  knee1:        13,  // Kneeing Soccerball (variant 1)
  knee2:        14,  // Kneeing Soccerball (variant 2)
  scissorKick:  15,  // Scissor Kick
  idle:         16,  // Transition (standing idle / root pose)
  extra:        17,  // extra / bind-pose clip
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
