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
  idle:               'idle',
  jogForward:         'jogforward',
  jogBack:            'jogbackward',
  strafeLeft:         'jogstrafeleft',
  strafeRight:        'jogstraferight',
  reception:          'chestreception',
  serve:              'serveleftfoot',
  kick2:              'rightfootkick',
  scissorKick:        'leftfootkick',
  scissorKickLeft:    'leftfootkick',
  header:             'centerheadkick',
  headerBall1:        'serveleftfoot',
  headerBall2:        'serverightfoot',
  jogBackDiag1:       'jogbackward',
  jogBackDiag2:       'jogbackward',
  jogFwdDiag1:        'jogforward',
  jogFwdDiag2:        'jogforward',
  kick1:              'rightfootkick',
  knee1:              'rightkneereception',
  knee1Left:          'leftkneereception',
  knee2:              'rightkneereception',
  serveLeft:          'serveleftfoot',
  serveRight:         'serverightfoot',
  headServeLeft:      'headserveleft',
  headServeRight:     'headserveright',
  chestKick:          'chestkick',
  chestReception:     'chestreception',
  closeTableLowHeader: 'leftheadkick',
  closeTableKickRight: 'rightfootkick',
  highKickLeft:       'leftfootkick',
  runningForward:     'jogforward',
  joggingQuickForward: 'jogforward',
  joggingStrafeQuick: 'jogstraferight',
  kneeReceptionRight: 'rightkneereception',
  soleKickRight:      'rightfootkick',
  toeReceptionRight:  'innerrightfootreception',
  bridgeReception1Left: 'innerrightfootreception',
  bicycleKickLeft:    'leftfootkick',
  jumpingHeaderKick:  'rightheadkick',
  celebration:        'celebration1',
  celebrationAlt:     'celebration2',
  defeat:             'defeat',
  extra:              'idle',
};

const PLAYER_ANIM_ALIASES: Record<string, string[]> = {
  idle:               ['idle'],
  jogForward:         ['jogforward', 'jog forward', 'running forward'],
  jogBack:            ['jogbackward', 'jog backward', 'backward'],
  strafeLeft:         ['jogstrafeleft', 'jog strafe left', 'strafe left'],
  strafeRight:        ['jogstraferight', 'jog strafe right', 'strafe right'],
  reception:          ['chestreception', 'reception'],
  serve:              ['serveleftfoot', 'serve'],
  kick2:              ['rightfootkick', 'kick'],
  scissorKick:        ['leftfootkick', 'scissor'],
  scissorKickLeft:    ['leftfootkick', 'scissor'],
  header:             ['centerheadkick', 'headkick'],
  headerBall1:        ['serveleftfoot'],
  headerBall2:        ['serverightfoot'],
  jogBackDiag1:       ['jogbackward'],
  jogBackDiag2:       ['jogbackward'],
  jogFwdDiag1:        ['jogforward'],
  jogFwdDiag2:        ['jogforward'],
  kick1:              ['rightfootkick', 'kick'],
  knee1:              ['rightkneereception', 'kneereception'],
  knee1Left:          ['leftkneereception'],
  knee2:              ['rightkneereception', 'kneereception'],
  serveLeft:          ['serveleftfoot'],
  serveRight:         ['serverightfoot'],
  headServeLeft:      ['headserveleft'],
  headServeRight:     ['headserveright'],
  chestKick:          ['chestkick', 'chest'],
  chestReception:     ['chestreception'],
  closeTableLowHeader: ['leftheadkick'],
  closeTableKickRight: ['rightfootkick'],
  highKickLeft:       ['leftfootkick'],
  runningForward:     ['jogforward'],
  joggingQuickForward: ['jogforward'],
  joggingStrafeQuick: ['jogstraferight'],
  kneeReceptionRight: ['rightkneereception'],
  soleKickRight:      ['rightfootkick'],
  toeReceptionRight:  ['innerrightfootreception'],
  bridgeReception1Left: ['innerrightfootreception'],
  bicycleKickLeft:    ['leftfootkick'],
  jumpingHeaderKick:  ['rightheadkick'],
  celebration:        ['celebration1', 'celebration'],
  celebrationAlt:     ['celebration2'],
  defeat:             ['defeat'],
  extra:              ['idle'],
};

// Kept for backwards compatibility — all resolve to -1 (name lookup) now.
export const PLAYER_ANIM = Object.fromEntries(
  Object.keys(PLAYER_ANIM_NAMES).map(k => [k, -1])
) as Record<string, number>;

export type PlayerAnimKey = keyof typeof PLAYER_ANIM_NAMES;

export interface CharacterAnimData {
  keyMap?: Record<string, string>;   // logical key → clip name fragment
  indexMap?: Record<string, number>; // logical key → exact clip index (overrides keyMap lookup)
}

const PLAYER_ANIM_ORDER: PlayerAnimKey[] = [
  'idle',
  'jogForward',
  'jogBack',
  'strafeLeft',
  'strafeRight',
  'header',
  'knee1',
  'knee1Left',
  'scissorKick',
  'scissorKickLeft',
  'kick2',
  'headerBall1',
  'headerBall2',
  'jogBackDiag1',
  'jogBackDiag2',
  'knee2',
  'serveLeft',
  'serveRight',
  'headServeLeft',
  'headServeRight',
  'chestKick',
  'chestReception',
  'closeTableLowHeader',
  'closeTableKickRight',
  'highKickLeft',
  'runningForward',
  'joggingQuickForward',
  'joggingStrafeQuick',
  'kneeReceptionRight',
  'soleKickRight',
  'toeReceptionRight',
  'bridgeReception1Left',
  'bicycleKickLeft',
  'jumpingHeaderKick',
  'extra',
];

const MOVEMENT_KEYS = new Set<PlayerAnimKey>([
  'idle',
  'jogForward',
  'jogBack',
  'strafeLeft',
  'strafeRight',
  'jogBackDiag1',
  'jogBackDiag2',
  'jogFwdDiag1',
  'jogFwdDiag2',
  'runningForward',
  'joggingQuickForward',
  'joggingStrafeQuick',
]);

const MOVEMENT_EXCLUDES = ['reception', 'receive', 'control', 'serve', 'kick', 'header', 'knee', 'scissor'];
const ACTION_EXCLUDES = ['jog', 'run', 'walk', 'strafe', 'move'];

interface BlendState {
  outgoing: AnimationGroup;
  incoming: AnimationGroup;
  elapsed: number;
  duration: number;
}

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
  private readonly _indexByKey = new Map<string, number>();

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
        (bone as unknown as { _linkedTransformNode?: TransformNode })._linkedTransformNode ?? null;
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
        const rawName: string = (ta.target as { name?: string })?.name ?? '';
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

  constructor(groups: AnimationGroup[], charData?: CharacterAnimData) {
    this._clips = groups;
    // Stop every group (Babylon auto-starts the first one on load)
    groups.forEach((g, i) => {
      g.stop();
      console.log(`[AnimationSystem] clip[${i}]: "${g.name}"`);
    });

    // Build a robust logical-key -> clip index mapping from GLB clip names.
    const keyMapSource = charData?.keyMap
      ? { ...PLAYER_ANIM_NAMES, ...charData.keyMap }
      : PLAYER_ANIM_NAMES;
    let mappedCount = 0;
    for (const key of Object.keys(keyMapSource)) {
      const preferred = keyMapSource[key]?.toLowerCase();
      const aliases = PLAYER_ANIM_ALIASES[key] ?? [];
      const candidates = preferred ? [preferred, ...aliases] : aliases;
      const idx = this._findBestClipIndex(
        candidates,
        MOVEMENT_KEYS.has(key) ? MOVEMENT_EXCLUDES : ACTION_EXCLUDES,
      );
      if (idx !== -1) {
        this._indexByKey.set(key, idx);
        mappedCount++;
        console.log(`[AnimationSystem] map "${key}" -> clip[${idx}] "${this._clips[idx].name}"`);
      } else {
        console.warn(`[AnimationSystem] no clip resolved for key "${key}"`);
      }
    }

    // Fallback for generic GLB names like "Armature.001|mixamo.com|Layer0":
    // bind unresolved logical actions to clip indices by export order.
    const max = Math.min(this._clips.length, PLAYER_ANIM_ORDER.length);
    if (mappedCount === 0) {
      console.warn('[AnimationSystem] no semantic clip names found; using full index-order fallback mapping');
    }
    for (let i = 0; i < max; i++) {
      const key = PLAYER_ANIM_ORDER[i];
      if (!this._indexByKey.has(key)) {
        this._indexByKey.set(key, i);
        console.log(`[AnimationSystem] fallback map "${key}" -> clip[${i}] "${this._clips[i].name}"`);
      }
    }

    // Apply exact index overrides only when explicit character metadata provides them.
    const indexMapSource = charData?.indexMap ?? null;
    if (indexMapSource) {
      const label = 'char';
      for (const [key, idx] of Object.entries(indexMapSource)) {
        if (idx !== undefined && idx >= 0 && idx < this._clips.length) {
          this._indexByKey.set(key, idx);
          console.log(`[AnimationSystem] ${label} map "${key}" -> clip[${idx}] "${this._clips[idx].name}"`);
        }
      }
    }
  }

  /** Strip everything except a-z 0-9 so 'Serve_Left_Foot', 'serve left foot',
   *  and 'serveleftfoot' all normalise to the same token. */
  private static _norm(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private _findBestClipIndex(fragments: string[], excludedFragments: string[] = []): number {
    if (fragments.length === 0) return -1;

    let bestIndex = -1;
    let bestScore = -1;
    for (let i = 0; i < this._clips.length; i++) {
      const name    = this._clips[i].name.toLowerCase();
      const nameN   = AnimationSystem._norm(this._clips[i].name);
      if (excludedFragments.some(fragment => fragment && name.includes(fragment))) {
        continue;
      }
      for (const fragment of fragments) {
        const f  = fragment.trim().toLowerCase();
        const fn = AnimationSystem._norm(fragment);
        if (!f) continue;
        // Primary: raw substring match; secondary: separator-agnostic match.
        if (name.includes(f) || nameN.includes(fn)) {
          // Longer/more specific fragment gets higher score.
          const score = fn.length;
          if (score > bestScore) {
            bestScore = score;
            bestIndex = i;
          }
        }
      }
    }
    return bestIndex;
  }

  /** Resolve logical key, raw name fragment, or index to a clip index. */
  private _resolve(keyOrIndex: PlayerAnimKey   | number): number {
    if (typeof keyOrIndex === 'number') return keyOrIndex;

    const direct = this._indexByKey.get(String(keyOrIndex));
    if (direct !== undefined) return direct;

    const fragment = String(keyOrIndex).toLowerCase();
    const idx = this._findBestClipIndex([fragment]);
    if (idx === -1) {
      console.warn(`[AnimationSystem] no clip matching "${fragment}" for key "${keyOrIndex}"`);
    }
    return idx;
  }

  get activeIndex(): number { return this._activeIndex; }

  /**
   * Returns the current frame of the active animation group (in the clip's native
   * frame units), or null if no clip is playing. Used to drive kinematic effects
   * that must be synchronized with the animation regardless of clip FPS.
   */
  getActiveMasterFrame(): number | null {
    if (!this._active) return null;
    const animatable = this._active.animatables?.[0];
    if (!animatable) return null;
    const f = animatable.masterFrame;
    return Number.isFinite(f) ? f : null;
  }

  /** Returns the active clip's `from` frame, or null if no clip is playing. */
  getActiveClipFrom(): number | null {
    return this._active ? this._active.from : null;
  }

  /** Returns the currently-playing AnimationGroup, or null. */
  getActiveGroup(): AnimationGroup | null {
    return this._active;
  }

  getClipByIndex(index: number): AnimationGroup | null {
    if (index < 0 || index >= this._clips.length) return null;
    return this._clips[index];
  }

  getClipByKey(keyOrIndex: PlayerAnimKey   | number): AnimationGroup | null {
    const index = this._resolve(keyOrIndex);
    if (index < 0 || index >= this._clips.length) return null;
    return this._clips[index];
  }

  /** Returns the GLB clip name for a given logical key, or null if unmapped. */
  getClipNameForKey(key: string): string | null {
    const idx = this._indexByKey.get(key);
    if (idx === undefined || idx < 0 || idx >= this._clips.length) return null;
    return this._clips[idx].name;
  }

  hasClip(keyOrIndex: PlayerAnimKey   | number): boolean {
    const index = this._resolve(keyOrIndex);
    return index >= 0 && index < this._clips.length;
  }

  getClipNames(): string[] {
    return this._clips.map(c => c.name);
  }

  /**
   * Play animation by logical key, exact group name fragment, or raw index.
   * If the same clip is already playing, does nothing.
   */
  play(keyOrIndex: PlayerAnimKey   | number, loop = true, speedRatio = 1.0, startFrameOffset = 0): void {
    const index = this._resolve(keyOrIndex);
    if (index < 0 || index >= this._clips.length) return;
    if (this._activeIndex === index) {
      if (this._active) this._active.speedRatio = speedRatio;
      return;  // already running; keep phase and only update rate
    }

    this._active?.stop();
    this._active      = this._clips[index];
    this._activeIndex = index;
    const safeOffset = Number.isFinite(startFrameOffset) ? Math.max(0, startFrameOffset) : 0;
    const safeStart = Math.min(this._active.to, this._active.from + safeOffset);
    this._active.start(loop, speedRatio, safeStart, this._active.to, false);
  }

  /** Play a one-shot animation, then automatically revert to a loop clip. */
  playOnce(
    keyOrIndex: PlayerAnimKey   | number,
    thenPlay: PlayerAnimKey   | number = 'idle',
    speedRatio = 1.0,
    onEnd?: () => void,
    startFrameOffset = 0,
    thenStartFrameOffset = 0,
  ): void {
    const index = this._resolve(keyOrIndex);
    if (index < 0 || index >= this._clips.length) return;

    this._active?.stop();
    const clip = this._clips[index];
    this._active      = clip;
    this._activeIndex = index;

    clip.onAnimationGroupEndObservable.addOnce(() => {
      onEnd?.();
      this.play(thenPlay, true, 1.0, thenStartFrameOffset);
    });

    const safeOffset = Number.isFinite(startFrameOffset) ? Math.max(0, startFrameOffset) : 0;
    const safeStart = Math.min(clip.to, clip.from + safeOffset);
    clip.start(false, speedRatio, safeStart, clip.to, false);
  }

  playByIndex(index: number, loop = true, speedRatio = 1.0, startFrameOffset = 0): void {
    this.play(index, loop, speedRatio, startFrameOffset);
  }

  playByIndexOnce(
    index: number,
    thenPlay: PlayerAnimKey   | number = 'idle',
    speedRatio = 1.0,
    onEnd?: () => void,
    startFrameOffset = 0,
    thenStartFrameOffset = 0,
  ): void {
    this.playOnce(index, thenPlay, speedRatio, onEnd, startFrameOffset, thenStartFrameOffset);
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
