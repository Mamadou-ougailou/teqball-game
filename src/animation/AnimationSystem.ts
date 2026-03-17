import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { Skeleton } from '@babylonjs/core/Bones/skeleton';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';

// ---------------------------------------------------------------------------
// Animation clip name map
//
// Keys are logical action names used by Character.ts.
// Values are substrings of the AnimationGroup names that BabylonJS logs on
// load (check browser console for "[AnimationSystem] clip[N]: …" lines).
//
// These strings are matched case-insensitively against group.name so you
// don't need to type the exact Blender export name — a unique fragment works.
//
// Why not use indices?  The GLB was exported with 18 separate Mixamo armatures
// so the names are the only stable identifier.  retargetToSkeleton() below
// re-points every group's targets to skeleton 0 so all clips visually animate.
// ---------------------------------------------------------------------------
export const PLAYER_ANIM_NAMES: Record<string, string> = {
  idle:         'idle',
  jogForward:   'jog',        // update these fragments once you see the console names
  jogBack:      'jog back',
  strafeLeft:   'strafe left',
  strafeRight:  'strafe right',
  kick2:        'kick',
  scissorKick:  'scissor',
  header:       'header',
  headerBall1:  'header ball 1',
  headerBall2:  'header ball 2',
  jogBackDiag1: 'jog back diag 1',
  jogBackDiag2: 'jog back diag 2',
  jogFwdDiag1:  'jog forward diag 1',
  jogFwdDiag2:  'jog forward diag 2',
  kick1:        'kick 1',
  knee1:        'knee 1',
  knee2:        'knee 2',
  extra:        'extra',
};

// Kept for backwards compatibility — all resolve to -1 (name lookup) now.
export const PLAYER_ANIM = Object.fromEntries(
  Object.keys(PLAYER_ANIM_NAMES).map(k => [k, -1])
) as Record<string, number>;

export type PlayerAnimKey = keyof typeof PLAYER_ANIM_NAMES;

/**
 * AnimationSystem — wraps a flat list of AnimationGroups loaded from a GLB
 * and provides a simple play-by-key API with instant-stop crossfade.
 *
 * Call AnimationSystem.retargetToSkeleton(groups, skeleton) BEFORE constructing
 * this class when the GLB contains multiple armatures (Blender Mixamo export).
 * This rewires every group's targets so they all drive the visible skeleton.
 */
export class AnimationSystem {
  private readonly _clips: AnimationGroup[];
  private _active: AnimationGroup | null = null;
  private _activeIndex = -1;

  // ---------------------------------------------------------------------------
  // Static helper — retarget shadow-armature animation groups to skeleton 0.
  //
  // Blender exports 18 Mixamo armatures → 18 GLB skeletons.  The visible mesh
  // is only skinned to skeleton 0.  Skeletons 1-17 have the same bone names but
  // with Blender's ".001", ".002" … suffixes on their TransformNodes.
  //
  // We strip that suffix and look up the matching TransformNode in skeleton 0,
  // then replace the target on each TargetedAnimation.  After this call every
  // group in the array will animate skeleton 0, making all clips visible.
  // ---------------------------------------------------------------------------
  static retargetToSkeleton(groups: AnimationGroup[], skeleton: Skeleton): void {
    // Build name → TransformNode from the primary skeleton
    const nodeByName = new Map<string, TransformNode>();
    for (const bone of skeleton.bones) {
      const node: TransformNode | null = bone.getTransformNode?.() ??
        (bone as any)._linkedTransformNode ?? null;
      if (node) {
        nodeByName.set(node.name, node);
        // Also index without the Blender uniqueness suffix (.001, .002 …)
        const base = node.name.replace(/\.\d+$/, '');
        if (!nodeByName.has(base)) nodeByName.set(base, node);
      }
    }

    // Group 0 already targets skeleton 0 — skip it.
    for (let i = 1; i < groups.length; i++) {
      let remapped = 0;
      for (const ta of groups[i].targetedAnimations) {
        const rawName: string = (ta.target as any).name ?? '';
        const base = rawName.replace(/\.\d+$/, '');
        const mapped = nodeByName.get(rawName) ?? nodeByName.get(base);
        if (mapped) {
          ta.target = mapped;
          remapped++;
        }
      }
      console.log(`[AnimationSystem] retarget group[${i}] "${groups[i].name}": ${remapped} targets remapped`);
    }
  }

  constructor(groups: AnimationGroup[]) {
    this._clips = groups;
    // Stop every group (Babylon auto-starts the first one on load)
    groups.forEach((g, i) => {
      g.stop();
      console.log(`[AnimationSystem] clip[${i}]: "${g.name}"`);
    });
  }

  /** Resolve a key string to a clip index by substring-matching the group name. */
  private _resolve(keyOrIndex: PlayerAnimKey | number): number {
    if (typeof keyOrIndex === 'number') return keyOrIndex;
    const fragment = (PLAYER_ANIM_NAMES[keyOrIndex] ?? keyOrIndex).toLowerCase();
    const idx = this._clips.findIndex(g => g.name.toLowerCase().includes(fragment));
    if (idx === -1) {
      console.warn(`[AnimationSystem] no clip matching "${fragment}" for key "${keyOrIndex}"`);
    }
    return idx;
  }

  get activeIndex(): number { return this._activeIndex; }

  /**
   * Play animation by logical key, exact group name fragment, or raw index.
   * If the same clip is already playing, does nothing.
   */
  play(keyOrIndex: PlayerAnimKey | number, loop = true, speedRatio = 1.0): void {
    const index = this._resolve(keyOrIndex);
    if (index < 0 || index >= this._clips.length) return;
    if (this._activeIndex === index) return;  // already running

    this._active?.stop();
    this._active      = this._clips[index];
    this._activeIndex = index;
    this._active.start(loop, speedRatio, this._active.from, this._active.to, false);
  }

  /** Play a one-shot animation, then automatically revert to a loop clip. */
  playOnce(keyOrIndex: PlayerAnimKey | number, thenPlay: PlayerAnimKey | number = 'idle'): void {
    const index = this._resolve(keyOrIndex);
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
